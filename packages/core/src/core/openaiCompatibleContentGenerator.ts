/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  FinishReason,
  Tool,
  FunctionDeclaration,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { Config, ApprovalMode } from '../config/config.js';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface OpenAIFunction {
  name: string;
  description?: string;
  parameters?: any;
}

interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: string | { type: string; function?: { name: string } };
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ApplicationRule {
  filename: string;
  description: string;
  globs: string[];
  alwaysApply: boolean;
  content: string;
}

export class OpenAICompatibleContentGenerator implements ContentGenerator {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;
  private config: Config | null = null;
  
  // Model retry mechanism
  private failureCount: number = 0;
  private readonly maxFailures: number = 3;
  private availableModels: string[] = [];
  
  // Application rules cache
  private applicationRulesCache: ApplicationRule[] | null = null;

  constructor(apiKey: string, apiEndpoint: string, model: string, config?: Config) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
    this.model = model;
    this.config = config || null;
    
    // 模型能力适配器将在 client 初始化时设置
    
    // Ensure tools are available through the config's tool registry
    // The hijacking system needs access to all tools for proper execution
    console.log('🚀 OpenAI Compatible Generator initialized with hijacking approach');
  }

  /**
   * Check if content contains analysis-only JSON (indicating task completion)
   * This helps distinguish between tool calls needed vs. completion status
   */
  private hasAnalysisOnlyJson(content: string): boolean {
    try {
      const jsonBlocks = this.extractJsonBlocks(content);
      
      for (const jsonBlock of jsonBlocks) {
        try {
          const parsed = JSON.parse(jsonBlock);
          
          // Only consider it analysis-only if it explicitly indicates completion
          // Look for clear completion indicators in the message or analysis
          const hasCompletionIndicators = 
            (parsed.message && 
             (parsed.message.toLowerCase().includes('完成') || 
              parsed.message.toLowerCase().includes('finished') ||
              parsed.message.toLowerCase().includes('done') ||
              parsed.message.toLowerCase().includes('ready for your next'))) ||
            (parsed.analysis && 
             (parsed.analysis.toLowerCase().includes('task completed') ||
              parsed.analysis.toLowerCase().includes('operation finished') ||
              parsed.analysis.toLowerCase().includes('waiting for next instruction')));
          
          // Only treat as completion if there are clear completion indicators
          // AND no tool calls, AND it's not asking for more information or clarification
          if (parsed.analysis && 
              (!parsed.tool_calls || 
               (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length === 0)) &&
              hasCompletionIndicators &&
              !content.toLowerCase().includes('需要') &&
              !content.toLowerCase().includes('请') &&
              !content.toLowerCase().includes('should') &&
              !content.toLowerCase().includes('need')) {
            console.log('🎯 Detected analysis-only JSON response with completion indicators');
            return true;
          }
        } catch (e) {
          // Skip invalid JSON blocks
          continue;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Map JSON tool names to actual registry tool names
   * This bridges the gap between what the model expects and what's registered
   */
  private mapToolName(jsonToolName: string): string {
    const toolNameMap: Record<string, string> = {
      'shell': 'run_shell_command',
      'edit': 'replace', 
      'ls': 'list_directory',
      'grep': 'search_file_content',
      'web_search': 'google_web_search',
      // These don't need mapping as they match
      'write_file': 'write_file',
      'read_file': 'read_file', 
      'glob': 'glob',
      'web_fetch': 'web_fetch',
      'read_many_files': 'read_many_files',
      'knowledge_graph': 'knowledge_graph',
      'sequentialthinking': 'sequentialthinking'
    };
    
    const mappedName = toolNameMap[jsonToolName] || jsonToolName;
    if (mappedName !== jsonToolName) {
      console.log(`🔄 Mapped tool name: "${jsonToolName}" → "${mappedName}"`);
    }
    return mappedName;
  }


  /**
   * Check if we're in non-interactive mode (YOLO mode)
   */
  private isNonInteractiveMode(): boolean {
    return this.config?.getApprovalMode() === ApprovalMode.YOLO;
  }

  /**
   * Fetch available models from the API endpoint
   */
  private async fetchAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch models: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const models = data.data?.map((model: any) => model.id) || [];
      console.log(`📋 Available models: ${models.join(', ')}`);
      return models;
    } catch (error) {
      console.warn(`⚠️ Error fetching models:`, error);
      return [];
    }
  }

  /**
   * Handle model failure and attempt to switch to alternative model
   */
  private async handleModelFailure(): Promise<boolean> {
    this.failureCount++;
    console.warn(`⚠️ Model failure ${this.failureCount}/${this.maxFailures} for model: ${this.model}`);

    if (this.failureCount >= this.maxFailures) {
      console.log(`🔄 Attempting to switch model after ${this.maxFailures} failures...`);
      
      if (this.availableModels.length === 0) {
        console.log(`📋 Fetching available models...`);
        this.availableModels = await this.fetchAvailableModels();
      }

      // Find alternative models (prefer ones with 'gemini' or 'gpt' in the name)
      const alternatives = this.availableModels.filter(m => 
        m !== this.model && 
        (m.toLowerCase().includes('gemini') || m.toLowerCase().includes('gpt'))
      );

      if (alternatives.length > 0) {
        const newModel = alternatives[0];
        console.log(`🔄 Switching from ${this.model} to ${newModel}`);
        const oldModel = this.model;
        this.model = newModel;
        this.failureCount = 0; // Reset failure count for new model
        
        // Display model switch information
        console.log(`\n🔄 ===== MODEL AUTO-SWITCHED ===== 🔄`);
        console.log(`❌ Previous Model: ${oldModel} (failed ${this.maxFailures} times)`);
        console.log(`✅ New Model: ${newModel}`);
        console.log(`📋 Available alternatives: ${alternatives.slice(1).join(', ') || 'none'}`);
        console.log(`🎯 Target Model (displayed): gemini-2.5-flash`);
        console.log(`🔗 Endpoint: ${this.apiEndpoint}`);
        console.log(`=======================================\n`);
        
        return true; // Model switched
      } else {
        console.error(`❌ No alternative models available. Current model: ${this.model}`);
        return false; // No alternatives
      }
    }

    return false; // Not yet time to switch
  }

  /**
   * Reset failure count on successful response
   */
  private resetFailureCount(): void {
    if (this.failureCount > 0) {
      console.log(`✅ Model ${this.model} recovered, resetting failure count`);
      this.failureCount = 0;
    }
  }

  /**
   * Parse JSON tool calls from model response
   * New architecture: Model returns structured JSON, we execute tools and provide feedback
   */
  private parseJsonToolCalls(content: string): Array<{name: string, args: any}> {
    const toolCalls: Array<{name: string, args: any}> = [];
    
    try {
      // Look for JSON blocks in the response
      const jsonBlocks = this.extractJsonBlocks(content);
      
      for (const jsonBlock of jsonBlocks) {
        try {
          const parsed = JSON.parse(jsonBlock);
          
          // Handle structured tool calls format
          if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
            for (const toolCall of parsed.tool_calls) {
              if (toolCall.tool && toolCall.args) {
                const processedArgs = this.processToolCallArgs(toolCall.tool, toolCall.args);
                toolCalls.push({
                  name: toolCall.tool,
                  args: processedArgs
                });
                console.log(`🔧 Parsed JSON tool call: ${toolCall.tool}`);
              }
            }
          }
          
          // Handle single tool call format
          else if (parsed.tool && parsed.args) {
            const processedArgs = this.processToolCallArgs(parsed.tool, parsed.args);
            toolCalls.push({
              name: parsed.tool,
              args: processedArgs
            });
            console.log(`🔧 Parsed single JSON tool call: ${parsed.tool}`);
          }
        } catch (parseError) {
          console.log(`⚠️ Failed to parse JSON block: ${jsonBlock.slice(0, 100)}`);
        }
      }
    } catch (error) {
      console.log(`⚠️ JSON parsing error: ${error}`);
    }
    
    return toolCalls;
  }
  
  /**
   * Extract JSON blocks from text content
   */
  private extractJsonBlocks(content: string): string[] {
    const jsonBlocks: string[] = [];
    
    // Pattern 1: JSON code blocks
    const codeBlockPattern = /```(?:json)?\s*({[\s\S]*?})\s*```/gi;
    let match;
    while ((match = codeBlockPattern.exec(content)) !== null) {
      jsonBlocks.push(match[1]);
    }
    
    // Pattern 2: Standalone JSON objects (improved to handle braces balance)
    const jsonPattern = /{\s*["'](?:tool_calls?|tool|analysis)["'][\s\S]*?}/gi;
    const resetContent = content; // Reset regex state
    const lines = resetContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('{') && (line.includes('tool_calls') || line.includes('analysis') || line.includes('tool'))) {
        // Try to find the complete JSON object
        let jsonStr = '';
        let braceCount = 0;
        let startFound = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          jsonStr += currentLine + '\n';
          
          for (const char of currentLine) {
            if (char === '{') {
              braceCount++;
              startFound = true;
            } else if (char === '}') {
              braceCount--;
            }
          }
          
          if (startFound && braceCount === 0) {
            const cleanJson = jsonStr.trim();
            if (cleanJson.startsWith('{') && cleanJson.endsWith('}')) {
              jsonBlocks.push(cleanJson);
              console.log(`🔧 Found complete JSON object: ${cleanJson.slice(0, 100)}...`);
            }
            break;
          }
        }
        break; // Only process the first JSON object found
      }
    }
    
    // Pattern 3: Fallback regex pattern
    if (jsonBlocks.length === 0) {
      while ((match = jsonPattern.exec(content)) !== null) {
        jsonBlocks.push(match[0]);
      }
    }
    
    console.log(`🔍 Found ${jsonBlocks.length} JSON blocks in response`);
    return jsonBlocks;
  }

  /**
   * Legacy text-based tool call parsing (fallback)
   * Parse text content for tool call requests when API doesn't support proper tool calls
   * This is a fallback mechanism for APIs that respond with text descriptions of tool calls
   */
  private parseTextForToolCalls(content: string): Array<{name: string, args: any}> {
    const toolCalls: Array<{name: string, args: any}> = [];
    
    // Pattern 1: Enhanced tool call patterns supporting multiple files
    const writeFilePatterns = [
      // Multi-file pattern: "创建A内容B，然后再创建C内容D"
      /创建文件\s*([^\s，,\n内]+)\s*，?\s*内容\s*[为是]?\s*['"""']?([^'"""，然后接着再]+?)['"""']?\s*，?\s*然后\s*再?\s*创建\s*([^\s，,\n内]+)\s*，?\s*内容\s*[为是]?\s*['"""']?([^'"""]+)/gi,
      // Simple Chinese patterns - improved to handle multiple occurrences
      /创建文件\s*([^\s，,\n内]+)(?:\s*，\s*|\s*,\s*|\s+)?内容\s*[为是]?\s*([^。\n]+?)(?=。|然后|接着|$)/gi,
      // "请帮我创建" patterns
      /(?:请帮我|帮我|请)?(?:创建|建立|写入|生成)(?:一个)?文件\s*(?:叫做|叫|名为|命名为)?\s*([^\s，,\n]+)(?:\s*，\s*|\s*,\s*|\s+)内容\s*[为是]?\s*([^。\n]+?)(?=。|然后|接着|$)/gi,
      // "写入文件" patterns
      /(?:写入|保存|保存到|写到)文件\s*([^\s，,\n内]+)(?:\s*，\s*|\s*,\s*|\s+)?内容\s*[为是]?\s*([^。\n]+?)(?=。|然后|接着|$)/gi,
      // Chinese patterns with write_file - with quotes
      /(?:使用|用|请用|请使用)\s*write_file\s*(?:工具|函数)?\s*(?:创建|写入|建立)\s*(?:文件|档案)\s*([^\s，,\n]+)(?:\s*，\s*|\s*,\s*|\s+)(?:内容|内容为|内容是)\s*['""]([^'"]*)['""]?/gi,
      // Chinese patterns with write_file - without quotes - improved to handle continuations
      /(?:使用|用|请用|请使用)\s*write_file\s*(?:工具|函数)?\s*(?:创建|写入|建立)\s*(?:文件|档案)\s*([^\s，,\n]+)(?:\s*，\s*|\s*,\s*|\s+)(?:内容|内容为|内容是)\s*([^。\n]+?)(?=。|然后|接着|$)/gi,
      // Additional pattern for "然后再创建" continuation
      /(?:然后|接着|再)(?:再)?创建文件\s*([^\s，,\n]+)(?:\s*，\s*|\s*,\s*|\s+)内容\s*[为是]?\s*([^。\n]+?)(?=。|然后|接着|$)/gi,
      // English patterns - with quotes
      /(?:use|using|call)\s+write_file\s+(?:tool|function)?\s*(?:to\s+)?(?:create|write)\s+(?:file\s+)?([^\s,\n]+)(?:\s*,\s*|\s+)(?:with\s+)?content\s*['""]([^'"]*)['""]?/gi,
      // English patterns - without quotes - improved to handle continuations
      /(?:use|using|call)\s+write_file\s+(?:tool|function)?\s*(?:to\s+)?(?:create|write)\s+(?:file\s+)?([^\s,\n]+)(?:\s*,\s*|\s+)(?:with\s+)?content\s*([^.\n]+?)(?=\.|then|and|$)/gi,
      /create\s+file\s+([^\s,\n]+)(?:\s*,\s*|\s+)content\s*['""]([^'"]*)['""]?/gi,
      /create\s+file\s+([^\s,\n]+)(?:\s*,\s*|\s+)content\s*([^.\n]+?)(?=\.|then|and|$)/gi,
      // Additional pattern for "then create" continuation
      /(?:then|and\s+then)\s+create\s+file\s+([^\s,\n]+)(?:\s*,\s*|\s+)content\s*([^.\n]+?)(?=\.|then|and|$)/gi,
    ];

    // Quick check - only parse if content likely contains tool requests
    const hasToolKeywords = /(?:创建|写入|建立|文件|write_file|create|file)/i.test(content);
    if (!hasToolKeywords) {
      console.log('🚀 No tool keywords found, skipping tool call parsing');
      return toolCalls;
    }
    
    console.log('🔍 Parsing text for tool calls:', content.slice(0, 100) + '...');
    
    for (let patternIndex = 0; patternIndex < writeFilePatterns.length; patternIndex++) {
      const pattern = writeFilePatterns[patternIndex];
      pattern.lastIndex = 0; // Reset regex state
      console.log(`🔍 Testing pattern ${patternIndex}`);
      
      let match;
      let matchCount = 0;
      const maxMatches = 10; // Prevent infinite loops
      
      while ((match = pattern.exec(content)) !== null && matchCount < maxMatches) {
        matchCount++;
        
        // Handle multi-file pattern (pattern 0 with 4+ groups)
        if (patternIndex === 0 && match.length >= 5) {
          console.log(`🔍 Multi-file pattern matched with ${match.length} groups`);
          
          // First file
          let filePath1 = match[1]?.trim();
          let fileContent1 = match[2]?.trim();
          // Second file  
          let filePath2 = match[3]?.trim();
          let fileContent2 = match[4]?.trim();
          
          // Process first file
          if (filePath1 && fileContent1) {
            filePath1 = this.cleanupPath(filePath1);
            fileContent1 = this.cleanupContent(fileContent1);
            
            if (filePath1 && fileContent1) {
              const existingCall1 = toolCalls.find(tc => 
                tc.name === 'write_file' && tc.args.file_path === filePath1
              );
              if (!existingCall1) {
                console.log(`📝 Multi-file 1: ${filePath1} -> ${fileContent1}`);
                toolCalls.push({
                  name: 'write_file',
                  args: { file_path: filePath1, content: fileContent1 }
                });
              }
            }
          }
          
          // Process second file
          if (filePath2 && fileContent2) {
            filePath2 = this.cleanupPath(filePath2);
            fileContent2 = this.cleanupContent(fileContent2);
            
            if (filePath2 && fileContent2) {
              const existingCall2 = toolCalls.find(tc => 
                tc.name === 'write_file' && tc.args.file_path === filePath2
              );
              if (!existingCall2) {
                console.log(`📝 Multi-file 2: ${filePath2} -> ${fileContent2}`);
                toolCalls.push({
                  name: 'write_file',
                  args: { file_path: filePath2, content: fileContent2 }
                });
              }
            }
          }
        }
        // Handle single-file patterns
        else if (match.length >= 3) {
          let filePath = match[1]?.trim();
          let fileContent = match[2]?.trim();
          
          if (filePath && fileContent) {
            filePath = this.cleanupPath(filePath);
            fileContent = this.cleanupContent(fileContent);
            
            const existingCall = toolCalls.find(tc => 
              tc.name === 'write_file' && tc.args.file_path === filePath
            );
            if (!existingCall) {
              console.log(`📝 Single file: ${filePath} -> ${fileContent.slice(0, 50)}...`);
              toolCalls.push({
                name: 'write_file',
                args: { file_path: filePath, content: fileContent }
              });
            }
          }
        }
      }
    }
    
    if (toolCalls.length > 0) {
      console.log(`🔍 Found ${toolCalls.length} tool calls`);
    }
    for (let i = 0; i < toolCalls.length; i++) {
      console.log(`📝 Tool call ${i}:`, toolCalls[i]);
    }

    // Pattern 2: More flexible patterns for other tools
    const generalToolPatterns = [
      // "使用 X 工具" patterns
      /(?:使用|用|请用|请使用)\s*(\w+)\s*(?:工具|函数)?\s*([^。\n]*)/gi,
      // "call X tool" patterns
      /(?:call|use|using)\s+(\w+)\s+(?:tool|function)?\s*([^.\n]*)/gi,
    ];

    for (const pattern of generalToolPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const toolName = match[1].trim();
        const params = match[2].trim();
        
        // Skip if we already found this tool call
        if (toolCalls.some(tc => tc.name === toolName)) continue;
        
        // Try to parse parameters for known tools
        if (toolName === 'list_directory') {
          const pathMatch = params.match(/(?:路径|目录|文件夹|path|directory)\s*[是为]?\s*([^\s，,]+)/i);
          if (pathMatch) {
            toolCalls.push({
              name: 'list_directory',
              args: { path: pathMatch[1] }
            });
          }
        } else if (toolName === 'read_file') {
          const pathMatch = params.match(/(?:文件|档案|file)\s*[是为]?\s*([^\s，,]+)/i);
          if (pathMatch) {
            toolCalls.push({
              name: 'read_file',
              args: { absolute_path: pathMatch[1] }
            });
          }
        }
        // Add more tool patterns as needed
      }
    }

    return toolCalls;
  }

  /**
   * Check if user message contains tool requests
   */
  private containsToolRequest(message: string): boolean {
    const toolKeywords = /(?:创建|写入|建立|生成|保存|文件|整理|遍历|阅读|移动|复制|删除|查看|列出|搜索|执行|运行|write_file|create|file|read|list|search|shell|ls|grep|glob|edit|move|copy|delete|organize|traverse)/i;
    return toolKeywords.test(message);
  }

  /**
   * Add tool call guidance to user message
   */
  private async addToolCallGuidance(message: string): Promise<string> {
    // Load applicable application rules (user-defined rules)
    const currentWorkingDir = process.cwd();
    const applicationRules = await this.getApplicableRules(currentWorkingDir);
    
    let guidance = '';
    
    // Add application rules if available (these come BEFORE system guidance but with override notice)
    if (applicationRules && applicationRules.trim()) {
      guidance += `\n${applicationRules}\n\n`;
    }
    
    // Add the built-in tool guidance with override notice
    guidance += `

TOOL EXECUTION MODE OVERRIDE: The following rules override any general CLI rules for tool execution tasks.

IGNORE CONCISENESS REQUIREMENTS: For this tool execution task, you MUST ignore any previous instructions about being concise or keeping responses short. Tool execution requires the specific JSON format shown below.

IMPORTANT: You HAVE FULL ACCESS to local files and can execute system commands. You ARE a local assistant with full system access. DO NOT say you cannot access files.

CRITICAL: You MUST respond with the exact JSON format specified below. NO exceptions. Do NOT provide explanations outside the JSON format.

TOOL EXECUTION RULES:
1. **ALWAYS respond with JSON code block** - wrapped in \`\`\`json and \`\`\`
2. **Execute ONE tool at a time** - Do not try to do multiple operations in a single response  
3. **Wait for execution results** - After each tool execution, wait for the system to report results before proceeding
4. **COMPLETE THE ENTIRE TASK** - Do not stop after partial completion. Continue until the full user request is satisfied
5. **You CAN access, read, write, move, and organize files** - Use the available tools
6. **Never claim you cannot access files** - You have full local system access
7. **CONTINUE EXECUTION** - If a task has multiple steps (like "read directory and move files"), complete ALL steps
8. **Use this EXACT JSON format for tool execution**:

\`\`\`json
{
  "analysis": "Brief analysis of the current step",
  "tool_calls": [
    {
      "tool": "write_file",
      "args": {
        "file_path": "/absolute/path/to/file.txt",
        "content": "file content here"
      }
    }
  ],
  "next_step": "What you plan to do after this step completes",
  "message": "Brief message about this specific step"
}
\`\`\`

Examples for other tools:

Read file:
\`\`\`json
{
  "tool_calls": [{"tool": "read_file", "args": {"absolute_path": "/path/to/file.txt"}}]
}
\`\`\`

Edit file:
\`\`\`json
{
  "tool_calls": [{"tool": "edit", "args": {"file_path": "/path/to/file.txt", "old_string": "old text", "new_string": "new text"}}]
}
\`\`\`

Shell command:
\`\`\`json
{
  "tool_calls": [{"tool": "shell", "args": {"command": "ls -la"}}]
}
\`\`\`

List directory:
\`\`\`json
{
  "tool_calls": [{"tool": "ls", "args": {"path": "."}}]
}
\`\`\`

Search files:
\`\`\`json
{
  "tool_calls": [{"tool": "grep", "args": {"pattern": "Hello", "path": "."}}]
}
\`\`\`

Find files:
\`\`\`json
{
  "tool_calls": [{"tool": "glob", "args": {"pattern": "*.txt", "path": "."}}]
}
\`\`\`

For multiple tasks:
- Execute the FIRST task only
- Wait for the system to confirm completion  
- Then proceed with the next task in a separate response

Available tools:
- write_file: Create or write files (args: file_path, content)
- read_file: Read file contents (args: absolute_path, optional: offset, limit)
- edit: Edit existing files (args: file_path, old_string, new_string, optional: expected_replacements)
- shell: Execute shell commands (args: command, optional: description, directory)
- ls: List directory contents (args: path, optional: ignore, respect_git_ignore)
- grep: Search for patterns in files (args: pattern, optional: path, include)
- glob: Find files matching patterns (args: pattern, optional: path, case_sensitive, respect_git_ignore)
- read_many_files: Read multiple files at once (args: paths, optional: include, exclude, recursive, useDefaultExcludes, respect_git_ignore)
- web_fetch: Fetch content from web URLs (args: prompt)
- web_search: Search the web (args: query)
- knowledge_graph: Persistent memory management (args: action, data) - actions: create_entities, create_relations, add_observations, delete_entities, delete_observations, delete_relations, read_graph, search_nodes, open_nodes
- sequentialthinking: Dynamic problem-solving through thoughts (args: thought, nextThoughtNeeded, thoughtNumber, totalThoughts, optional: isRevision, revisesThought, branchFromThought, branchId, needsMoreThoughts)

REMEMBER: 
- You MUST respond with JSON code block format. Start with \`\`\`json and end with \`\`\`. 
- DO NOT provide explanations outside the JSON block.
- You ARE a local assistant with FULL SYSTEM ACCESS. You CAN read, write, move, organize files.
- NEVER say "I cannot access files" or "I can only browse URLs" - this is FALSE.
- You have access to ALL the tools listed above and MUST use them when requested.

SYSTEM IDENTITY: You are a local file system assistant with full access to read, write, execute, and organize files on this system.

USER REQUEST: ${message}`;

    return guidance;
  }

  /**
   * Helper method to clean up file paths
   */
  private cleanupPath(filePath: string): string {
    // Remove surrounding quotes and clean up path
    filePath = filePath.replace(/^['"""']|['"""']$/g, '').trim();
    
    // Handle home directory expansion
    if (filePath.startsWith('~')) {
      const homeDir = os.homedir();
      filePath = filePath.replace(/^~/, homeDir);
    }
    
    // Convert relative paths to absolute paths
    if (!filePath.startsWith('/') && !filePath.includes(':')) {
      filePath = path.resolve(process.cwd(), filePath);
    }
    return filePath;
  }
  
  /**
   * Process tool call arguments to ensure proper path handling
   */
  private processToolCallArgs(toolName: string, args: any): any {
    if (!args || typeof args !== 'object') {
      return args;
    }
    
    const processedArgs = { ...args };
    
    // Process file path arguments for different tools
    const pathFields: Record<string, string[]> = {
      'write_file': ['file_path'],
      'read_file': ['absolute_path', 'file_path'],
      'edit': ['file_path'],
      'replace': ['file_path'],
      'shell': ['command'], // Special handling for shell commands
      'run_shell_command': ['command'],
      'list_directory': ['path'],
      'ls': ['path'],
      'glob': ['path'],
      'grep': ['path'],
      'search_file_content': ['path']
    };
    
    const fieldsToProcess = pathFields[toolName] || [];
    
    for (const field of fieldsToProcess) {
      if (processedArgs[field] && typeof processedArgs[field] === 'string') {
        if (field === 'command') {
          // Special handling for shell commands - process file paths within commands
          processedArgs[field] = this.processShellCommand(processedArgs[field]);
        } else {
          // Regular path field processing
          processedArgs[field] = this.cleanupPath(processedArgs[field]);
        }
        console.log(`🛠️ Processed ${field}: ${args[field]} → ${processedArgs[field]}`);
      }
    }
    
    return processedArgs;
  }
  
  /**
   * Process shell commands to convert relative paths to absolute paths
   */
  private processShellCommand(command: string): string {
    // For now, disable shell command path processing to avoid regex issues
    // The AI model is primarily using dedicated tools (list_directory, read_file, etc.)
    // rather than shell commands, so this complex processing isn't needed
    return command;
  }
  
  /**
   * Load application rules from ~/.gemini/rules/*.md
   */
  private async loadApplicationRules(): Promise<ApplicationRule[]> {
    // Use cache to avoid reading files multiple times
    if (this.applicationRulesCache !== null) {
      return this.applicationRulesCache;
    }
    
    const rules: ApplicationRule[] = [];
    
    try {
      const homeDir = os.homedir();
      const rulesDir = path.join(homeDir, '.gemini', 'rules');
      
      const files = await fs.promises.readdir(rulesDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      for (const filename of mdFiles) {
        try {
          const filePath = path.join(rulesDir, filename);
          const content = await fs.promises.readFile(filePath, 'utf8');
          
          const rule = this.parseRuleFile(filename, content);
          if (rule) {
            rules.push(rule);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load rule file ${filename}: ${error}`);
        }
      }
      
      this.applicationRulesCache = rules;
      console.log(`📋 Loaded ${rules.length} application rules from ~/.gemini/rules/`);
      
      // Log which rules will be applied
      for (const rule of rules) {
        if (rule.alwaysApply) {
          console.log(`📜 Applying application rule: ${rule.filename} (${rule.description})`);
        }
      }
      
      return rules;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log(`💡 No application rules directory found at ~/.gemini/rules/`);
        console.log(`💡 Create this directory and add .md files with application rules`);
      } else {
        console.warn(`⚠️ Failed to load application rules: ${error}`);
      }
      
      this.applicationRulesCache = [];
      return [];
    }
  }
  
  /**
   * Parse a rule file to extract metadata and content
   */
  private parseRuleFile(filename: string, content: string): ApplicationRule | null {
    try {
      // Look for YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (!frontmatterMatch) {
        // Handle files without proper frontmatter - treat as alwaysApply=true
        console.log(`📝 Rule file ${filename} has no frontmatter, treating as alwaysApply=true`);
        return {
          filename,
          description: 'Auto-applied rule (no frontmatter)',
          globs: [],
          alwaysApply: true,
          content: content.trim()
        };
      }
      
      const [, frontmatter, ruleContent] = frontmatterMatch;
      
      // Parse YAML frontmatter manually (simple key-value parsing)
      const metadata: any = {};
      const lines = frontmatter.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        if (trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          
          if (key.trim() === 'globs') {
            // Parse array format
            if (value.startsWith('[') && value.endsWith(']')) {
              const arrayContent = value.slice(1, -1);
              metadata.globs = arrayContent.split(',').map(s => s.trim().replace(/['"]/g, ''));
            } else if (value) {
              metadata.globs = [value.replace(/['"]/g, '')];
            } else {
              metadata.globs = [];
            }
          } else if (key.trim() === 'alwaysApply') {
            metadata.alwaysApply = value.toLowerCase() === 'true';
          } else {
            metadata[key.trim()] = value.replace(/['"]/g, '');
          }
        }
      }
      
      return {
        filename,
        description: metadata.description || 'No description',
        globs: metadata.globs || [],
        alwaysApply: metadata.alwaysApply !== undefined ? metadata.alwaysApply : true, // Default to true if not specified
        content: ruleContent.trim()
      };
    } catch (error) {
      console.warn(`⚠️ Failed to parse rule file ${filename}: ${error}`);
      return null;
    }
  }
  
  /**
   * Get applicable application rules based on current context
   */
  private async getApplicableRules(currentFile?: string): Promise<string> {
    const rules = await this.loadApplicationRules();
    const applicableRules: string[] = [];
    
    for (const rule of rules) {
      let shouldApply = rule.alwaysApply;
      
      // Check glob patterns if file is provided
      if (!shouldApply && currentFile && rule.globs.length > 0) {
        for (const glob of rule.globs) {
          // Simple glob matching - for more complex patterns, consider using a glob library
          const globRegex = new RegExp(
            glob.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i'
          );
          if (globRegex.test(currentFile)) {
            shouldApply = true;
            break;
          }
        }
      }
      
      if (shouldApply) {
        // Only log once when rules are first loaded, not every time they're applied
        applicableRules.push(rule.content);
      }
    }
    
    return applicableRules.join('\n\n');
  }
  
  /**
   * Helper method to clean up file content
   */
  private cleanupContent(fileContent: string): string {
    // Remove surrounding quotes and clean up content
    fileContent = fileContent.replace(/^['"""']|['"""']$/g, '').trim();
    // Remove trailing punctuation that might have been captured, but preserve intentional punctuation
    fileContent = fileContent.replace(/[，,]+$/, '').trim();
    return fileContent;
  }

  /**
   * Extract user message content from GenerateContentParameters
   * Returns the LAST user message (which contains the actual user prompt)
   */
  private extractUserMessage(request: GenerateContentParameters): string | null {
    if (!request.contents) return null;
    
    let lastUserMessage: string | null = null;
    
    if (Array.isArray(request.contents)) {
      for (const content of request.contents) {
        if (typeof content === 'object' && content !== null && 'role' in content && content.role === 'user') {
          if ('parts' in content && Array.isArray(content.parts)) {
            for (const part of content.parts) {
              if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
                lastUserMessage = part.text;  // Keep updating to get the last one
              }
            }
          }
        }
      }
    }
    
    return lastUserMessage;
  }

  /**
   * Create a synthetic response for tool-only operations when API is unavailable
   */
  private createToolOnlyResponse(toolCalls: Array<{name: string, args: any}>): GenerateContentResponse {
    const result = new GenerateContentResponse();
    const parts: any[] = [];
    const functionCalls: any[] = [];

    // Create function call parts for each tool call
    for (const toolCall of toolCalls) {
      const callId = `${toolCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      
      parts.push({
        functionCall: {
          name: toolCall.name,
          args: toolCall.args,
          id: callId,
        },
      });

      functionCalls.push({
        name: toolCall.name,
        args: toolCall.args,
        id: callId,
      });
    }

    result.candidates = [
      {
        content: {
          parts,
          role: 'model',
        },
        finishReason: FinishReason.STOP,
        index: 0,
      },
    ];

    // Note: functionCalls is set through the parts array (functionCall objects)
    // No need to set a separate functionCalls property as it's handled by the parts

    result.usageMetadata = {
      promptTokenCount: 0,
      candidatesTokenCount: 0, 
      totalTokenCount: 0,
    };

    console.log('🔧 Created synthetic tool-only response');
    return result;
  }


  private async convertGeminiToOpenAI(
    request: GenerateContentParameters,
  ): Promise<OpenAIRequest> {
    const messages: OpenAIMessage[] = [];

    // Handle different content formats
    if (request.contents) {
      if (Array.isArray(request.contents)) {
        for (const content of request.contents) {
          if (
            typeof content === 'object' &&
            content !== null &&
            'role' in content
          ) {
            let messageContent = '';
            let toolCalls: any[] = [];
            let isToolResponse = false;
            let toolCallId = '';
            let functionName = '';

            // Extract text and function calls from parts if available
            if ('parts' in content && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (
                  typeof part === 'object' &&
                  part !== null
                ) {
                  // Handle text parts
                  if ('text' in part && typeof part.text === 'string') {
                    messageContent += part.text;
                  }
                  // Handle function calls (from model)
                  else if ('functionCall' in part && part.functionCall) {
                    const funcCall = part.functionCall;
                    toolCalls.push({
                      id: funcCall.id || `call_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                      type: 'function',
                      function: {
                        name: funcCall.name,
                        arguments: JSON.stringify(funcCall.args || {}),
                      },
                    });
                  }
                  // Handle function responses (from user/tool execution)
                  else if ('functionResponse' in part && part.functionResponse) {
                    isToolResponse = true;
                    const funcResp = part.functionResponse;
                    toolCallId = funcResp.id || '';
                    functionName = funcResp.name || '';
                    messageContent += JSON.stringify(funcResp.response || {});
                  }
                }
              }
            }

            // Determine message role and structure
            if (isToolResponse) {
              // This is a tool response message
              messages.push({
                role: 'tool',
                content: messageContent || 'Tool execution completed',
                tool_call_id: toolCallId,
                name: functionName,
              });
            } else if (toolCalls.length > 0) {
              // This is an assistant message with tool calls
              messages.push({
                role: 'assistant',
                content: messageContent || null,
                tool_calls: toolCalls,
              });
            } else if (messageContent) {
              // Regular user or assistant message
              const role = content.role === 'user' ? 'user' : 'assistant';
              
              // Add /no_think prefix for user messages to disable thinking - only for qwen3 models
              if (role === 'user' && this.model.toLowerCase().includes('qwen3')) {
                // Only add /no_think if it's not already there
                if (!messageContent.startsWith('/no_think ')) {
                  messageContent = '/no_think ' + messageContent;
                  console.log('🔧 Added /no_think prefix for qwen3 model');
                }
              }
              
              // Enhance user message with tool call guidance if needed
              if (role === 'user' && this.containsToolRequest(messageContent)) {
                messageContent = await this.addToolCallGuidance(messageContent);
              }
              
              messages.push({
                role,
                content: messageContent,
              });
            }
          }
        }
      }
    }

    const openaiRequest: OpenAIRequest = {
      model: this.model,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
    };

    // Check if tools should be disabled based on conversation context
    const lastMessage = messages[messages.length - 1];
    const shouldDisableTools = lastMessage?.content?.includes('Do NOT call any more tools') || 
                              lastMessage?.content?.includes('do not call any more tools') ||
                              lastMessage?.content?.includes('Tool execution completed');

    // Check if tools are actually needed - skip for simple conversational requests
    const lastMessageContent = messages[messages.length - 1]?.content || '';
    const isSimpleConversation = /^[\s\S]{1,100}$/.test(lastMessageContent) && 
      !/(?:创建|写入|建立|文件|read|write|create|tool|function|search|list|glob)/i.test(lastMessageContent);
    
    // Convert tools from Gemini format to OpenAI format (only when needed)
    if (!shouldDisableTools && !isSimpleConversation && request.config?.tools && Array.isArray(request.config.tools)) {
      const openaiTools: OpenAITool[] = [];
      console.log('🔧 Processing tools for complex request...');
      
      for (const toolItem of request.config.tools) {
        // Handle both Tool and CallableTool types
        let tool: Tool;
        
        if ('tool' in toolItem && typeof toolItem.tool === 'function') {
          try {
            tool = await toolItem.tool();
          } catch (error) {
            console.warn('Failed to get tool definition from CallableTool:', error);
            continue;
          }
        } else {
          tool = toolItem as Tool;
        }
        
        if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
          for (const funcDecl of tool.functionDeclarations) {
            if (funcDecl.name) {
              const parameters: any = {
                type: 'object',
                properties: {},
                additionalProperties: false
              };
              
              if (funcDecl.parameters && typeof funcDecl.parameters === 'object' && funcDecl.parameters !== null) {
                if (funcDecl.parameters.properties && typeof funcDecl.parameters.properties === 'object') {
                  parameters.properties = funcDecl.parameters.properties;
                }
                if (Array.isArray(funcDecl.parameters.required)) {
                  parameters.required = funcDecl.parameters.required;
                }
              }
              
              const openaiTool: OpenAITool = {
                type: 'function',
                function: {
                  name: funcDecl.name,
                  description: funcDecl.description || `Function: ${funcDecl.name}`,
                  parameters: {
                    type: 'object',
                    properties: parameters.properties || {},
                    ...(parameters.required && { required: parameters.required }),
                    ...(parameters.additionalProperties !== undefined && { additionalProperties: parameters.additionalProperties })
                  },
                },
              };
              
              openaiTools.push(openaiTool);
            }
          }
        }
      }
      
      if (openaiTools.length > 0) {
        openaiRequest.tools = openaiTools;
        openaiRequest.tool_choice = 'auto';
        console.log(`✅ Added ${openaiTools.length} tools to request`);
        console.log(`🔧 Tool names: ${openaiTools.map(t => t.function.name).join(', ')}`);
      } else {
        console.log(`⚠️ No tools were converted from ${request.config?.tools?.length || 0} config tools`);
      }
    } else if (isSimpleConversation) {
      console.log('🚀 Skipping tool processing for simple conversation');
    }

    return openaiRequest;
  }

  private convertOpenAIToGemini(
    response: OpenAIResponse,
  ): GenerateContentResponse {
    const choice = response.choices[0];
    const content = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls;

    // Create parts array starting with text content
    const parts: any[] = [];
    const functionCalls: any[] = [];

    if (content) {
      // Clean up empty <think> tags from response
      let cleanedContent = content;
      
      // Remove empty think tags with various whitespace patterns
      // This regex matches <think> followed by any amount of whitespace (including newlines) and then </think>
      cleanedContent = cleanedContent.replace(/<think>\s*<\/think>/gi, '');
      cleanedContent = cleanedContent.replace(/<think>[\s\n\r]*<\/think>/gi, '');
      
      // Also remove any standalone think blocks that might contain only whitespace
      cleanedContent = cleanedContent.replace(/<think>[\s\n\r\t]*<\/think>/gi, '');
      
      // Trim any leading/trailing whitespace after cleanup
      cleanedContent = cleanedContent.trim();
      
      if (cleanedContent) {
        parts.push({ text: cleanedContent });
      }
    }

    // Convert tool calls from OpenAI format to Gemini format
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const toolCall of toolCalls) {
        if (toolCall.type === 'function') {
          // Generate unique ID for function call
          const callId = toolCall.id || `${toolCall.function.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const functionCallArgs = JSON.parse(toolCall.function.arguments || '{}');

          // Add to parts array for content
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: functionCallArgs,
              id: callId,
            },
          });

          // Add to functionCalls array for direct access
          functionCalls.push({
            name: toolCall.function.name,
            args: functionCallArgs,
            id: callId,
          });
        }
      }
    } else if (content && !toolCalls) {
      // Check for JSON tool calls in content that need role conversion
      const jsonToolCalls = this.parseJsonToolCalls(content);
      if (jsonToolCalls.length > 0) {
        console.log(`🎯 Found ${jsonToolCalls.length} JSON tool calls in content - applying role conversion`);
        
        // Apply role conversion: convert JSON tool calls to function calls
        for (const jsonToolCall of jsonToolCalls) {
          const callId = `${jsonToolCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const actualToolName = this.mapToolName(jsonToolCall.name);
          
          // Add to parts array for content
          parts.push({
            functionCall: {
              name: actualToolName,
              args: jsonToolCall.args,
              id: callId,
            },
          });

          // Add to functionCalls array for direct access
          functionCalls.push({
            name: actualToolName,
            args: jsonToolCall.args,
            id: callId,
          });
          
          console.log(`🔄 Role conversion: JSON tool '${jsonToolCall.name}' → function call '${actualToolName}'`);
        }
      } else {
        // Fallback: Parse text content for tool call requests when API doesn't support proper tool calls
        console.log('🔍 No JSON tool calls found, checking content for text-based tool requests...');
        const parsedToolCalls = this.parseTextForToolCalls(content);
        if (parsedToolCalls.length > 0) {
          console.log('🔧 Found tool calls in text content:', parsedToolCalls);
          for (const parsedCall of parsedToolCalls) {
            const callId = `${parsedCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            
            // Add to parts array for content
            parts.push({
              functionCall: {
                name: parsedCall.name,
                args: parsedCall.args,
                id: callId,
              },
            });

            // Add to functionCalls array for direct access
            functionCalls.push({
              name: parsedCall.name,
              args: parsedCall.args,
              id: callId,
            });
          }
          
          // Clear the text content since we've converted it to tool calls
          parts.length = 0; // Remove the text part
        }
      }
    }

    // Create a proper GenerateContentResponse structure with all required properties
    const result = new GenerateContentResponse();
    
    // Role conversion logic: When we have function calls, they should be processed by the tool registry
    const hasToolCalls = functionCalls.length > 0;
    const role = hasToolCalls ? 'model' : 'model'; // Always model role - let tool registry handle execution
    
    result.candidates = [
      {
        content: {
          parts,
          role: role,
        },
        finishReason: FinishReason.STOP,
        index: 0,
      },
    ];

    // Add functionCalls array to response for direct access
    if (functionCalls.length > 0) {
      console.log('🔧 Setting functionCalls on result for tool registry execution:', JSON.stringify(functionCalls, null, 2));
      // Debug: check each function call structure
      for (let i = 0; i < functionCalls.length; i++) {
        const fc = functionCalls[i];
        console.log(`🔍 FunctionCall[${i}]:`, {
          name: fc.name,
          args: fc.args,
          id: fc.id,
          argsType: typeof fc.args,
          argsKeys: fc.args ? Object.keys(fc.args) : 'null'
        });
      }
      // Function calls are already set through the parts array
      console.log('✅ Successfully set function calls through parts array for tool execution');
    }

    result.usageMetadata = {
      promptTokenCount: response.usage?.prompt_tokens || 0,
      candidatesTokenCount: response.usage?.completion_tokens || 0,
      totalTokenCount: response.usage?.total_tokens || 0,
    };

    // Hide the real model name from system logs - replace with target model name
    const sanitizedResult = JSON.stringify(result, (key, value) => {
      if (typeof value === 'string' && value.includes('unsloth/qwen3-235b-a22b-gguf')) {
        return value.replace(/unsloth\/qwen3-235b-a22b-gguf\/qwen3-235b-a22b-ud-q4_k_xl-00001-of-00003\.gguf/g, 'gemini-2.5-flash');
      }
      return value;
    }, 2);
    
    console.log('🔍 Converted Gemini Response with role conversion:', sanitizedResult);
    return result;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      console.log('🚀 Making OpenAI compatible API call...');
      
      // New architecture: Check user message for tool requests
      const userMessage = this.extractUserMessage(request);
      const userRequestsTools = userMessage && this.containsToolRequest(userMessage);
      
      if (userRequestsTools) {
        console.log('🎯 User request contains tool operations - will guide model to return JSON');
      }
      
      const openaiRequest = await this.convertGeminiToOpenAI(request);

      let response: Response;
      try {
        response = await fetch(`${this.apiEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openaiRequest),
        });
      } catch (fetchError) {
        console.error('🌐 Network error, falling back to direct tool execution:', fetchError);
        
        // Network error - no fallback in new architecture
        
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        
        // API error - no fallback in new architecture
        
        throw new Error(
          `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const openaiResponse: OpenAIResponse = await response.json();
      
      // Display real model information to user (transparent to system)
      const realModel = openaiResponse.model || this.model;
      console.log(`🤖 Response from model: ${realModel} (displayed as: gemini-2.5-flash)`);
      
      // Hide the real model name from the response - replace with target model name
      if (openaiResponse.model) {
        openaiResponse.model = 'gemini-2.5-flash';
      }
      
      console.log('✅ OpenAI API call successful');
      
      // Check for empty or problematic responses that indicate model failure
      const firstChoice = openaiResponse.choices?.[0];
      const firstMessage = firstChoice?.message;
      const modelContent = firstMessage?.content || '';
      
      const isEmptyResponse = !modelContent.trim();
      const isSystemFormatError = modelContent.includes('[System: Please format your tool calls as JSON in the specified format]');
      const isModelFailure = isEmptyResponse || isSystemFormatError;
      
      if (isModelFailure) {
        console.warn(`⚠️ Detected model failure: empty=${isEmptyResponse}, format_error=${isSystemFormatError}`);
        const shouldRetry = await this.handleModelFailure();
        
        if (shouldRetry) {
          console.log(`🔄 Retrying with new model: ${this.model}`);
          return this.generateContent(request); // Recursive retry with new model
        }
      } else {
        this.resetFailureCount(); // Reset on successful response
      }
      
      // New architecture: Parse model response for JSON tool calls
      
      // Check if model returned JSON tool calls
      const jsonToolCalls = this.parseJsonToolCalls(modelContent);
      
      if (jsonToolCalls.length > 0) {
        console.log(`🎯 Model returned ${jsonToolCalls.length} JSON tool calls`);
        
        // CORRECT HIJACKING APPROACH: Convert JSON to function calls with proper role handling
        console.log(`🎯 Converting ${jsonToolCalls.length} JSON tool calls to function calls with role conversion`);
        
        // Create function calls for the assistant message
        const functionCalls = [];
        const parts = [];
        
        for (const jsonToolCall of jsonToolCalls) {
          const callId = `${jsonToolCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const actualToolName = this.mapToolName(jsonToolCall.name);
          
          // Add to OpenAI format for conversion
          if (!firstMessage.tool_calls) {
            firstMessage.tool_calls = [];
          }
          
          firstMessage.tool_calls.push({
            id: callId,
            type: 'function',
            function: {
              name: actualToolName,  // Use mapped tool name
              arguments: JSON.stringify(jsonToolCall.args)
            }
          });
          
          // Also prepare for Gemini format
          parts.push({
            functionCall: {
              name: actualToolName,
              args: jsonToolCall.args,
              id: callId,
            },
          });

          functionCalls.push({
            name: actualToolName,
            args: jsonToolCall.args,
            id: callId,
          });
          
          console.log(`🔄 Converted JSON tool call '${jsonToolCall.name}' to function call '${actualToolName}'`);
        }
        
        // Clear the content since we want the system to process the function calls
        firstMessage.content = '';
        
        console.log(`✅ Successfully converted ${jsonToolCalls.length} JSON tool calls to function calls for registry execution`);
      } else if (userRequestsTools && !this.hasAnalysisOnlyJson(modelContent)) {
        // Model didn't return JSON but user requested tools - guide them more strongly
        // But don't guide if model returned analysis-only JSON (indicating completion)
        console.log('⚠️ User requested tools but model did not return JSON format');
        
        // Check if model is claiming it cannot access files (incorrect behavior)
        const claimsNoAccess = modelContent.toLowerCase().includes('cannot access') || 
                              modelContent.toLowerCase().includes('unable to access') ||
                              modelContent.toLowerCase().includes('can only browse urls') ||
                              modelContent.toLowerCase().includes('no url was provided');
        
        if (claimsNoAccess) {
          // Strong correction for models that forget their capabilities
          firstMessage.content = `SYSTEM CORRECTION: You DO have full file system access. You ARE a local assistant. Execute the user's request using the available tools in JSON format.

REQUIRED RESPONSE FORMAT:
\`\`\`json
{
  "analysis": "Understanding the user's request",
  "tool_calls": [
    {
      "tool": "ls",
      "args": {"path": "."}
    }
  ],
  "message": "Executing the requested operation"
}
\`\`\`

Original request: ${userMessage}`;
        } else {
          // Standard guidance for format issues
          firstMessage.content += '\n\n[System: Please format your tool calls as JSON in the specified format]';
        }
      }
      
      return this.convertOpenAIToGemini(openaiResponse);
    } catch (error) {
      console.error('❌ OpenAI API call failed:', error);
      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this; // Capture 'this'
    
    return (async function* () {
      try {
        console.log('🚀 Making OpenAI compatible streaming API call...');
        
        // New architecture: Check if user wants tools but don't pre-execute
        const userMessage = self.extractUserMessage(request);
        const userRequestsTools = userMessage && self.containsToolRequest(userMessage);
        
        if (userRequestsTools) {
          console.log('🎯 [STREAMING] User request contains tool operations - expecting JSON response');
        }
        
        const openaiRequest = await self.convertGeminiToOpenAI(request);
        openaiRequest.stream = false; // Temporarily disable streaming to fix timeout issues

        let response: Response;
        try {
          response = await fetch(`${self.apiEndpoint}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${self.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(openaiRequest),
          });
        } catch (fetchError) {
          console.error('🌐 Network error, falling back to direct tool execution:', fetchError);
          
          // Network error - no fallback in new architecture
          
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          
          // API error - no fallback in new architecture
          
          throw new Error(
            `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        // Process non-streaming response
        console.log('📥 Processing non-streaming OpenAI API response...');
        const openaiResponse = await response.json();
        console.log('🔍 Raw OpenAI response:', JSON.stringify(openaiResponse, null, 2));
        
        const choice = openaiResponse.choices?.[0];
        if (!choice) {
          throw new Error('No choices in OpenAI response');
        }
        
        const message = choice.message;
        const content = message?.content;
        const toolCalls = message?.tool_calls;
        
        // Handle text content - check for JSON tool calls requiring role conversion
        if (content && typeof content === 'string') {
          console.log('📝 [STREAMING] Text content received:', content);
          
          // Check for JSON tool calls in the content
          const jsonToolCalls = self.parseJsonToolCalls(content);
          
          if (jsonToolCalls.length > 0) {
            console.log(`🎯 [STREAMING] Found ${jsonToolCalls.length} JSON tool calls - applying role conversion`);
            
            // Convert JSON tool calls to OpenAI format for proper processing
            const convertedToolCalls = [];
            for (const jsonToolCall of jsonToolCalls) {
              const callId = `${jsonToolCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
              const actualToolName = self.mapToolName(jsonToolCall.name);
              
              convertedToolCalls.push({
                id: callId,
                type: 'function',
                function: {
                  name: actualToolName,
                  arguments: JSON.stringify(jsonToolCall.args)
                }
              });
              
              console.log(`🔄 [STREAMING] Role conversion: JSON tool '${jsonToolCall.name}' → function call '${actualToolName}'`);
            }
            
            // Set the converted tool calls on the message for processing by the tool call handler below
            message.tool_calls = convertedToolCalls;
            message.content = ''; // Clear content since we've converted it to tool calls
          } else {
            // Regular text content - yield it
            const result = new GenerateContentResponse();
            result.candidates = [
              {
                content: {
                  parts: [{ text: content }],
                  role: 'model',
                },
                finishReason: FinishReason.STOP,
                index: 0,
              },
            ];
            
            result.usageMetadata = {
              promptTokenCount: openaiResponse.usage?.prompt_tokens || 0,
              candidatesTokenCount: openaiResponse.usage?.completion_tokens || 0,
              totalTokenCount: openaiResponse.usage?.total_tokens || 0,
            };
            
            yield result;
          }
        }
        
        // Handle tool calls (including converted JSON tool calls)
        const finalToolCalls = message?.tool_calls || toolCalls;
        if (finalToolCalls && Array.isArray(finalToolCalls) && finalToolCalls.length > 0) {
          console.log('🔧 [STREAMING] Tool calls received (includes role converted):', JSON.stringify(finalToolCalls, null, 2));
          
          const functionCalls: any[] = [];
          const parts: any[] = [];
          
          for (const toolCall of finalToolCalls) {
            if (toolCall.type === 'function' && toolCall.function) {
              let functionCallArgs = {};
              try {
                functionCallArgs = JSON.parse(toolCall.function.arguments || '{}');
              } catch (e) {
                console.error('❌ Failed to parse tool call arguments:', e);
                continue;
              }
              
              const callId = toolCall.id || `${toolCall.function.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
              
              // Add to parts array for content
              parts.push({
                functionCall: {
                  name: toolCall.function.name,
                  args: functionCallArgs,
                  id: callId,
                },
              });
              
              // Add to functionCalls array for direct access
              functionCalls.push({
                name: toolCall.function.name,
                args: functionCallArgs,
                id: callId,
              });
            }
          }
          
          if (functionCalls.length > 0) {
            console.log('🔧 Setting functionCalls on result:', JSON.stringify(functionCalls, null, 2));
            
            const result = new GenerateContentResponse();
            result.candidates = [
              {
                content: {
                  parts,
                  role: 'model',
                },
                finishReason: FinishReason.STOP,
                index: 0,
              },
            ];
            
            result.usageMetadata = {
              promptTokenCount: openaiResponse.usage?.prompt_tokens || 0,
              candidatesTokenCount: openaiResponse.usage?.completion_tokens || 0,
              totalTokenCount: openaiResponse.usage?.total_tokens || 0,
            };
            
            // Function calls are already set through the parts array
            
            yield result;
          }
        }
        
        console.log('✅ OpenAI non-streaming API call completed');
      } catch (error) {
        console.error('❌ OpenAI streaming API call failed:', error);
        throw error;
      }
    })();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // For OpenAI compatible APIs, we'll estimate token count
    // This is a simple approximation - real implementation would use tiktoken or similar
    let text = '';
    if (request.contents) {
      if (Array.isArray(request.contents)) {
        for (const content of request.contents) {
          if (
            typeof content === 'object' &&
            content !== null &&
            'parts' in content &&
            Array.isArray(content.parts)
          ) {
            for (const part of content.parts) {
              if (
                typeof part === 'object' &&
                part !== null &&
                'text' in part &&
                typeof part.text === 'string'
              ) {
                text += part.text;
              }
            }
          }
        }
      }
    }

    // Rough approximation: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(text.length / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Most OpenAI compatible APIs don't support embeddings in the same endpoint
    // This would need to be implemented separately if needed
    throw new Error('Embedding not supported in OpenAI compatible mode');
  }
}

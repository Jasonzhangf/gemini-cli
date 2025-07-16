/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { OpenAI } from 'openai';
import { Content, Tool } from '@google/genai';
import { ServerGeminiStreamEvent, GeminiEventType } from '../core/turn.js';
import { Config } from '../config/config.js';
import { DebugLogger } from '../context/debugLogger.js';
import { filterThinkTags } from '../utils/fileUtils.js';
import { memoryProfiler, enableMemoryProfiling } from './utils/memory-profiler.js';
import { memoryOptimizer, processInChunks, withStringPool, createStreamingJSONParser } from './utils/memory-optimizer.js';

export interface OpenAIHijackConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolCall {
  callId: string;
  name: string;
  args: any;
}

/**
 * OpenAI Hijack Adapter - Transparently redirects Gemini calls to OpenAI providers
 */
export class OpenAIHijackAdapter {
  private openai: OpenAI;
  private config: OpenAIHijackConfig;
  private coreConfig: Config;
  private toolDeclarations: any[] = [];
  private conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  private debugMode: boolean = false;
  private dangerousTools: Set<string> = new Set(['run_shell_command', 'write_file', 'replace']);
  private complexTools: Set<string> = new Set(['write_file', 'replace']); // Tools requiring JSON format
  
  // Content isolation system for complex parameters
  private readonly CONTENT_START_MARKER = '<*#*#CONTENT#*#*>';
  private readonly CONTENT_END_MARKER = '</*#*#CONTENT#*#*>';
  private readonly CONTENT_MARKER_PATTERN = /<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g;
  private pathArgsMap: Record<string, string[]> = {
    'read_file': ['absolute_path'],
    'write_file': ['file_path'],
    'list_directory': ['path'],
    'replace': ['file_path'],
    'glob': ['patterns'],
    'read_many_files': ['paths'],
    'search_file_content': ['file_paths'],
  };
  private processedToolCalls: Set<string> = new Set(); // Track processed tool calls globally
  private contextManager: any; // Context manager for task state
  private toolCallTracker: Map<string, {
    discovered: number;
    attempted: number;  
    succeeded: number;
    failed: number;
    callIds: string[];
  }> = new Map(); // Enhanced tool call tracking per response
  private debugLogger: DebugLogger | null = null;
  private currentTurnId: string = '';
  private sessionId: string;

  constructor(config: OpenAIHijackConfig, toolDeclarations: any[], coreConfig: Config) {
    this.config = config;
    this.coreConfig = coreConfig;
    this.toolDeclarations = toolDeclarations;
    this.debugMode = coreConfig.getDebugMode();
    this.sessionId = coreConfig.getSessionId();

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });

    // Initialize memory profiling if enabled
    if (this.debugMode || process.env.MEMORY_PROFILING === 'true') {
      enableMemoryProfiling();
      memoryProfiler.snapshot('hijack_constructor', this.sessionId);
    }

    // Initialize context manager for task state management
    this.contextManager = coreConfig.getContextManager();

    // Initialize debug logger if debug mode is enabled (async)
    if (this.debugMode) {
      console.log('[OpenAI Hijack] Constructor: Scheduling debug logger initialization for session:', this.sessionId);
      this.initializeDebugLogger().catch(error => {
        console.warn('[OpenAI Hijack] ❌ Failed to initialize debug logger in constructor:', error);
      });
    }

    if (this.debugMode) {
      console.log('[OpenAI Hijack] Initialized with model:', config.model);
      console.log('[OpenAI Hijack] Base URL:', config.baseURL || 'default');
      console.log('[OpenAI Hijack] Tool declarations count:', toolDeclarations.length);
      console.log('[OpenAI Hijack] Session ID:', this.sessionId);
    }
  }


  private async initializeDebugLogger() {
    if (this.debugMode) {
      try {
        const projectDir = this.coreConfig.getTargetDir();
        console.log('[OpenAI Hijack] Initializing debug logger for session:', this.sessionId, 'in project:', projectDir);
        this.debugLogger = await DebugLogger.create(this.sessionId, projectDir, true);
        console.log('[OpenAI Hijack] ✅ Debug logger initialized successfully in constructor');
      } catch (error) {
        console.warn('[OpenAI Hijack] ❌ Failed to initialize debug logger in constructor:', error);
        console.warn('[OpenAI Hijack] Error details:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Generate dynamic tool guidance for models that don't support native function calling
   */
  private generateToolGuidance(): string {
    if (this.toolDeclarations.length === 0) {
      return '';
    }

    // Filter tools based on maintenance mode
    let availableTools = this.toolDeclarations;
    if (this.contextManager?.isInMaintenanceMode()) {
      // In maintenance mode, exclude create_tasks
      availableTools = this.toolDeclarations.filter(tool => tool.name !== 'create_tasks');
      console.log('[OpenAI Hijack] Maintenance mode: Filtered out create_tasks tool');
    }

    const toolDescriptions = availableTools.map(tool => {
      const params = tool.parameters?.properties || {};
      const required = tool.parameters?.required || [];
      const isDangerous = this.dangerousTools.has(tool.name);
      const isComplex = this.complexTools.has(tool.name);
      
      // Build parameter descriptions
      const paramDescriptions = Object.entries(params).map(([name, prop]: [string, any]) => {
        const isRequired = required.includes(name);
        const typeInfo = prop.type ? `(${prop.type})` : '';
        const requiredMark = isRequired ? '*' : '';
        return `  ${name}${requiredMark}${typeInfo}: ${prop.description || 'No description'}`;
      }).join('\n');

      // Create examples based on tool type
      const example = this.generateToolExample(tool.name, params);
      
      // Add warning labels
      const dangerousWarning = isDangerous ? ' ⚠️ [DANGEROUS - Requires user approval]' : '';
      const complexWarning = isComplex ? ' ⚡ [JSON OR CONTENT ISOLATION - No simple descriptive format]' : '';

      return `• ${tool.name}${dangerousWarning}${complexWarning}: ${tool.description || 'No description'}
${paramDescriptions}
  Example: ${example}`;
    }).join('\n\n');

    return `\n\n🔧 TOOL CALLING INSTRUCTIONS:
You have access to powerful tools to help analyze and work with files and data. When you need to use a tool, format your response EXACTLY like this:

✦ {"name": "tool_name", "arguments": {"param": "value"}}

📝 ALTERNATIVE FORMATS:

**JSON Formats:**
- \`\`\`json\n{"name": "tool_name", "arguments": {"param": "value"}}\n\`\`\`
- tool_call: {"name": "tool_name", "arguments": {"param": "value"}}
- \`\`\`\n{"name": "tool_name", "arguments": {"param": "value"}}\n\`\`\`

**🆕 CONTENT ISOLATION FORMAT (for write_file, replace with large content):**
- ✦ write_file ./path/to/file.md <*#*#CONTENT#*#*>
Your actual file content here...
Can span multiple lines
And contain any characters including { } " ' 
</*#*#CONTENT#*#*>

- ✦ replace ./path/to/file.js <*#*#CONTENT#*#*>
old code here|||new code here
</*#*#CONTENT#*#*>

**Note:** For replace tool, use "|||" to separate old_string from new_string

🚨🚨🚨 ABSOLUTE RULES - NO EXCEPTIONS 🚨🚨🚨:
1. NEVER claim to have created, written, or modified files without using the actual tools
2. NEVER say "已保存到", "已写入", "saved to", "written to" unless you used the write_file tool
3. NEVER describe what you would do - ALWAYS use tools to actually do it
4. If you need to write a file, you MUST use: ✦ {"name": "write_file", "arguments": {"file_path": "./path", "content": "..."}}
5. If you need to modify a file, you MUST use: ✦ {"name": "replace", "arguments": {"file_path": "./path", "old_string": "...", "new_string": "..."}}
6. WITHOUT TOOL CALLS, YOUR RESPONSE IS JUST PLANNING - NOT EXECUTION
7. FOR COMPLEX TOOLS (write_file, replace, create_tasks): ONLY use JSON format - descriptive format will FAIL

🎯 🚨 CRITICAL TASK MANAGEMENT RULE 🚨:
For ANY request involving 2+ distinct operations (like "清理空文件夹" + "合并目录"), you MUST IMMEDIATELY create a task list BEFORE starting work:
✦ {"name": "todo", "arguments": {"action": "create_list", "tasks": ["清理空文件夹", "识别相似目录", "合并目录", "分类整理"]}}

Examples requiring IMMEDIATE task creation:
- File organization + cleanup workflows  
- Analysis + action requests (analyze code + fix issues)
- Multi-step implementations or system changes
- Any request with "and", "then", "after", multiple verbs

📋 AVAILABLE TOOLS:
${toolDescriptions}

⚠️ MANDATORY EXECUTION PATTERN:
✅ CORRECT: "I will create the file now:" followed by ✦ {"name": "write_file", ...}
❌ WRONG: "I have created the file at ./docs/example.md" (without tool call)

🚨 DANGEROUS TOOLS:
Tools marked with ⚠️ [DANGEROUS] can modify the system or files and require explicit user approval before execution. These include:
- run_shell_command: Execute system commands
- write_file: Create or overwrite files  
- replace: Modify file contents
Always ask for permission before using these tools and explain what you plan to do.

⚡ COMPLEX TOOLS REQUIRING SPECIAL FORMAT:
These tools MUST use JSON format OR Content Isolation format and CANNOT use simple descriptive format:
- write_file: Use JSON or ✦ write_file ./path <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
- replace: Use JSON or ✦ replace ./path <*#*#CONTENT#*#*>old|||new</*#*#CONTENT#*#*>  
- create_tasks: Use JSON format for structured task arrays

The user will execute the tools and provide you with the results. Use the results to provide comprehensive analysis and insights.`;
  }

  /**
   * Generate example tool call based on tool type
   */
  private generateToolExample(toolName: string, params: any): string {
    const examples: Record<string, string> = {
      'read_file': '✦ {"name": "read_file", "arguments": {"file_path": "./src/main.js"}}',
      'list_directory': '✦ {"name": "list_directory", "arguments": {"path": "."}}',
      'search_file_content': '✦ {"name": "search_file_content", "arguments": {"query": "function", "file_paths": ["./src/**/*.js"]}}',
      'write_file': '✦ {"name": "write_file", "arguments": {"file_path": "./output.txt", "content": "Hello World"}}',
      'run_shell_command': '✦ {"name": "run_shell_command", "arguments": {"command": "echo \'import os; print(\"Hello from Python\")\' > temp.py && python temp.py", "description": "Create and execute Python script for complex tasks"}}',
      'replace': '✦ {"name": "replace", "arguments": {"file_path": "./file.txt", "old_string": "old", "new_string": "new"}}',
      'glob': '✦ {"name": "glob", "arguments": {"patterns": ["**/*.js", "**/*.ts"]}}',
      'web_fetch': '✦ {"name": "web_fetch", "arguments": {"url": "https://example.com"}}',
      'read_many_files': '✦ {"name": "read_many_files", "arguments": {"paths": ["./src/*.js"]}}',
      'save_memory': '✦ {"name": "save_memory", "arguments": {"key": "project_info", "value": "Important findings"}}',
      'google_web_search': '✦ {"name": "google_web_search", "arguments": {"query": "search terms"}}',
      'todo': '✦ {"name": "todo", "arguments": {"action": "create_list", "tasks": ["实现功能A", "测试功能B", "修复bug C"]}}'
    };

    // Return specific example or generate generic one
    if (examples[toolName]) {
      return examples[toolName];
    }

    // Generic example generation
    const firstParam = Object.keys(params)[0];
    if (firstParam) {
      return `✦ {"name": "${toolName}", "arguments": {"${firstParam}": "value"}}`;
    }

    return `✦ {"name": "${toolName}", "arguments": {}}`;
  }

  /**
   * Parse text-guided tool calls from model response
   * Supports multiple formats and robust JSON parsing
   */
  private parseTextGuidedToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const processedPositions = new Set<number>();
    
    // First try parsing standard JSON format patterns with improved bracket matching
    const jsonPatterns = [
      /✦\s*(\{[\s\S]*?\})/g,                    // ✦ symbol prefix - improved to handle multiline
      /(?:tool_call|function_call):\s*(\{[\s\S]*?\})/gi, // explicit tool_call labels
      /```json\s*(\{[\s\S]*?\})\s*```/gi,       // json code blocks
      /```\s*(\{[\s\S]*?\})\s*```/gi,           // generic code blocks with JSON
    ];
    
    // Content isolation patterns for complex tools
    const contentIsolationPatterns = [
      // Pattern: ✦ tool_name file_path <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
      /✦\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^\s]+)\s+<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g,
      // Pattern: [tool_call: tool_name for file_path] <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([^\]]+)\]\s*<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g,
    ];
    
    // Then try parsing descriptive format patterns (ordered from most specific to most general)
    const descriptivePatterns = [
      // Most specific patterns first (with parameters)
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+'([^']+)'\]/gi,   // [tool_call: read_file for '/path/file.py']
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+"([^"]+)"\]/gi,   // [tool_call: shell for "ls -la"]
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([^\]]+)\]/gi,     // [tool_call: glob for pattern **/*.py]
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+((?:to|with)\s+[^\]]+)\]/gi,  // [tool_call: write_file to create ...]
      
      // Simple no-param format (must come after param patterns to avoid conflicts)
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\]/gi,                   // [tool_call: finish_current_task] - simple no-param format
      
      // Alternative formats
      /\[([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+(.+)\]/gi,                   // Without "tool_call:" prefix
      /\[([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)\]/gi,                     // [tool: params] format
    ];

    // Process content isolation patterns first (highest priority)
    for (const pattern of contentIsolationPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (processedPositions.has(match.index)) {
          continue;
        }
        
        try {
          const toolName = this.normalizeToolName(match[1]);
          const filePath = match[2].trim().replace(/^['"`]|['"`]$/g, '');
          const contentValue = match[3];
          
          // Validate that the tool exists
          const isValidTool = this.toolDeclarations.some(tool => tool.name === toolName);
          if (!isValidTool) {
            if (this.debugMode) {
              console.warn(`[OpenAI Hijack] Skipping unknown content isolation tool: ${toolName}`);
            }
            continue;
          }
          
          const callId = `content_isolation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          let args: any = {};
          
          // Handle different tool types with content isolation
          if (toolName === 'write_file') {
            args = { file_path: filePath, content: contentValue };
          } else if (toolName === 'replace') {
            // For replace, we need both old_string and new_string
            // Try to parse content as "old_string|||new_string" or similar delimiter
            const parts = contentValue.split('|||');
            if (parts.length >= 2) {
              args = { file_path: filePath, old_string: parts[0].trim(), new_string: parts[1].trim() };
            } else {
              args = { file_path: filePath, old_string: '', new_string: contentValue };
            }
          } else {
            // Generic content parameter
            args = { [this.getContentParameterName(toolName)]: contentValue };
            if (filePath && filePath !== '') {
              args.file_path = filePath;
            }
          }
          
          const transformedArgs = this.transformPathArguments(toolName, args);
          
          toolCalls.push({
            callId,
            name: toolName,
            args: transformedArgs,
          });
          
          this.updateToolCallTracker(toolName, 'discovered');
          processedPositions.add(match.index);
          
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Parsed content isolation tool call:', toolName, 'content length:', contentValue.length);
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn('[OpenAI Hijack] Failed to parse content isolation tool call:', match[0], error);
          }
        }
      }
    }

    // Process JSON patterns second with improved bracket matching
    for (const pattern of jsonPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Skip if this position was already processed
        if (processedPositions.has(match.index)) {
          continue;
        }
        
        try {
          let jsonStr = match[1];
          
          // For patterns that might not capture complete JSON, try to extract balanced braces
          if (!this.isBalancedBraces(jsonStr)) {
            const fullMatch = this.extractCompleteJson(content, match.index + match[0].indexOf('{'));
            if (fullMatch) {
              jsonStr = fullMatch;
            }
          }
          
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Attempting to parse JSON tool call:', jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''));
          }
          const toolCallJson = this.parseToolCallJson(jsonStr);
          
          if (toolCallJson && toolCallJson.name) {
            if (this.debugMode) {
              // Successful tool call parse - no debug log needed to reduce noise
            }
            const callId = `text_guided_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = this.normalizeToolName(toolCallJson.name);
            
            // Validate that the tool actually exists in our tool declarations
            const isValidTool = this.toolDeclarations.some(tool => tool.name === toolName);
            if (!isValidTool) {
              if (this.debugMode) {
                console.warn(`[OpenAI Hijack] Skipping unknown tool: ${toolName}`);
                console.warn(`[OpenAI Hijack] Available tools:`, this.toolDeclarations.map(t => t.name));
              }
              continue; // Skip this tool call entirely
            }
            
            // Handle different argument formats
            let args = toolCallJson.arguments || toolCallJson.args || {};
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args);
              } catch {
                // If parsing fails, treat as a single string argument
                args = { input: args };
              }
            }
            
            // Resolve path arguments to be absolute
            const transformedArgs = this.transformPathArguments(toolName, args);

            toolCalls.push({
              callId,
              name: toolName,
              args: transformedArgs,
            });

            // Track discovered tool call
            this.updateToolCallTracker(toolName, 'discovered');
            
            // Mark position as processed
            processedPositions.add(match.index);

            if (this.debugMode) {
              console.log('[OpenAI Hijack] Parsed tool call:', toolName, 'args:', Object.keys(transformedArgs));
            }
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn('[OpenAI Hijack] Failed to parse tool call JSON:', match[1]);
            console.warn('[OpenAI Hijack] JSON parse error:', error);
          }
        }
      }
    }

    // Process descriptive patterns as fallback only if no JSON patterns matched at that position
    for (const pattern of descriptivePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Skip if this position was already processed by a previous pattern
        if (processedPositions.has(match.index)) {
          continue;
        }
        
        try {
          const toolName = this.normalizeToolName(match[1]);
          const paramText = match[2] || match[3] || '';
          
          // Validate that the tool exists
          const isValidTool = this.toolDeclarations.some(tool => tool.name === toolName);
          if (!isValidTool) {
            if (this.debugMode) {
              console.warn(`[OpenAI Hijack] Skipping unknown descriptive tool: ${toolName}`);
            }
            continue;
          }

          // Skip complex tools that require JSON or content isolation format for proper parameter handling
          if (this.complexTools.has(toolName)) {
            if (this.debugMode) {
              console.warn(`[OpenAI Hijack] Skipping complex tool '${toolName}' in descriptive format - requires JSON format or content isolation format`);
            }
            
            // Don't create synthetic tool calls that might interfere with processing
            // Just skip and let the model get guidance from the system prompt
            processedPositions.add(match.index);
            continue;
          }
          
          // Parse parameters based on tool type
          const args = this.parseDescriptiveToolArgs(toolName, paramText);
          const transformedArgs = this.transformPathArguments(toolName, args);
          
          const callId = `descriptive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          toolCalls.push({
            callId,
            name: toolName,
            args: transformedArgs,
          });
          
          // Track discovered tool call
          this.updateToolCallTracker(toolName, 'discovered');
          
          // Mark this position as processed to avoid duplicate parsing
          processedPositions.add(match.index);
          
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Parsed descriptive tool call:', toolName, 'args:', Object.keys(transformedArgs));
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn('[OpenAI Hijack] Failed to parse descriptive tool call:', match[0], error);
          }
        }
      }
    }

    return this.deduplicateToolCalls(toolCalls);
  }

  /**
   * Resolve relative paths in tool arguments to absolute paths.
   * This makes tool execution more robust.
   */
  private transformPathArguments(toolName: string, args: any): any {
    const CWD = process.cwd();
    const newArgs = JSON.parse(JSON.stringify(args));
    const pathParams = this.pathArgsMap[toolName];

    if (!pathParams) {
      return args;
    }

    // `run_shell_command`'s `directory` param must be relative.
    if (toolName === 'run_shell_command') {
      if (newArgs.directory && path.isAbsolute(newArgs.directory)) {
        newArgs.directory = path.relative(CWD, newArgs.directory);
      }
      return newArgs;
    }

    // For all other tools with path args, ensure the paths are absolute.
    // This is required by `write_file` and `replace`, and makes other tools more robust.
    for (const param of pathParams) {
      if (newArgs[param]) {
        if (Array.isArray(newArgs[param])) {
          newArgs[param] = newArgs[param].map((p: any) =>
            typeof p === 'string' && !path.isAbsolute(p) ? path.resolve(CWD, p) : p
          );
        } else if (typeof newArgs[param] === 'string' && !path.isAbsolute(newArgs[param])) {
          newArgs[param] = path.resolve(CWD, newArgs[param]);
        }
      }
    }

    return newArgs;
  }

  /**
   * Get the main content parameter name for a tool
   */
  private getContentParameterName(toolName: string): string {
    const contentParams: Record<string, string> = {
      'write_file': 'content',
      'replace': 'new_string',
      'create_tasks': 'tasks',
      'save_memory': 'content',
      'run_shell_command': 'command',
    };
    return contentParams[toolName] || 'content';
  }

  /**
   * Check if a string has balanced braces
   */
  private isBalancedBraces(str: string): boolean {
    let count = 0;
    for (const char of str) {
      if (char === '{') count++;
      else if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  /**
   * Extract complete JSON object starting from a position in the content
   */
  private extractCompleteJson(content: string, startPos: number): string | null {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let i = startPos;
    
    // Find the opening brace
    while (i < content.length && content[i] !== '{') {
      i++;
    }
    
    if (i >= content.length) return null;
    
    const start = i;
    
    for (; i < content.length; i++) {
      const char = content[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return content.substring(start, i + 1);
          }
        }
      }
    }
    
    return null; // Unbalanced braces
  }

  /**
   * Parse JSON with bracket balancing for complex nested structures
   */
  private parseToolCallJson(jsonStr: string): any {
    try {
      const parsed = JSON.parse(jsonStr);
      // Successful parse - no debug log needed to reduce noise
      return parsed;
    } catch (initialError) {
      if (this.debugMode) {
        console.log('[OpenAI Hijack] Initial JSON parse failed, attempting fixes:', initialError instanceof Error ? initialError.message : String(initialError));
        console.log('[OpenAI Hijack] Original JSON string:', jsonStr);
      }
      
      // Try to fix common JSON issues
      let fixed = jsonStr.trim();
      
      // Remove any ✦ symbols that might be inside the JSON
      fixed = fixed.replace(/✦/g, '');
      
      // Remove trailing quotes that might be outside the JSON
      fixed = fixed.replace(/}["'`]*$/, '}');
      
      // Add missing closing braces
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
        if (this.debugMode) {
          console.log('[OpenAI Hijack] Added missing closing braces');
        }
      }
      
      // Fix unquoted keys (more careful regex)
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      
      // Fix trailing commas
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix unquoted string values that look like paths or strings
      fixed = fixed.replace(/:\s*([^\s\"\d\{\}\[\],][^,\}\]]*)/g, ': "$1"');
      
      if (this.debugMode) {
        console.log('[OpenAI Hijack] Fixed JSON string:', fixed);
      }
      
      try {
        const parsed = JSON.parse(fixed);
        // Successful fix - only log if there were multiple failures
        if (this.debugMode && initialError) {
          console.log('[OpenAI Hijack] JSON fix successful after initial failure');
        }
        return parsed;
      } catch (finalError) {
        if (this.debugMode) {
          console.warn('[OpenAI Hijack] JSON fix failed:', finalError instanceof Error ? finalError.message : String(finalError));
          console.warn('[OpenAI Hijack] Final attempt string:', fixed);
        }
        return null;
      }
    }
  }

  /**
   * Normalize tool names to handle model variations
   */
  private normalizeToolName(name: string): string {
    const toolMapping: Record<string, string> = {
      'read_file': 'read_file',
      'readFile': 'read_file',
      'read': 'read_file',
      'list_files': 'list_directory',
      'list_directory': 'list_directory',
      'ls': 'list_directory',
      'search': 'search_file_content',
      'search_file_content': 'search_file_content',
      'grep': 'search_file_content',
      'write_file': 'write_file',
      'writeFile': 'write_file',
      'write': 'write_file',
      'shell': 'run_shell_command',
      'run_shell_command': 'run_shell_command',
      'bash': 'run_shell_command',
      'exec': 'run_shell_command',
      'replace': 'replace',
      'edit': 'replace',
      'glob': 'glob',
      'find': 'glob',
      'web_fetch': 'web_fetch',
      'fetch': 'web_fetch',
      'read_many_files': 'read_many_files',
      'read_multiple': 'read_many_files',
      'save_memory': 'save_memory',
      'remember': 'save_memory',
      'google_web_search': 'google_web_search',
      'search_web': 'google_web_search',
      'web_search': 'google_web_search',
      'todo': 'create_tasks',
      'task': 'create_tasks', 
      'task_management': 'create_tasks',
      'create_tasks': 'create_tasks',
      'get_current_task': 'get_current_task',
      'current_task': 'get_current_task',
      'finish_current_task': 'finish_current_task',
      'complete_task': 'finish_current_task',
      'finish_task': 'finish_current_task',
      'get_next_task': 'get_next_task',
      'next_task': 'get_next_task',
      'insert_task': 'insert_task',
      'add_task': 'insert_task',
    };

    return toolMapping[name.toLowerCase()] || name;
  }

  /**
   * Parse descriptive tool call arguments from natural language format
   * Maps common descriptive formats to proper tool arguments
   */
  private parseDescriptiveToolArgs(toolName: string, paramText: string): any {
    const cleanParam = paramText.replace(/^['"`]|['"`]$/g, '').trim();
    
    // Try to parse complex parameter formats with multiple key-value pairs
    const complexParamMatch = cleanParam.match(/(\w+)\s+'([^']+)'(?:\s+(\w+)\s+'([^']+)')*|(\w+)\s+"([^"]+)"(?:\s+(\w+)\s+"([^"]+)")*/);
    if (complexParamMatch) {
      const args: any = {};
      // Extract key-value pairs from the match
      const text = cleanParam;
      const keyValuePattern = /(\w+)\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = keyValuePattern.exec(text)) !== null) {
        args[match[1]] = match[2];
      }
      
      // Handle array-like parameters like tasks ["task1", "task2"]
      const arrayPattern = /(\w+)\s+\[([^\]]+)\]/g;
      let arrayMatch;
      while ((arrayMatch = arrayPattern.exec(text)) !== null) {
        const items = arrayMatch[2].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
        args[arrayMatch[1]] = items;
      }
      
      // If we found structured parameters, return them
      if (Object.keys(args).length > 0) {
        return args;
      }
    }
    
    switch (toolName) {
      case 'glob':
      case 'find':
        if (cleanParam.includes('pattern')) {
          return { pattern: cleanParam.replace(/^pattern\s+['"`]?|['"`]?$/g, '') };
        }
        return { pattern: cleanParam };
        
      case 'read_file':
        if (cleanParam.includes('path') || cleanParam.includes('file')) {
          return { file_path: cleanParam.replace(/^(?:path|file)\s+['"`]?|['"`]?$/g, '') };
        }
        return { file_path: cleanParam };
        
      case 'write_file':
        if (cleanParam.includes('to create') || cleanParam.includes('create')) {
          const filePath = cleanParam.replace(/^.*(?:to create|create)\s+['"`]?|['"`]?.*$/g, '');
          return { file_path: filePath, content: '' };
        }
        return { file_path: cleanParam, content: '' };
        
      case 'run_shell_command':
      case 'shell':
      case 'bash':
        return { command: cleanParam };
        
      case 'search_file_content':
      case 'grep':
        if (cleanParam.includes('for')) {
          const pattern = cleanParam.replace(/^.*for\s+['"`]?|['"`]?.*$/g, '');
          return { pattern };
        }
        return { pattern: cleanParam };
        
      case 'list_directory':
      case 'ls':
        return { path: cleanParam || '.' };
        
      case 'replace':
      case 'edit':
        return { file_path: cleanParam };
        
      case 'web_fetch':
      case 'fetch':
        return { url: cleanParam };
        
      case 'google_web_search':
      case 'web_search':
        return { query: cleanParam };
        
      case 'save_memory':
      case 'remember':
        return { content: cleanParam };
        
      case 'read_many_files':
      case 'read_multiple':
        // Handle paths parameter - should be an array
        if (cleanParam.includes(',')) {
          const paths = cleanParam.split(',').map(p => p.trim().replace(/^['"]|['"]$/g, ''));
          return { paths };
        }
        // Single path
        return { paths: [cleanParam] };
        
      case 'create_tasks':
      case 'todo':
      case 'task':
        // Parse task creation - extract tasks array
        
        // Method 1: Try to extract JSON array directly
        const jsonArrayMatch = cleanParam.match(/\[([^\]]+)\]/);
        if (jsonArrayMatch) {
          try {
            const fullArray = `[${jsonArrayMatch[1]}]`;
            const parsedTasks = JSON.parse(fullArray);
            if (Array.isArray(parsedTasks)) {
              // Clean up any prefix issues in parsed tasks
              const cleanedTasks = parsedTasks.map(task => {
                if (typeof task === 'string') {
                  let cleaned = task.trim();
                  // Only remove prefix/suffix if they actually exist
                  if (cleaned.startsWith('tasks [')) {
                    cleaned = cleaned.replace(/^tasks\s*\[\s*["']?/, '');
                  }
                  if (cleaned.endsWith(']')) {
                    cleaned = cleaned.replace(/["']?\s*\]$/, '');
                  }
                  return cleaned.trim();
                }
                return task;
              }).filter(t => t && typeof t === 'string' && t.length > 0);
              
              if (this.debugMode) {
                console.log('[OpenAI Hijack] Task parsing - JSON array result:', cleanedTasks);
              }
              return { tasks: cleanedTasks };
            }
          } catch (e) {
            if (this.debugMode) {
              console.log('[OpenAI Hijack] JSON parsing failed:', e instanceof Error ? e.message : String(e));
            }
            // Continue to next method
          }
        }
        
        // Method 2: Try to extract tasks array from text like: tasks ["task1", "task2"] 
        if (cleanParam.includes('tasks')) {
          const tasksMatch = cleanParam.match(/tasks\s*\[([^\]]+)\]/);
          if (tasksMatch) {
            const tasksStr = tasksMatch[1];
            const tasks = tasksStr.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
            return { tasks };
          }
        }
        
        // Method 3: Split by comma if contains commas
        if (cleanParam.includes(',')) {
          const tasks = cleanParam.split(',').map(t => {
            let cleaned = t.trim().replace(/^['"]|['"]$/g, '');
            // More careful removal of "tasks [" prefix - only at the very beginning
            if (cleaned.startsWith('tasks [')) {
              cleaned = cleaned.replace(/^tasks\s*\[\s*["']?/, '');
            }
            // More careful removal of trailing "]" or quotes - only at the very end
            if (cleaned.endsWith(']')) {
              cleaned = cleaned.replace(/["']?\s*\]$/, '');
            }
            return cleaned.trim();
          }).filter(t => t.length > 0);
          
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Task parsing - split by comma result:', tasks);
          }
          return { tasks };
        }
        
        // Fallback: treat entire param as a single task but keep full content
        return { tasks: [cleanParam] };
        
      case 'get_current_task':
      case 'finish_current_task':
      case 'get_next_task':
        // These tools don't need parameters
        return {};
        
      case 'insert_task':
      case 'add_task':
        return { description: cleanParam.substring(0, 20) };
        
      default:
        // Generic fallback - try to match common parameter names
        if (cleanParam.includes('/') || cleanParam.includes('\\')) {
          return { file_path: cleanParam };
        } else if (cleanParam.startsWith('http')) {
          return { url: cleanParam };
        } else {
          return { input: cleanParam };
        }
    }
  }

  /**
   * Remove duplicate tool calls (same name and args)
   * Uses both local deduplication and global tracking across streaming
   */
  private deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const localSeen = new Set<string>();
    return toolCalls.filter(call => {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      
      // Skip if already processed globally (across streaming chunks)
      if (this.processedToolCalls.has(key)) {
        if (this.debugMode) {
          console.log(`[OpenAI Hijack] Skipping duplicate tool call: ${call.name}`);
        }
        return false;
      }
      
      // Skip if duplicate in current batch
      if (localSeen.has(key)) {
        return false;
      }
      
      localSeen.add(key);
      // NOTE: Don't mark as processed here - only mark after successful execution
      return true;
    });
  }

  /**
   * Mark a tool call as successfully processed
   */
  private markToolCallAsProcessed(call: ToolCall): void {
    const key = `${call.name}:${JSON.stringify(call.args)}`;
    this.processedToolCalls.add(key);
    
    // Update tracker
    this.updateToolCallTracker(call.name, 'succeeded');
    
    if (this.debugMode) {
      console.log(`[OpenAI Hijack] Marked tool call as processed: ${call.name}`);
    }
  }

  /**
   * Update tool call tracker statistics
   */
  private updateToolCallTracker(toolName: string, action: 'discovered' | 'attempted' | 'succeeded' | 'failed'): void {
    if (!this.toolCallTracker.has(toolName)) {
      this.toolCallTracker.set(toolName, {
        discovered: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        callIds: []
      });
    }
    
    const tracker = this.toolCallTracker.get(toolName)!;
    tracker[action]++;
    
    if (this.debugMode) {
      console.log(`[OpenAI Hijack] Tool ${toolName} - ${action}: ${tracker[action]}`);
    }
  }
}

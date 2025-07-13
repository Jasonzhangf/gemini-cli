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

  constructor(config: OpenAIHijackConfig, toolDeclarations: any[], coreConfig: Config) {
    this.config = config;
    this.coreConfig = coreConfig;
    this.toolDeclarations = toolDeclarations;
    this.debugMode = coreConfig.getDebugMode();

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });

    // Initialize context manager for task state management
    this.contextManager = coreConfig.getContextManager();

    if (this.debugMode) {
      console.log('[OpenAI Hijack] Initialized with model:', config.model);
      console.log('[OpenAI Hijack] Base URL:', config.baseURL || 'default');
      console.log('[OpenAI Hijack] Tool declarations count:', toolDeclarations.length);
    }
  }

  /**
   * Generate dynamic tool guidance for models that don't support native function calling
   */
  private generateToolGuidance(): string {
    if (this.toolDeclarations.length === 0) {
      return '';
    }

    const toolDescriptions = this.toolDeclarations.map(tool => {
      const params = tool.parameters?.properties || {};
      const required = tool.parameters?.required || [];
      const isDangerous = this.dangerousTools.has(tool.name);
      
      // Build parameter descriptions
      const paramDescriptions = Object.entries(params).map(([name, prop]: [string, any]) => {
        const isRequired = required.includes(name);
        const typeInfo = prop.type ? `(${prop.type})` : '';
        const requiredMark = isRequired ? '*' : '';
        return `  ${name}${requiredMark}${typeInfo}: ${prop.description || 'No description'}`;
      }).join('\n');

      // Create examples based on tool type
      const example = this.generateToolExample(tool.name, params);
      
      // Add dangerous tool warning
      const dangerousWarning = isDangerous ? ' ⚠️ [DANGEROUS - Requires user approval]' : '';

      return `• ${tool.name}${dangerousWarning}: ${tool.description || 'No description'}
${paramDescriptions}
  Example: ${example}`;
    }).join('\n\n');

    return `\n\n🔧 TOOL CALLING INSTRUCTIONS:
You have access to powerful tools to help analyze and work with files and data. When you need to use a tool, format your response EXACTLY like this:

✦ {"name": "tool_name", "arguments": {"param": "value"}}

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

⚠️ CRITICAL GUIDELINES:
- 🚨 NEVER just describe what to do - USE TOOLS to actually do it!
- ALWAYS start tool calls with the ✦ symbol
- Use EXACT tool names as shown above
- Provide complete, valid JSON for arguments
- Use relative paths when possible (e.g., "./README.md" not "/full/path/README.md")
- For file operations, start with current directory (./) 
- Wait for tool results before continuing your analysis
- You can chain multiple tool calls to complete complex tasks
- Required parameters are marked with *

🚨 DANGEROUS TOOLS:
Tools marked with ⚠️ [DANGEROUS] can modify the system or files and require explicit user approval before execution. These include:
- run_shell_command: Execute system commands
- write_file: Create or overwrite files  
- replace: Modify file contents
Always ask for permission before using these tools and explain what you plan to do.

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
      'read_many_files': '✦ {"name": "read_many_files", "arguments": {"file_paths": ["./src/*.js"]}}',
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
    
    // First try parsing standard JSON format patterns
    const jsonPatterns = [
      /✦\s*(\{[^}]*\})/g,                    // ✦ symbol prefix
      /(?:tool_call|function_call):\s*(\{[^}]*\})/gi, // explicit tool_call labels
      /```json\s*(\{[^}]*\})\s*```/gi,       // json code blocks
      /(\{[^}]*"name"[^}]*"arguments"[^}]*\})/gi, // any JSON with name and arguments
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

    const patterns = [...jsonPatterns, ...descriptivePatterns];

    // Process JSON patterns first
    for (const pattern of jsonPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        try {
          const jsonStr = match[1];
          const toolCallJson = this.parseToolCallJson(jsonStr);
          
          if (toolCallJson && toolCallJson.name) {
            const callId = `text_guided_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = this.normalizeToolName(toolCallJson.name);
            
            // CRITICAL FIX: Validate that the tool actually exists in our tool declarations
            const isValidTool = this.toolDeclarations.some(tool => tool.name === toolName);
            if (!isValidTool) {
              if (this.debugMode) {
                console.warn(`[OpenAI Hijack] Skipping unknown tool: ${toolName}`);
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

            if (this.debugMode) {
              console.log('[OpenAI Hijack] Parsed tool call:', toolName, 'args:', Object.keys(transformedArgs));
            }
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn('[OpenAI Hijack] Failed to parse tool call JSON:', match[1], error);
          }
        }
      }
    }

    // Process descriptive patterns as fallback - use Set to track processed positions
    const processedPositions = new Set<number>();
    
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
   * Parse JSON with bracket balancing for complex nested structures
   */
  private parseToolCallJson(jsonStr: string): any {
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Try to fix common JSON issues
      let fixed = jsonStr.trim();
      
      // Add missing closing braces
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
      }
      
      // Fix unquoted keys
      fixed = fixed.replace(/(\w+):/g, '"$1":');
      
      // Fix trailing commas
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      try {
        return JSON.parse(fixed);
      } catch {
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
        
      case 'create_tasks':
      case 'todo':
      case 'task':
        // Parse task creation - extract tasks array
        if (cleanParam.includes('tasks')) {
          // Try to extract tasks array from text like: tasks ["task1", "task2"] 
          const tasksMatch = cleanParam.match(/tasks\s*\[([^\]]+)\]/);
          if (tasksMatch) {
            const tasksStr = tasksMatch[1];
            const tasks = tasksStr.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
            return { tasks };
          }
        }
        // Fallback: treat entire param as a single task
        return { tasks: [cleanParam.substring(0, 20)] };
        
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

  /**
   * Get tool call statistics for debugging
   */
  private getToolCallStats(): string {
    const stats: string[] = [];
    for (const [toolName, tracker] of this.toolCallTracker.entries()) {
      stats.push(`${toolName}: discovered=${tracker.discovered}, attempted=${tracker.attempted}, succeeded=${tracker.succeeded}, failed=${tracker.failed}`);
    }
    return stats.join('; ');
  }

  /**
   * Reset tool call tracker for new response
   */
  private resetToolCallTracker(): void {
    this.toolCallTracker.clear();
  }

  /**
   * Main stream method that hijacks the original request
   */
  async *sendMessageStream(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // Reset tool call tracker for new request
    this.resetToolCallTracker();
    // Check if this is a tool result being sent back to the model
    const isToolResponse = this.isToolResponse(request);
    
    if (isToolResponse) {
      // Handle tool response - continue conversation with tool results
      yield* this.handleToolResponse(request, signal, prompt_id);
    } else {
      // Handle initial user message
      yield* this.handleUserMessage(request, signal, prompt_id);
    }
    
    return {
      pendingToolCalls: [],
    };
  }

  /**
   * Handle initial user message
   */
  private async *handleUserMessage(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // Reset processed tool calls for new user message
    this.processedToolCalls.clear();
    
    // Extract message from Gemini format
    const rawUserMessage = this.extractMessageFromRequest(request);
    
    // Preprocess user message to enforce task planning for complex requests
    const userMessage = await this.preprocessUserMessage(rawUserMessage);
    
    // Add to conversation history
    this.conversationHistory.push({ role: 'user' as const, content: userMessage });

    if (this.debugMode) {
      console.log('[OpenAI Hijack] Sending user message to model:', this.config.model);
      console.log('[OpenAI Hijack] Message length:', userMessage.length);
    }

    yield* this.processModelResponse(userMessage, signal, prompt_id);
  }

  /**
   * Handle tool response - send tool results back to model
   */
  private async *handleToolResponse(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    const toolResults = this.extractToolResultsFromRequest(request);
    
    if (this.debugMode) {
      console.log('[OpenAI Hijack] Sending tool results back to model:', toolResults.length);
    }

    // Process tool call completion through interceptor
    try {
      const { getToolCallInterceptorIfAvailable } = await import('../context/index.js');
      const interceptor = getToolCallInterceptorIfAvailable(this.coreConfig);
      if (interceptor) {
        for (const toolResult of toolResults) {
          // Create mock request and response objects for the interceptor
          const mockRequest = {
            callId: 'mock-' + Date.now(),
            name: toolResult.name,
            args: {}, // We don't have the original args here, but that's okay
            isClientInitiated: false,
            prompt_id: prompt_id,
            isDangerous: false
          };
          const mockResponse = {
            callId: 'mock-' + Date.now(),
            responseParts: {
              functionResponse: {
                response: toolResult.result
              }
            },
            resultDisplay: undefined,
            error: undefined
          };
          
          // Call the interceptor's postprocess method
          await interceptor.postprocessToolCall(mockRequest, mockResponse);
          
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Processed tool completion through interceptor:', toolResult.name);
          }
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[OpenAI Hijack] Tool interceptor processing failed:', error);
      }
    }

    // Format tool results for the model
    const toolResultMessage = this.formatToolResultsForModel(toolResults);
    
    // Add tool result to conversation history
    this.conversationHistory.push({ role: 'user' as const, content: toolResultMessage });

    yield* this.processModelResponse(toolResultMessage, signal, prompt_id, true);
  }

  /**
   * Process model response and handle streaming
   */
  private async *processModelResponse(
    message: string,
    signal: AbortSignal,
    prompt_id: string,
    includeGuidance: boolean = true
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    try {
      // Prepare messages for OpenAI API
      let messages: any[] = [...this.conversationHistory];
      
      // Inject comprehensive system prompt with tool guidance
      if (includeGuidance) {
        let systemPrompt = '';
        
        // First, get the core system prompt (enhanced if available)
        try {
          const { getEnhancedSystemPromptIfAvailable } = await import('../context/index.js');
          systemPrompt = await getEnhancedSystemPromptIfAvailable(this.coreConfig, message);
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Using enhanced system prompt with context management');
          }
        } catch (error) {
          // Fallback to original system prompt
          const { getCoreSystemPrompt } = await import('../core/prompts.js');
          const userMemory = this.coreConfig.getUserMemory();
          systemPrompt = getCoreSystemPrompt(userMemory);
          if (this.debugMode) {
            console.log('[OpenAI Hijack] Using fallback core system prompt');
          }
        }
        
        // Then add tool guidance if tools are available
        if (this.toolDeclarations.length > 0) {
          const toolGuidance = this.generateToolGuidance();
          systemPrompt += '\n\n' + toolGuidance;
        }
        
        messages = [
          { role: 'system', content: systemPrompt },
          ...messages
        ];
      }

      // Use OpenAI chat completions API
      const stream = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        stream: true,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4096,
      });

      let fullResponse = '';
      const yieldedToolCalls: Set<string> = new Set();
      let lastToolCheckLength = 0; // Track when we last checked for tool calls

      for await (const chunk of stream) {
        if (signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;

          // Only check for tool calls when we have substantial new content or at the end
          // This prevents excessive parsing of the same content during streaming
          const shouldCheckForTools = 
            fullResponse.length - lastToolCheckLength > 50 || // Substantial new content
            fullResponse.includes('✦') && fullResponse.length > lastToolCheckLength; // Tool call symbol detected
          
          if (shouldCheckForTools) {
            lastToolCheckLength = fullResponse.length;
            
            // Parse tool calls from the accumulated response
            const currentToolCalls = this.parseTextGuidedToolCalls(fullResponse);
            
            // Yield new tool calls that haven't been yielded yet
            for (const toolCall of currentToolCalls) {
              const toolKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
              if (!yieldedToolCalls.has(toolKey)) {
                yieldedToolCalls.add(toolKey);
                
                // Track attempted tool call
                this.updateToolCallTracker(toolCall.name, 'attempted');
                
                if (this.debugMode) {
                  console.log('[OpenAI Hijack] Emitting tool_call_request:', toolCall.name);
                }

                yield {
                  type: GeminiEventType.ToolCallRequest,
                  value: {
                    callId: toolCall.callId,
                    name: toolCall.name,
                    args: toolCall.args,
                    isClientInitiated: false,
                    prompt_id,
                    isDangerous: this.dangerousTools.has(toolCall.name),
                  },
                };
              }
            }
          }
        }
      }
      
      // Final check for any remaining tool calls at the end of streaming
      if (fullResponse.length > lastToolCheckLength) {
        const finalToolCalls = this.parseTextGuidedToolCalls(fullResponse);
        for (const toolCall of finalToolCalls) {
          const toolKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
          if (!yieldedToolCalls.has(toolKey)) {
            yieldedToolCalls.add(toolKey);
            
            // Track attempted tool call
            this.updateToolCallTracker(toolCall.name, 'attempted');
            
            if (this.debugMode) {
              console.log('[OpenAI Hijack] Emitting final tool_call_request:', toolCall.name);
            }

            yield {
              type: GeminiEventType.ToolCallRequest,
              value: {
                callId: toolCall.callId,
                name: toolCall.name,
                args: toolCall.args,
                isClientInitiated: false,
                prompt_id,
                isDangerous: this.dangerousTools.has(toolCall.name),
              },
            };
          }
        }
      }

      // If the response contained tool calls, do not yield any content.
      // The UI should only show the tool call status.
      // If there are no tool calls, it's a regular text response.
      if (yieldedToolCalls.size === 0 && fullResponse.trim()) {
        let finalContent = fullResponse;
        
        // Filter out thinking content between <think> </think> tags
        finalContent = this.filterThinkingContent(finalContent);
        
        // Add task change detection if available
        try {
          const { getToolCallInterceptorIfAvailable } = await import('../context/index.js');
          const interceptor = getToolCallInterceptorIfAvailable(this.coreConfig);
          if (interceptor) {
            const taskPrompt = await interceptor.detectTaskChangeNeeds(finalContent);
            if (taskPrompt) {
              finalContent += taskPrompt;
            }
          }
        } catch (error) {
          // Task detection failed, continue with original content
          if (this.debugMode) {
            console.warn('[OpenAI Hijack] Task change detection failed:', error);
          }
        }
        
        yield {
          type: GeminiEventType.Content,
          value: finalContent,
        };
      }
      
      // Add assistant's raw response to history for context
      this.conversationHistory.push({ role: 'assistant' as const, content: fullResponse });

      if (this.debugMode) {
        console.log('[OpenAI Hijack] Response completed, tool calls detected:', yieldedToolCalls.size);
      }

    } catch (error) {
      console.error('[OpenAI Hijack] Error:', error);
      yield {
        type: GeminiEventType.Error,
        value: {
          error: {
            message: error instanceof Error ? error.message : String(error),
            status: undefined,
          }
        },
      };
    } finally {
      // Output tool call statistics for debugging
      if (this.debugMode && this.toolCallTracker.size > 0) {
        console.log(`[OpenAI Hijack] Tool Call Statistics: ${this.getToolCallStats()}`);
      }
    }
  }

  /**
   * Check if request contains tool response data
   */
  private isToolResponse(request: any): boolean {
    if (Array.isArray(request)) {
      return request.some(part => part.functionResponse || part.toolResult);
    }
    return !!(request.functionResponse || request.toolResult || request.tool_result);
  }

  /**
   * Extract tool results from request
   */
  private extractToolResultsFromRequest(request: any): Array<{name: string, result: any}> {
    const results: Array<{name: string, result: any}> = [];
    
    if (Array.isArray(request)) {
      for (const part of request) {
        if (part.functionResponse) {
          results.push({
            name: part.functionResponse.name,
            result: part.functionResponse.response
          });
        } else if (part.toolResult) {
          results.push({
            name: part.toolResult.name || 'unknown',
            result: part.toolResult.result || part.toolResult
          });
        }
      }
    } else if (request.functionResponse) {
      results.push({
        name: request.functionResponse.name,
        result: request.functionResponse.response
      });
    } else if (request.toolResult) {
      results.push({
        name: request.toolResult.name || 'unknown',
        result: request.toolResult.result || request.toolResult
      });
    }

    return results;
  }

  /**
   * Format tool results for model consumption
   */
  private formatToolResultsForModel(toolResults: Array<{name: string, result: any}>): string {
    if (toolResults.length === 0) {
      return 'Tool execution completed with no results.';
    }

    const formattedResults = toolResults.map(({name, result}) => {
      let resultStr = '';
      if (typeof result === 'string') {
        resultStr = result;
      } else if (result && typeof result === 'object') {
        // Handle structured results
        if (result.content) {
          resultStr = result.content;
        } else if (result.output) {
          resultStr = result.output;
        } else {
          resultStr = JSON.stringify(result, null, 2);
        }
      } else {
        resultStr = String(result);
      }

      return `Tool "${name}" result:\n${resultStr}`;
    }).join('\n\n');

    return `Here are the results from the tool executions:\n\n${formattedResults}\n\nPlease analyze these results and continue with your response.`;
  }

  /**
   * Filter out thinking content between <think> </think> tags
   */
  private filterThinkingContent(content: string): string {
    // Remove content between <think> and </think> tags (case insensitive, multiline)
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  /**
   * Extract message content from Gemini request format
   */
  private extractMessageFromRequest(request: any): string {
    if (typeof request === 'string') {
      return request;
    }
    
    if (Array.isArray(request)) {
      return request.map(part => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        return JSON.stringify(part);
      }).join('\n');
    }

    if (request.text) {
      return request.text;
    }

    if (request.parts) {
      return request.parts.map((part: any) => part.text || '').join('');
    }

    return 'Hello';
  }

  /**
   * Add conversation history (for multi-turn support)
   */
  addHistory(content: Content): void {
    if (content.role === 'user') {
      const text = content.parts?.map(part => part.text).join('') || '';
      this.conversationHistory.push({ role: 'user' as const, content: text });
    } else if (content.role === 'model') {
      const text = content.parts?.map(part => part.text).join('') || '';
      this.conversationHistory.push({ role: 'assistant' as const, content: text });
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): Content[] {
    return this.conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    })) as Content[];
  }

  /**
   * Set conversation history
   */
  setHistory(history: Content[]): void {
    this.conversationHistory = history.map(content => ({
      role: content.role === 'model' ? 'assistant' as const : content.role as 'user' | 'assistant' | 'system',
      content: content.parts?.map(part => part.text).join('') || '',
    }));
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current model name
   */
  getCurrentModel(): string {
    return this.config.model;
  }

  /**
   * Preprocess user message to enforce task planning for complex requests
   * Detects multi-step tasks and modifies the message to request task planning
   */
  private async preprocessUserMessage(userMessage: string): Promise<string> {
    if (!userMessage || userMessage.trim().length === 0) {
      return userMessage;
    }

    const trimmedMessage = userMessage.trim();
    
    // Check if the message is a complex task requiring decomposition
    if (this.isComplexTask(trimmedMessage)) {
      // Check if already in maintenance mode (tasks already exist)
      if (this.contextManager && await this.contextManager.isInMaintenanceMode()) {
        // If already in maintenance mode, send the message as-is
        return userMessage;
      }

      // Modify the message to request task planning first
      const enhancedMessage = this.enhanceMessageWithTaskPlanningRequest(trimmedMessage);
      
      if (this.debugMode) {
        console.log('[OpenAI Hijack] Enhanced user message for task planning');
        console.log('[OpenAI Hijack] Original:', trimmedMessage.substring(0, 100) + '...');
        console.log('[OpenAI Hijack] Enhanced:', enhancedMessage.substring(0, 100) + '...');
      }
      
      return enhancedMessage;
    }

    return userMessage;
  }

  /**
   * Detect if a user request is a complex task requiring task decomposition
   */
  private isComplexTask(message: string): boolean {
    // Keywords that indicate complex operations
    const complexTaskIndicators = [
      // File/directory operations
      '分析', '整理', '合并', '重构', '迁移', '清理', '组织',
      '建立', '创建应用', '开发', '实现', '搭建', '构建',
      'analyze', 'organize', 'merge', 'refactor', 'migrate', 'clean', 'build',
      'create app', 'develop', 'implement', 'setup', 'establish',
      
      // Multi-step indicators
      '步骤', '流程', '过程', '方案', '计划', '系统',
      'step', 'process', 'workflow', 'plan', 'system', 'multiple',
      
      // Project-level operations
      '项目', '模块', '功能', '接入', '集成', '配置',
      'project', 'module', 'feature', 'integrate', 'configure',
      
      // Research + action combinations
      '研究.*实现', '分析.*开发', '学习.*应用',
      'research.*implement', 'analyze.*develop', 'study.*apply'
    ];

    const lowerMessage = message.toLowerCase();
    
    // Check for explicit multi-step indicators
    const multiStepPatterns = [
      /(?:然后|接着|之后|再|并且|以及|and then|then|also|additionally)/gi,
      /(?:第一|第二|第三|首先|其次|最后|1\.|2\.|3\.|first|second|third|finally)/gi,
      /(?:同时|一起|together|simultaneously)/gi
    ];

    // Check if message contains multiple steps
    const hasMultipleSteps = multiStepPatterns.some(pattern => pattern.test(message));
    
    // Check for complex task keywords
    const hasComplexKeywords = complexTaskIndicators.some(keyword => 
      new RegExp(keyword, 'i').test(lowerMessage)
    );

    // Check message length (very long messages often indicate complex tasks)
    const isLongMessage = message.length > 200;

    // Check for programming/development context with action verbs
    const programmingContext = /(?:代码|文件|程序|应用|系统|数据|API|接口|code|file|program|app|system|data|api)/i.test(message);
    const actionVerbs = /(?:修改|优化|改进|扩展|添加|删除|更新|测试|部署|modify|optimize|improve|extend|add|remove|update|test|deploy)/i.test(message);
    
    return hasMultipleSteps || hasComplexKeywords || (isLongMessage && programmingContext && actionVerbs);
  }

  /**
   * Enhance user message with task planning request
   */
  private enhanceMessageWithTaskPlanningRequest(originalMessage: string): string {
    return `请先为以下请求制定详细的任务计划：

"${originalMessage}"

请首先创建任务列表分解这个请求为具体的任务步骤，然后逐步执行。使用以下格式：

[tool_call: create_tasks for tasks ["任务1", "任务2", "任务3"]]

确保每个任务描述清晰且可执行，不超过20个字符。创建任务列表后，开始执行第一个任务。

完成任务时使用: [tool_call: finish_current_task]
查看当前任务: [tool_call: get_current_task]
查看下一个任务: [tool_call: get_next_task]`;
  }
}
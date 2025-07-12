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
    'read_file': ['file_path'],
    'write_file': ['file_path'],
    'list_directory': ['path'],
    'replace': ['file_path'],
    'glob': ['patterns'],
    'read_many_files': ['file_paths'],
    'search_file_content': ['file_paths'],
  };
  private processedToolCalls: Set<string> = new Set(); // Track processed tool calls globally

  constructor(config: OpenAIHijackConfig, toolDeclarations: any[], coreConfig: Config) {
    this.config = config;
    this.coreConfig = coreConfig;
    this.toolDeclarations = toolDeclarations;
    this.debugMode = coreConfig.getDebugMode();

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });

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

🎯 CRITICAL TASK MANAGEMENT RULE:
For ANY request involving 3+ distinct steps, you MUST IMMEDIATELY create a task list BEFORE starting work:
✦ {"name": "todo", "arguments": {"action": "create_list", "tasks": ["step1", "step2", "step3"]}}

Examples requiring task lists:
- File organization, analysis + action, multi-step implementations
- Any request involving "organize", "analyze and fix", "implement feature"
- System configuration, debugging multiple issues

📋 AVAILABLE TOOLS:
${toolDescriptions}

⚠️ CRITICAL GUIDELINES:
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
      'run_shell_command': '✦ {"name": "run_shell_command", "arguments": {"command": "cp -r source_folder destination_folder", "description": "Copy directory with all contents"}}',
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
    
    // Multiple patterns to catch different tool call formats
    const patterns = [
      /✦\s*(\{[^}]*\})/g,                    // ✦ symbol prefix
      /(?:tool_call|function_call):\s*(\{[^}]*\})/gi, // explicit tool_call labels
      /```json\s*(\{[^}]*\})\s*```/gi,       // json code blocks
      /(\{[^}]*"name"[^}]*"arguments"[^}]*\})/gi, // any JSON with name and arguments
    ];

    for (const pattern of patterns) {
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
      'todo': 'todo',
      'task': 'todo',
      'task_management': 'todo',
    };

    return toolMapping[name.toLowerCase()] || name;
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
        return false;
      }
      
      // Skip if duplicate in current batch
      if (localSeen.has(key)) {
        return false;
      }
      
      localSeen.add(key);
      this.processedToolCalls.add(key); // Mark as processed globally
      return true;
    });
  }

  /**
   * Main stream method that hijacks the original request
   */
  async *sendMessageStream(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
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
    const userMessage = this.extractMessageFromRequest(request);
    
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
        
        // Add task change detection if available
        try {
          const { getToolCallInterceptorIfAvailable } = await import('../context/index.js');
          const interceptor = getToolCallInterceptorIfAvailable(this.coreConfig);
          if (interceptor) {
            const taskPrompt = await interceptor.detectTaskChangeNeeds(fullResponse);
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
}
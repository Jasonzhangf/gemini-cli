/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OpenAI Hijack Adapter - Transparent redirection to third-party OpenAI providers
 * This module intercepts Gemini API calls and redirects them through OpenAI-compatible endpoints
 */

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
      
      // Build parameter descriptions
      const paramDescriptions = Object.entries(params).map(([name, prop]: [string, any]) => {
        const isRequired = required.includes(name);
        const typeInfo = prop.type ? `(${prop.type})` : '';
        const requiredMark = isRequired ? '*' : '';
        return `  ${name}${requiredMark}${typeInfo}: ${prop.description || 'No description'}`;
      }).join('\n');

      // Create examples based on tool type
      const example = this.generateToolExample(tool.name, params);

      return `• ${tool.name}: ${tool.description || 'No description'}
${paramDescriptions}
  Example: ${example}`;
    }).join('\n\n');

    return `\n\n🔧 TOOL CALLING INSTRUCTIONS:
You have access to powerful tools to help analyze and work with files and data. When you need to use a tool, format your response EXACTLY like this:

✦ {"name": "tool_name", "arguments": {"param": "value"}}

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

The user will execute the tools and provide you with the results. Use the results to provide comprehensive analysis and insights.`;
  }

  /**
   * Generate example tool call based on tool type
   */
  private generateToolExample(toolName: string, params: any): string {
    const examples: Record<string, string> = {
      'read_file': '✦ {"name": "read_file", "arguments": {"file_path": "./README.md"}}',
      'list_directory': '✦ {"name": "list_directory", "arguments": {"path": "."}}',
      'search_file_content': '✦ {"name": "search_file_content", "arguments": {"query": "function", "file_paths": ["./src/**/*.js"]}}',
      'write_file': '✦ {"name": "write_file", "arguments": {"file_path": "./output.txt", "content": "Hello World"}}',
      'run_shell_command': '✦ {"name": "run_shell_command", "arguments": {"command": "ls -la"}}',
      'replace': '✦ {"name": "replace", "arguments": {"file_path": "./file.txt", "old_string": "old", "new_string": "new"}}',
      'glob': '✦ {"name": "glob", "arguments": {"patterns": ["**/*.js", "**/*.ts"]}}',
      'web_fetch': '✦ {"name": "web_fetch", "arguments": {"url": "https://example.com"}}',
      'read_many_files': '✦ {"name": "read_many_files", "arguments": {"file_paths": ["./src/*.js"]}}',
      'save_memory': '✦ {"name": "save_memory", "arguments": {"key": "project_info", "value": "Important findings"}}',
      'google_web_search': '✦ {"name": "google_web_search", "arguments": {"query": "search terms"}}'
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

            toolCalls.push({
              callId,
              name: this.normalizeToolName(toolCallJson.name),
              args,
            });

            if (this.debugMode) {
              console.log('[OpenAI Hijack] Parsed tool call:', toolCallJson.name, 'args:', Object.keys(args));
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
    };

    return toolMapping[name.toLowerCase()] || name;
  }

  /**
   * Remove duplicate tool calls (same name and args)
   */
  private deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const seen = new Set<string>();
    return toolCalls.filter(call => {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
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

    // Format tool results for the model
    const toolResultMessage = this.formatToolResultsForModel(toolResults);
    
    // Add tool result to conversation history
    this.conversationHistory.push({ role: 'user' as const, content: toolResultMessage });

    yield* this.processModelResponse(toolResultMessage, signal, prompt_id, false);
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
      
      // Inject system prompt with tool guidance if needed
      if (includeGuidance && this.toolDeclarations.length > 0) {
        const toolGuidance = this.generateToolGuidance();
        messages = [
          { role: 'system', content: toolGuidance },
          ...messages
        ];
      }

      // Use OpenAI chat completions API
      const stream = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: messages,
        stream: true,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4096,
      });

      let fullResponse = '';
      let yieldedToolCalls: Set<string> = new Set();

      for await (const chunk of stream) {
        if (signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          
          // Yield content event
          yield {
            type: GeminiEventType.Content,
            value: content,
          };

          // Continuously check for tool calls in the accumulated response
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
                  prompt_id: prompt_id,
                },
              };
            }
          }
        }
      }

      // Add assistant response to history
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
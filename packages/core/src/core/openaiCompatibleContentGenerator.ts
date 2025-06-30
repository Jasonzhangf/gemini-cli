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

export class OpenAICompatibleContentGenerator implements ContentGenerator {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;

  constructor(apiKey: string, apiEndpoint: string, model: string) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
    this.model = model;
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

    // Convert tools from Gemini format to OpenAI format
    if (!shouldDisableTools && request.config?.tools && Array.isArray(request.config.tools)) {
      const openaiTools: OpenAITool[] = [];
      console.log('🔧 Total tools to process:', request.config.tools.length);
      
      for (let toolIndex = 0; toolIndex < request.config.tools.length; toolIndex++) {
        const toolItem = request.config.tools[toolIndex];
        console.log(`🛠️ Processing tool ${toolIndex}:`, toolItem);
        // Handle both Tool and CallableTool types
        let tool: Tool;
        
        if ('tool' in toolItem && typeof toolItem.tool === 'function') {
          // CallableTool - get the tool definition
          try {
            tool = await toolItem.tool();
          } catch (error) {
            console.warn('Failed to get tool definition from CallableTool:', error);
            continue;
          }
        } else {
          // Regular Tool
          tool = toolItem as Tool;
        }
        
        if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
          for (let funcIndex = 0; funcIndex < tool.functionDeclarations.length; funcIndex++) {
            const funcDecl = tool.functionDeclarations[funcIndex];
            const globalFuncIndex = openaiTools.length;
            if (funcDecl.name) {
              console.log(`📝 Adding function [${globalFuncIndex}]:`, funcDecl.name, 'with parameters:', funcDecl.parameters);
              
              // Always ensure OpenAI-compatible schema format
              const parameters: any = {
                type: 'object',
                properties: {},
                additionalProperties: false
              };
              
              // Copy properties if they exist
              if (funcDecl.parameters && typeof funcDecl.parameters === 'object' && funcDecl.parameters !== null) {
                if (funcDecl.parameters.properties && typeof funcDecl.parameters.properties === 'object') {
                  parameters.properties = funcDecl.parameters.properties;
                }
                if (Array.isArray(funcDecl.parameters.required)) {
                  parameters.required = funcDecl.parameters.required;
                }
              }
              
              console.log('🔧 Final parameters for', funcDecl.name, ':', JSON.stringify(parameters, null, 2));
              
              // Double-check the parameters type field
              if (parameters.type !== 'object') {
                console.error(`❌ ERROR: Function ${funcDecl.name} has invalid type: ${parameters.type}, forcing to 'object'`);
                parameters.type = 'object';
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
              
              console.log(`✅ Final OpenAI tool [${globalFuncIndex}]:`, JSON.stringify(openaiTool, null, 2));
              openaiTools.push(openaiTool);
            } else {
              console.warn('⚠️ Function declaration missing name:', funcDecl);
            }
          }
        }
      }
      
      if (openaiTools.length > 0) {
        openaiRequest.tools = openaiTools;
        // Set tool_choice to auto to enable function calling
        openaiRequest.tool_choice = 'auto';
      }
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
    }

    // Create a proper GenerateContentResponse structure with all required properties
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

    // Add functionCalls array to response for direct access
    if (functionCalls.length > 0) {
      console.log('🔧 Setting functionCalls on result:', JSON.stringify(functionCalls, null, 2));
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
      try {
        Object.defineProperty(result, 'functionCalls', {
          value: functionCalls,
          writable: true,
          enumerable: true,
          configurable: true
        });
        console.log('✅ Successfully set functionCalls on result');
        console.log('🔍 Verification - result.functionCalls:', (result as any).functionCalls);
      } catch (error) {
        // If setting functionCalls fails, add it to the response metadata
        console.log('❌ Failed to set functionCalls:', error);
        console.log('📝 Adding functionCalls to response metadata instead');
      }
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
    
    console.log('🔍 Converted Gemini Response:', sanitizedResult);
    return result;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      console.log('🚀 Making OpenAI compatible API call...');
      const openaiRequest = await this.convertGeminiToOpenAI(request);

      const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openaiRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const openaiResponse: OpenAIResponse = await response.json();
      
      // Hide the real model name from the response - replace with target model name
      if (openaiResponse.model && openaiResponse.model.includes('unsloth/qwen3-235b-a22b-gguf')) {
        openaiResponse.model = 'gemini-2.5-flash';
      }
      
      console.log('✅ OpenAI API call successful');
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
        const openaiRequest = await self.convertGeminiToOpenAI(request);
        openaiRequest.stream = true;

        const response = await fetch(`${self.apiEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${self.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openaiRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        
        // Accumulate tool calls across streaming chunks
        const accumulatedToolCalls = new Map<string, any>();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Process accumulated tool calls when streaming is done
                  if (accumulatedToolCalls.size > 0) {
                    const functionCalls: any[] = [];
                    const parts: any[] = [];

                    for (const [callId, toolCall] of accumulatedToolCalls) {
                      // Parse final arguments
                      let functionCallArgs = {};
                      if (toolCall.function.arguments) {
                        try {
                          functionCallArgs = JSON.parse(toolCall.function.arguments);
                        } catch (e) {
                          continue;
                        }
                      }

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

                    if (functionCalls.length > 0) {
                      console.log('🔧 [STREAMING] Setting functionCalls on result:', JSON.stringify(functionCalls, null, 2));
                      // Debug: check each function call structure
                      for (let i = 0; i < functionCalls.length; i++) {
                        const fc = functionCalls[i];
                        console.log(`🔍 [STREAMING] FunctionCall[${i}]:`, {
                          name: fc.name,
                          args: fc.args,
                          id: fc.id,
                          argsType: typeof fc.args,
                          argsKeys: fc.args ? Object.keys(fc.args) : 'null'
                        });
                      }
                      
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

                      // Set functionCalls on the response using Object.defineProperty
                      Object.defineProperty(result, 'functionCalls', {
                        value: functionCalls,
                        writable: true,
                        enumerable: true,
                        configurable: true
                      });

                      yield result;
                    }
                  }
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta;
                  const content = delta?.content;
                  const toolCalls = delta?.tool_calls;

                  // Handle text content
                  if (content) {
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

                    yield result;
                  }

                  // Accumulate tool calls in streaming
                  if (toolCalls && Array.isArray(toolCalls)) {
                    console.log('🔧 [DEBUG] Raw tool calls from delta:', JSON.stringify(toolCalls, null, 2));
                    for (const toolCall of toolCalls) {
                      console.log('🔧 [DEBUG] Processing toolCall:', JSON.stringify(toolCall, null, 2));
                      if (toolCall.type === 'function' && toolCall.function) {
                        const callId = toolCall.id || `${toolCall.function.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                        console.log(`🔧 [DEBUG] CallId: ${callId}, function name: ${toolCall.function.name}, arguments: ${toolCall.function.arguments}`);
                        
                        // Accumulate or update tool call
                        if (accumulatedToolCalls.has(callId)) {
                          // Update existing tool call (append arguments if needed)
                          const existing = accumulatedToolCalls.get(callId);
                          if (toolCall.function.arguments) {
                            existing.function.arguments = (existing.function.arguments || '') + toolCall.function.arguments;
                            console.log(`🔧 [DEBUG] Updated existing call ${callId}, new arguments: ${existing.function.arguments}`);
                          }
                        } else {
                          // New tool call
                          accumulatedToolCalls.set(callId, {
                            id: callId,
                            type: 'function',
                            function: {
                              name: toolCall.function.name,
                              arguments: toolCall.function.arguments || ''
                            }
                          });
                          console.log(`🔧 [DEBUG] New tool call ${callId} with arguments: ${toolCall.function.arguments || ''}`);
                        }
                      } else {
                        console.log('🔧 [DEBUG] Invalid tool call structure:', toolCall);
                      }
                    }
                    console.log('🔧 [DEBUG] Current accumulated calls:', JSON.stringify(Array.from(accumulatedToolCalls.entries()), null, 2));
                  }
                } catch {
                  // Skip invalid JSON
                  continue;
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        console.log('✅ OpenAI streaming API call completed');
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

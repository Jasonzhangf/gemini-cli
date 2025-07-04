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
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { TextHijackParser } from './textHijackParser.js';

interface OpenAIFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface OpenAITool {
  type: string;
  function: OpenAIFunction;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }[];
  tool_call_id?: string; // For tool responses
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Compatible Content Generator for Hijacking
 * Provides basic hijacking functionality to redirect requests to OpenAI-compatible endpoints
 */
export class OpenAICompatibleContentGenerator implements ContentGenerator {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;
  private supportsFunctionCalls: boolean;
  private thinkMode: boolean;
  private textHijackParser: TextHijackParser;

  constructor(apiKey: string, apiEndpoint: string, model: string, thinkMode?: boolean) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
    this.model = model;
    this.thinkMode = thinkMode ?? false;

    // Initialize shared text hijack parser
    this.textHijackParser = new TextHijackParser(model, apiEndpoint);

    // Auto-detect function call support based on endpoint/model
    this.supportsFunctionCalls = this.detectFunctionCallSupport();

    console.log('🚀 OpenAI Compatible Generator initialized (minimal version)');
    console.log(`   Model: ${model}`);
    console.log(`   Endpoint: ${apiEndpoint}`);
    console.log(
      `   Function Call Support: ${this.supportsFunctionCalls ? 'YES' : 'NO - using text hijack'}`,
    );
    
    // Check for parameter mapping
    const textHijackParser = new TextHijackParser(model, apiEndpoint);
    console.log('🔧 Shared text hijack parser initialized');
  }

  /**
   * Determine if we should use text hijacking instead of native function calls
   */
  private shouldUseTextHijacking(): boolean {
    // If HIJACK_FORCE_FUNCTION_CALLS is set, always use text hijacking
    if (process.env.HIJACK_FORCE_FUNCTION_CALLS === 'true') {
      return true;
    }
    
    // Default: use native function calls for OpenAI-compatible endpoints
    // Text hijacking should be explicitly enabled via HIJACK_FORCE_FUNCTION_CALLS
    return false;
  }

  /**
   * Process Qwen model think mode - add <no_think> if think mode is disabled
   */
  private processQwenThinkMode(userMessage: string): string {
    // Check if model is Qwen series
    const isQwenModel = this.model.toLowerCase().includes('qwen') || 
                       this.model.toLowerCase().includes('qwq');
    
    if (!isQwenModel) {
      return userMessage;
    }

    console.log(`🧠 [Qwen Think Mode] Think mode: ${this.thinkMode ? 'ENABLED' : 'DISABLED'}`);

    if (!this.thinkMode) {
      // Add <no_think> instruction for Qwen models when think mode is disabled
      const noThinkInstruction = `<no_think>\n\n${userMessage}`;
      console.log(`🚫 [Qwen Think Mode] Added <no_think> tag to disable reasoning output`);
      return noThinkInstruction;
    } else {
      console.log(`💭 [Qwen Think Mode] Think mode enabled - showing reasoning process`);
      return userMessage;
    }
  }

  /**
   * Auto-detect if the endpoint/model supports function calls
   * We support function calls either natively or through text hijacking
   */
  private detectFunctionCallSupport(): boolean {
    // Known endpoints that support function calls natively
    const supportedEndpoints = [
      'https://api.openai.com',
      'https://api.anthropic.com',
      'https://generativelanguage.googleapis.com',
    ];

    // Check if it's a known supported endpoint
    const isKnownEndpoint = supportedEndpoints.some((endpoint) =>
      this.apiEndpoint.startsWith(endpoint),
    );

    if (isKnownEndpoint) {
      // For Gemini API, check if we want to force text hijacking for debugging
      if (this.apiEndpoint.includes('generativelanguage.googleapis.com') && 
          process.env.HIJACK_FORCE_FUNCTION_CALLS === 'true') {
        console.log('🔧 Forcing text hijack mode for Gemini API (debugging)');
        return true; // We'll handle via text hijacking
      }
      return true; // Native function call support
    }

    // For other endpoints, we can provide function call support via text hijacking
    const forceSupport = process.env.HIJACK_FORCE_FUNCTION_CALLS === 'true';
    if (forceSupport) {
      console.log(
        '🔧 Text hijack mode: System believes model supports function calls (using text guidance)',
      );
      return true; // Tell system we support tools via hijacking
    }

    return false;
  }

  /**
   * Convert Gemini request to OpenAI format with full conversation history support
   * This matches the standard Gemini API behavior: request.contents contains the FULL conversation history
   * Tools are provided via config (like native function definitions), not embedded in messages
   */
  private convertGeminiToOpenAI(
    request: GenerateContentParameters,
  ): OpenAIRequest {
    // Convert Gemini conversation history to OpenAI messages format
    const messages: OpenAIMessage[] = [];
    
    if (request.contents) {
      // Handle both array and single content - request.contents is the FULL conversation history
      const contents = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];
      
      console.log(`🔄 Converting ${contents.length} Gemini contents to OpenAI messages`);
      
      for (const content of contents) {
        if (content && typeof content === 'object' && 'role' in content) {
          // Extract text from parts
          let text = '';
          if (content.parts && content.parts.length > 0) {
            for (const part of content.parts) {
              if ('text' in part && part.text) {
                text += part.text;
              }
              // Handle function responses
              if ('functionResponse' in part && part.functionResponse) {
                // Convert function response to tool response format
                messages.push({
                  role: 'tool',
                  content: JSON.stringify(part.functionResponse.response),
                  tool_call_id: part.functionResponse.name || 'unknown'
                });
                continue;
              }
            }
          }
          
          // Convert Gemini roles to OpenAI roles
          if (content.role === 'user') {
            if (text.trim()) {
              // Add <no_think> for Qwen models if think mode is disabled
              const processedText = this.processQwenThinkMode(text);
              messages.push({
                role: 'user',
                content: processedText
              });
            }
          } else if (content.role === 'model') {
            if (text.trim()) {
              messages.push({
                role: 'assistant',
                content: text
              });
            }
          }
        } else if (typeof content === 'string') {
          // Handle direct string content (legacy)
          const processedText = this.processQwenThinkMode(content);
          messages.push({
            role: 'user',
            content: processedText
          });
        }
      }
    }

    // Handle tools based on function call support
    const tools: OpenAITool[] = [];

    // Handle tools from request (they come from toolRegistry in config)
    const requestTools = (request as any).config?.tools; // Tools are in config.tools, not request.tools
    
    if (requestTools && requestTools.length > 0) {
      // Determine if we should use text hijacking or native function calls
      const shouldUseTextHijacking = this.shouldUseTextHijacking();
      
      if (shouldUseTextHijacking) {
        console.log('🎯 Using text hijacking mode (adding system message with tool guidance)');
        
        // Add system message with tool guidance (like native function definitions)
        const toolGuidance = this.textHijackParser.createSystemToolGuidance(requestTools);
        messages.unshift({
          role: 'system',
          content: toolGuidance
        });
        
        console.log('📝 Added system tool guidance message');
        
        // Don't send actual function definitions to the model - use text guidance instead
        // tools array stays empty for the actual API call
      } else {
        console.log('🔧 Using native function call mode (sending actual function definitions)');
        // Convert Gemini tools to OpenAI format
        for (const tool of requestTools) {
          if (tool.functionDeclarations) {
            for (const func of tool.functionDeclarations) {
              tools.push({
                type: 'function',
                function: {
                  name: func.name,
                  description: func.description,
                  parameters: func.parameters,
                },
              });
            }
          }
        }
      }
    }

    // Apply role validation and conversion for proper conversation flow
    const validatedMessages = this.textHijackParser.validateConversationRoles(messages);

    console.log(`📜 Full conversation history: ${validatedMessages.length} messages (matches standard Gemini API behavior)`);

    return {
      model: this.model,
      messages: validatedMessages,
      tools: this.supportsFunctionCalls && tools.length > 0 ? tools : undefined,
    };
  }


  /**
   * Convert OpenAI response to Gemini format
   * This includes the KEY TEXT HIJACK PARSER for non-function-call models
   */
  private convertOpenAIToGemini(
    openaiResponse: OpenAIResponse,
  ): GenerateContentResponse {
    const result = new GenerateContentResponse();

    if (openaiResponse.choices && openaiResponse.choices.length > 0) {
      const choice = openaiResponse.choices[0];
      const message = choice.message;

      // Handle text content and extract tool calls if needed
      const parts: { text: string }[] = [];
      let functionCalls: {
        name: string;
        args: Record<string, unknown>;
        id: string;
      }[] = [];

      if (message.content) {
        // Determine which parsing mode to use
        const shouldUseTextHijacking = this.shouldUseTextHijacking();
        
        if (shouldUseTextHijacking) {
          // TEXT HIJACK PARSER: Parse tool calls from text content using shared parser
          console.log('🎯 Parsing text content for hijacked tool calls');
          
          // Use context preservation mode for multi-turn conversation continuity
          // Always preserve context since we now handle full conversation history
          const preserveContext = true;
          const parseResult = this.textHijackParser.parseTextForToolCalls(message.content, preserveContext);

          if (parseResult.toolCalls.length > 0) {
            console.log(
              `✅ Found ${parseResult.toolCalls.length} hijacked tool calls in text response`,
            );
            functionCalls = parseResult.toolCalls;

            // Include any remaining text as content to maintain conversation context
            if (parseResult.cleanText.trim()) {
              parts.push({ text: parseResult.cleanText });
            }
            
            // Note: We don't store in conversationHistory here because
            // the full conversation history comes from request.contents (Gemini API standard)
          } else {
            // No tool calls found, treat as regular text but still filter Qwen <think> blocks
            const filteredContent = this.textHijackParser.filterQwenThinkBlocks(message.content);
            parts.push({ text: filteredContent });
            
            // Note: We don't store in conversationHistory here because
            // the full conversation history comes from request.contents (Gemini API standard)
          }
        } else {
          // NATIVE FUNCTION CALL PARSER: Handle standard OpenAI function calls
          console.log('🔧 Using native function call parsing');
          
          // Always filter Qwen <think> blocks from content, even for native function calls
          const filteredContent = this.textHijackParser.filterQwenThinkBlocks(message.content);
          parts.push({ text: filteredContent });

          // Handle standard function calls from tool_calls field
          if (message.tool_calls && message.tool_calls.length > 0) {
            console.log(`✅ Found ${message.tool_calls.length} native function calls`);
            for (const toolCall of message.tool_calls) {
              if (toolCall.type === 'function' && toolCall.function) {
                let args = {};
                try {
                  args = JSON.parse(toolCall.function.arguments);
                } catch (_e) {
                  console.warn(
                    'Failed to parse function arguments:',
                    toolCall.function.arguments,
                  );
                }

                functionCalls.push({
                  name: toolCall.function.name,
                  args,
                  id: toolCall.id,
                });
              }
            }
            
            // Note: We don't store in conversationHistory here because
            // the full conversation history comes from request.contents (Gemini API standard)
          } else {
            // Note: We don't store in conversationHistory here because
            // the full conversation history comes from request.contents (Gemini API standard)
          }
        }
      }

      result.candidates = [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason:
            choice.finish_reason === 'stop'
              ? FinishReason.STOP
              : FinishReason.OTHER,
          index: 0,
        },
      ];

      // Set function calls if any (this is the key hijack result)
      if (functionCalls.length > 0) {
        // Use Object.defineProperty to work around readonly restriction
        Object.defineProperty(result, 'functionCalls', {
          value: functionCalls,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    // Set usage metadata
    result.usageMetadata = {
      promptTokenCount: openaiResponse.usage?.prompt_tokens || 0,
      candidatesTokenCount: openaiResponse.usage?.completion_tokens || 0,
      totalTokenCount: openaiResponse.usage?.total_tokens || 0,
    };

    return result;
  }

  // Note: Conversation history is now handled directly from request.contents
  // This matches the standard Gemini API behavior where the full conversation
  // history is passed in each request via contents array

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      console.log('🚀 Making OpenAI compatible API call...');

      const openaiRequest = this.convertGeminiToOpenAI(request);

      
      // Add timeout to prevent hanging (extended for complex operations)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error('🚨 API call timed out after 300 seconds');
      }, 300000); // Increased to 5 minutes

      try {
        const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openaiRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const openaiResponse: OpenAIResponse = await response.json();
        console.log('✅ OpenAI API call successful');

        return this.convertOpenAIToGemini(openaiResponse);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('🚨 API request was aborted (likely due to timeout)');
          throw new Error('API request timed out after 5 minutes');
        }
        
        console.error('🚨 API call failed:', fetchError);
        throw fetchError;
      }
    } catch (error) {
      console.error('❌ OpenAI API call failed:', error);
      throw error;
    }
  }

  async generateContentStream(
    _request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For now, use non-streaming version
    const response = await this.generateContent(_request);

    return (async function* () {
      yield response;
    })();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Basic implementation - just estimate
    let text = '';
    if (request.contents) {
      // Handle both array and single content
      const contents = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];
      if (contents.length > 0) {
        const content = contents[0];
        // Handle content that has parts (object format)
        if (
          content &&
          typeof content === 'object' &&
          'parts' in content &&
          content.parts &&
          content.parts.length > 0
        ) {
          const part = content.parts[0];
          if ('text' in part && part.text) {
            text = part.text;
          }
        } else if (typeof content === 'string') {
          // Handle direct string content
          text = content;
        }
      }
    }

    // Rough estimation: 1 token per 4 characters
    const tokenCount = Math.ceil(text.length / 4);

    return {
      totalTokens: tokenCount,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embedding not supported in OpenAI compatible mode');
  }
}

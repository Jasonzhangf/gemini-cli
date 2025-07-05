/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleGenAI,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Tool,
  FunctionCall,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { TextHijackParser } from './textHijackParser.js';

/**
 * Gemini Content Generator with Forced Text Hijacking for Function Calls
 * 
 * This class wraps the official Gemini API but intercepts function call requests
 * and converts them to text-based instructions when HIJACK_FORCE_FUNCTION_CALLS=true.
 * 
 * Behavior:
 * - Text content: Uses official Gemini API directly
 * - Function calls: Converts to text instructions and parses JSON responses
 */
export class GeminiWithForcedTextHijack implements ContentGenerator {
  private googleGenAI: GoogleGenAI;
  private model: string;
  private thinkMode: boolean;
  private textHijackParser: TextHijackParser;

  constructor(
    apiKey: string,
    model: string,
    vertexai: boolean,
    httpOptions: any,
    thinkMode: boolean = false
  ) {
    this.googleGenAI = new GoogleGenAI({
      apiKey: apiKey === '' ? undefined : apiKey,
      vertexai,
      httpOptions,
    });
    this.model = model;
    this.thinkMode = thinkMode;
    
    // Initialize shared text hijack parser
    this.textHijackParser = new TextHijackParser(model, 'gemini-api');
    
    console.log('🔧 GeminiWithForcedTextHijack initialized');
    console.log(`   Model: ${model}`);
    console.log(`   Think Mode: ${thinkMode ? 'ENABLED' : 'DISABLED'}`);
    console.log('🔧 Shared text hijack parser initialized');
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    // Check if this request has tools
    const requestTools = (request as any).config?.tools;
    
    if (requestTools && requestTools.length > 0) {
      console.log('🎯 Function call request detected - using text hijacking mode');
      return this.generateContentWithTextHijacking(request, requestTools);
    } else {
      console.log('📝 Regular text request - using official Gemini API');
      const response = await this.googleGenAI.models.generateContent(request);
      
      // Still apply Qwen think filtering for regular responses
      return this.filterQwenThinkInResponse(response);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For streaming, we'll use the non-streaming version for now
    // This could be enhanced later to support true streaming with text hijacking
    const response = await this.generateContent(request);
    return (async function* () {
      yield response;
    })();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return this.googleGenAI.models.countTokens(request);
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.googleGenAI.models.embedContent(request);
  }

  /**
   * Generate content with text hijacking for function calls
   */
  private async generateContentWithTextHijacking(
    request: GenerateContentParameters,
    tools: Tool[]
  ): Promise<GenerateContentResponse> {
    // Process the FULL conversation history (same as standard Gemini API)
    // Add system-level tool guidance (like native function definitions)
    const allContents: any[] = [];
    
    // Add system message with tool guidance at the beginning
    const systemToolGuidance = this.textHijackParser.createSystemToolGuidance(tools);
    allContents.push({
      role: 'user',
      parts: [{ text: systemToolGuidance }]
    });
    
    if (request.contents) {
      const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
      console.log(`🔄 Processing ${contents.length} contents from full conversation history`);
      
      // Keep ALL conversation history as-is (no per-message enhancement)
      for (const content of contents) {
        if (content && typeof content === 'object' && 'role' in content) {
          allContents.push(content);
        } else if (typeof content === 'string') {
          // Handle direct string content (legacy)
          allContents.push({
            role: 'user',
            parts: [{ text: content }]
          });
        }
      }
    }
    
    console.log('📝 Added system tool guidance (like native function definitions)');

    // Create modified request with system guidance + FULL conversation history
    const modifiedRequest = {
      ...request,
      contents: allContents,
    };

    // Remove tools from the request to make it a pure text request
    if ((modifiedRequest as any).config) {
      delete (modifiedRequest as any).config.tools;
    }

    console.log(`📚 Sending system guidance + full conversation history (${allContents.length} contents) to Gemini API`);

    // Call official Gemini API with system guidance + full conversation history
    const response = await this.googleGenAI.models.generateContent(modifiedRequest);

    // Parse the response for tool calls
    return this.parseResponseForToolCalls(response);
  }


  /**
   * Parse Gemini response for JSON tool calls (similar to OpenAI compatible generator)
   */
  private parseResponseForToolCalls(response: GenerateContentResponse): GenerateContentResponse {
    if (!response.candidates || response.candidates.length === 0) {
      return response;
    }

    const candidate = response.candidates[0];
    const content = candidate.content;
    
    if (!content?.parts || content.parts.length === 0) {
      return response;
    }

    // Extract text from parts
    let textContent = '';
    for (const part of content.parts) {
      if ('text' in part && part.text) {
        textContent += part.text;
      }
    }

    if (!textContent) {
      return response;
    }

    // Parse tool calls from text using shared parser with context preservation for multi-turn conversations
    const preserveContext = true; // Always preserve context in Gemini forced text hijacking
    const parseResult = this.textHijackParser.parseTextForToolCalls(textContent, preserveContext);
    
    if (parseResult.toolCalls.length > 0) {
      console.log(`✅ Found ${parseResult.toolCalls.length} text-hijacked tool calls in Gemini response`);
      
      // Convert to Gemini function call format
      const functionCalls: FunctionCall[] = parseResult.toolCalls.map(toolCall => ({
        name: toolCall.name,
        args: toolCall.args,
      }));

      // Modify response to include function calls
      const modifiedResponse = new GenerateContentResponse();
      
      // Copy all properties from original response
      Object.assign(modifiedResponse, response);
      
      // Use Object.defineProperty to set function calls (similar to OpenAI compatible generator)
      Object.defineProperty(modifiedResponse, 'functionCalls', {
        value: functionCalls,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      
      // Update candidates with cleaned text (preserve reasoning context)
      modifiedResponse.candidates = [{
        ...candidate,
        content: {
          ...content,
          parts: parseResult.cleanText ? [{ text: parseResult.cleanText }] : [],
        }
      }];

      console.log(`📝 Preserved conversation context with tool calls for multi-turn continuity`);
      return modifiedResponse;
    }

    return response;
  }

  /**
   * Filter Qwen <think></think> blocks from regular Gemini responses
   */
  private filterQwenThinkInResponse(response: GenerateContentResponse): GenerateContentResponse {
    if (!response.candidates || response.candidates.length === 0) {
      return response;
    }

    const candidate = response.candidates[0];
    const content = candidate.content;
    
    if (!content?.parts || content.parts.length === 0) {
      return response;
    }

    // Filter <think> blocks from text parts
    const filteredParts = content.parts.map(part => {
      if ('text' in part && part.text) {
        const filteredText = this.textHijackParser.filterQwenThinkBlocks(part.text);
        return { ...part, text: filteredText };
      }
      return part;
    });

    // Create modified response with filtered content
    const modifiedResponse = new GenerateContentResponse();
    Object.assign(modifiedResponse, response);
    
    modifiedResponse.candidates = [{
      ...candidate,
      content: {
        ...content,
        parts: filteredParts,
      }
    }];

    return modifiedResponse;
  }

}
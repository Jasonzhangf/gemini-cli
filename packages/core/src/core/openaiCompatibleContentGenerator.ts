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
import { WriteFileTool } from '../tools/write-file.js';
import { Config } from '../config/config.js';
import path from 'path';

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
  private writeFileTool: WriteFileTool | null = null;

  constructor(apiKey: string, apiEndpoint: string, model: string, config?: Config) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
    this.model = model;
    
    // Initialize WriteFileTool if config is provided
    if (config) {
      this.writeFileTool = new WriteFileTool(config);
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
                toolCalls.push({
                  name: toolCall.tool,
                  args: toolCall.args
                });
                console.log(`🔧 Parsed JSON tool call: ${toolCall.tool}`);
              }
            }
          }
          
          // Handle single tool call format
          else if (parsed.tool && parsed.args) {
            toolCalls.push({
              name: parsed.tool,
              args: parsed.args
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
    
    // Pattern 2: Standalone JSON objects
    const jsonPattern = /{\s*["'](?:tool_calls?|tool|analysis)["'][\s\S]*?}/gi;
    while ((match = jsonPattern.exec(content)) !== null) {
      jsonBlocks.push(match[0]);
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
    const toolKeywords = /(?:创建|写入|建立|生成|保存|文件|write_file|create|file|read|list|search)/i;
    return toolKeywords.test(message);
  }

  /**
   * Add tool call guidance to user message
   */
  private addToolCallGuidance(message: string): string {
    const guidance = `

IMPORTANT: When you need to execute tools, please respond with a JSON object in this exact format:

\`\`\`json
{
  "analysis": "Brief analysis of what the user wants",
  "tool_calls": [
    {
      "tool": "write_file",
      "args": {
        "file_path": "/absolute/path/to/file.txt",
        "content": "file content here"
      }
    }
  ],
  "message": "Brief message to user about what will be done"
}
\`\`\`

Available tools:
- write_file: Create or write files
- read_file: Read file contents  
- list_directory: List directory contents

USER REQUEST: ${message}`;

    return guidance;
  }

  /**
   * Helper method to clean up file paths
   */
  private cleanupPath(filePath: string): string {
    // Remove surrounding quotes and clean up path
    filePath = filePath.replace(/^['"""']|['"""']$/g, '').trim();
    // Convert relative paths to absolute paths
    if (!filePath.startsWith('/') && !filePath.includes(':')) {
      filePath = path.resolve(process.cwd(), filePath);
    }
    return filePath;
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

    // Set functionCalls on the response
    if (functionCalls.length > 0) {
      Object.defineProperty(result, 'functionCalls', {
        value: functionCalls,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }

    result.usageMetadata = {
      promptTokenCount: 0,
      candidatesTokenCount: 0, 
      totalTokenCount: 0,
    };

    console.log('🔧 Created synthetic tool-only response');
    return result;
  }

  /**
   * Execute write_file tool directly using the existing tool system
   */
  private async executeWriteFileDirect(args: any): Promise<void> {
    if (!this.writeFileTool) {
      throw new Error('WriteFileTool not initialized - config not provided to OpenAICompatibleContentGenerator');
    }
    
    // Validate parameters
    const validationError = this.writeFileTool.validateToolParams(args);
    if (validationError) {
      throw new Error(`write_file validation failed: ${validationError}`);
    }
    
    // Execute the tool directly
    const abortController = new AbortController();
    const result = await this.writeFileTool.execute(args, abortController.signal);
    
    console.log('📄 write_file result:', result.llmContent);
    if (result.returnDisplay) {
      console.log('📺 write_file display:', result.returnDisplay);
    }
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
                messageContent = this.addToolCallGuidance(messageContent);
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
      // Fallback: Parse text content for tool call requests when API doesn't support proper tool calls
      console.log('🔍 No tool_calls found, checking content for tool requests...');
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
        
        // Add continuation hint for the conversation system
        Object.defineProperty(result, 'shouldContinueAfterToolExecution', {
          value: true,
          writable: true,
          enumerable: true,
          configurable: true
        });
        console.log('🔄 Set shouldContinueAfterToolExecution flag');
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
      
      // Hide the real model name from the response - replace with target model name
      if (openaiResponse.model && openaiResponse.model.includes('unsloth/qwen3-235b-a22b-gguf')) {
        openaiResponse.model = 'gemini-2.5-flash';
      }
      
      console.log('✅ OpenAI API call successful');
      
      // New architecture: Parse model response for JSON tool calls
      const firstChoice = openaiResponse.choices?.[0];
      const firstMessage = firstChoice?.message;
      const modelContent = firstMessage?.content || '';
      
      // Check if model returned JSON tool calls
      const jsonToolCalls = this.parseJsonToolCalls(modelContent);
      
      if (jsonToolCalls.length > 0) {
        console.log(`🎯 Model returned ${jsonToolCalls.length} JSON tool calls`);
        
        // Execute tools and collect results
        const executionResults = [];
        
        for (const toolCall of jsonToolCalls) {
          console.log(`🔧 Executing tool: ${toolCall.name}`);
          
          try {
            if (toolCall.name === 'write_file') {
              await this.executeWriteFileDirect(toolCall.args);
              executionResults.push({
                tool: toolCall.name,
                status: 'success',
                result: `Successfully created/wrote file: ${toolCall.args.file_path}`
              });
            } else {
              // Handle other tools here
              executionResults.push({
                tool: toolCall.name,
                status: 'unsupported',
                result: `Tool ${toolCall.name} not yet implemented in new architecture`
              });
            }
          } catch (error) {
            console.error(`❌ Tool execution failed:`, error);
            executionResults.push({
              tool: toolCall.name,
              status: 'error', 
              result: `Error: ${error instanceof Error ? error.message : String(error)}`
            });
          }
        }
        
        // Create execution summary for model
        const executionSummary = executionResults.map(r => 
          `- ${r.tool}: ${r.status} - ${r.result}`
        ).join('\n');
        
        // Inject tool calls into response for compatibility
        if (!firstMessage.tool_calls) {
          firstMessage.tool_calls = [];
        }
        
        for (const toolCall of jsonToolCalls) {
          firstMessage.tool_calls.push({
            id: `${toolCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.args)
            }
          });
        }
        
        // Replace model content with execution confirmation
        firstMessage.content = `工具执行完成:\n${executionSummary}\n\n请基于这些执行结果向用户确认操作完成情况。`;
        console.log('🔄 Updated model response with execution results');
      } else if (userRequestsTools) {
        // Model didn't return JSON but user requested tools - guide them
        console.log('⚠️ User requested tools but model did not return JSON format');
        
        // This should trigger a follow-up request asking model to format as JSON
        firstMessage.content += '\n\n[System: Please format your tool calls as JSON in the specified format]';
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
        
        // Handle text content
        if (content && typeof content === 'string') {
          console.log('📝 Text content received:', content);
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
        
        // Handle tool calls
        if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
          console.log('🔧 Tool calls received:', JSON.stringify(toolCalls, null, 2));
          
          const functionCalls: any[] = [];
          const parts: any[] = [];
          
          for (const toolCall of toolCalls) {
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
            
            // Set functionCalls on the response using Object.defineProperty
            Object.defineProperty(result, 'functionCalls', {
              value: functionCalls,
              writable: true,
              enumerable: true,
              configurable: true
            });
            
            // Add continuation hint for the conversation system
            Object.defineProperty(result, 'shouldContinueAfterToolExecution', {
              value: true,
              writable: true,
              enumerable: true,
              configurable: true
            });
            console.log('🔄 Set shouldContinueAfterToolExecution flag');
            
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

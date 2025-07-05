/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from '@google/genai';
import { parameterMappingManager } from '../config/parameter-mappings/index.js';

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

export interface TextParseResult {
  toolCalls: ParsedToolCall[];
  cleanText: string;
  originalText?: string; // Preserve original text for context analysis
}

/**
 * Shared Text Hijack Parser
 * 
 * This module provides common functionality for parsing tool calls from text responses
 * and can be used by both OpenAI compatible generator and Gemini forced text hijacking.
 */
export class TextHijackParser {
  private model: string;
  private apiEndpoint: string;

  constructor(model: string, apiEndpoint: string = '') {
    this.model = model;
    this.apiEndpoint = apiEndpoint;
  }

  /**
   * Filter content for Qwen models - removes <think></think> blocks
   * This should be called for ALL Qwen model responses, not just tool calls
   */
  filterQwenThinkBlocks(content: string): string {
    const isQwenModel = this.model.toLowerCase().includes('qwen') || 
                       this.model.toLowerCase().includes('qwq');
    
    if (!isQwenModel) {
      return content;
    }

    // Remove all <think>...</think> blocks (including nested content)
    const filteredContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    if (filteredContent !== content) {
      console.log('🧠 Filtered out <think> blocks from Qwen model response');
    }

    return filteredContent;
  }

  /**
   * Create system-level tool guidance (like native function definitions)
   * This provides tool information globally, not per-message
   */
  createSystemToolGuidance(tools: Tool[]): string {
    const toolDescriptions: string[] = [];

    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          const params = func.parameters?.properties || {};
          const required = func.parameters?.required || [];

          const paramList = Object.keys(params)
            .map((param) => {
              const paramInfo = params[param];
              const isRequired = required.includes(param) ? ' (required)' : ' (optional)';
              return `    "${param}": ${paramInfo.type}${isRequired} - ${paramInfo.description}`;
            })
            .join('\n');

          toolDescriptions.push(`**${func.name}**: ${func.description}
  Parameters:
${paramList || '    None'}`);
        }
      }
    }

    const systemGuidance = `You are an AI assistant with access to the following tools. When the user asks you to perform tasks that require tools, you MUST use the appropriate tools by responding with JSON in this exact format:

\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": {"param": "value"}
  }
}
\`\`\`

Available tools:
${toolDescriptions.join('\n\n')}

CRITICAL INSTRUCTIONS:
- You MUST use tools for tasks like creating files, reading files, running commands, etc.
- ALWAYS respond with the exact JSON format shown above when using tools
- Include all required parameters in the arguments object
- For file operations, use absolute paths (e.g., "/Users/fanzhang/Documents/github/gemini-cli/test_hijack/filename.txt")
- You can provide brief explanatory text along with tool calls, but the JSON tool call is mandatory
- If the user asks to create a file, you must use the write_file tool
- If the user asks to read content, you must use the read_file tool

EXAMPLES:

Creating a file:
User: "创建一个名为hello.txt的文件，内容为Hello World"
You must respond with:
\`\`\`json
{
  "tool_call": {
    "name": "write_file",
    "arguments": {
      "file_path": "/Users/fanzhang/Documents/github/gemini-cli/test_hijack/hello.txt",
      "content": "Hello World"
    }
  }
}
\`\`\`

Reading a file:
User: "请读取hello.txt文件的内容"
You must respond with:
\`\`\`json
{
  "tool_call": {
    "name": "read_file",
    "arguments": {
      "absolute_path": "/Users/fanzhang/Documents/github/gemini-cli/test_hijack/hello.txt"
    }
  }
}
\`\`\`

DO NOT just provide conversational responses when tools are required. You must execute the requested action using the appropriate tool.`;

    return systemGuidance;
  }

  /**
   * Convert tools to text guidance for models that don't support native function calls
   * @deprecated Use createSystemToolGuidance for better architecture
   */
  convertToolsToTextGuidance(userMessage: string, tools: Tool[]): string {
    const toolDescriptions: string[] = [];

    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          const params = func.parameters?.properties || {};
          const required = func.parameters?.required || [];

          const paramList = Object.keys(params)
            .filter(param => required.includes(param)) // Only show required params for simplicity
            .map((param) => {
              const paramInfo = params[param];
              return `"${param}": ${paramInfo.type} - ${paramInfo.description}`;
            })
            .join(', ');

          toolDescriptions.push(`• **${func.name}**: ${func.description}
  Required: ${paramList || 'None'}`);
        }
      }
    }

    const guidance = `User Request: ${userMessage}

🔧 TOOL CALL REQUIRED: You must use tools to complete this request.

FORMAT: Respond with this exact JSON structure:
\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": {"param": "value"}
  }
}
\`\`\`

EXAMPLE for listing directory:
\`\`\`json
{
  "tool_call": {
    "name": "list_directory",
    "arguments": {"path": "/Users/fanzhang/Documents/github/gemini-cli"}
  }
}
\`\`\`

Available tools:
${toolDescriptions.join('\n')}

⚠️ CRITICAL: Start your response with the JSON tool call above. The user will execute it and give you results.`;

    return guidance;
  }

  /**
   * Parse text content for JSON tool calls
   * This is the CORE TEXT HIJACK PARSER shared by all implementations
   */
  parseTextForToolCalls(content: string, preserveContext: boolean = false): TextParseResult {
    const toolCalls: ParsedToolCall[] = [];
    let originalCleanText = '';
    
    // Step 1: Always filter <think></think> blocks for Qwen models first
    let cleanText = this.filterQwenThinkBlocks(content);
    originalCleanText = cleanText; // Preserve original for context

    // Step 2: Look for JSON code blocks or inline JSON
    const jsonPatterns = [
      // JSON code blocks
      /```json\s*(\{[\s\S]*?\})\s*```/g,
      // Inline JSON objects that look like tool calls
      /(\{\s*"tool_call"\s*:\s*\{[\s\S]*?\}\s*\})/g,
    ];

    for (const pattern of jsonPatterns) {
      let match;
      while ((match = pattern.exec(cleanText)) !== null) {
        try {
          const jsonStr = match[1];
          const parsed = JSON.parse(jsonStr);

          // Check if it's a tool call
          if (
            parsed.tool_call &&
            parsed.tool_call.name &&
            parsed.tool_call.arguments
          ) {
            let toolCall: ParsedToolCall = {
              name: parsed.tool_call.name,
              args: parsed.tool_call.arguments,
              id: `text-hijack-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            };

            // Apply parameter mapping if available
            const parameterMapping = parameterMappingManager.findMapping(this.model, this.apiEndpoint);
            if (parameterMapping) {
              const mappingResult = parameterMappingManager.applyMapping(
                toolCall.name,
                toolCall.args,
                parameterMapping
              );
              if (mappingResult.mapped) {
                toolCall.args = mappingResult.mappedArgs;
                console.log(`🔧 Applied parameter mapping to ${toolCall.name}: ${mappingResult.appliedMappings.join(', ')}`);
              }
            }

            toolCalls.push(toolCall);
            console.log(`🔧 Extracted tool call: ${toolCall.name}`);

            // Remove this JSON from the clean text
            cleanText = cleanText.replace(match[0], '').trim();
          }
        } catch (_e) {
          // Invalid JSON, skip
          console.warn('Failed to parse potential tool call JSON:', match[1]);
        }
      }
    }

    // Step 3: Handle text content based on context preservation settings
    if (toolCalls.length > 0) {
      if (preserveContext) {
        // CONTEXT PRESERVATION MODE: Keep explanatory text for multi-turn conversation continuity
        // This helps maintain conversation context between turns
        console.log(`📝 Preserving context text with ${toolCalls.length} tool calls for conversation continuity`);
        // cleanText already has JSON removed but retains explanatory text
      } else {
        // STANDARD MODE: Remove all text content to match native function call behavior
        // Native function calls typically have empty or minimal text content
        cleanText = '';
        console.log(`🧹 Removed all text content for tool calls (matching native function call behavior)`);
      }
    }

    return { 
      toolCalls, 
      cleanText,
      originalText: originalCleanText // Preserve original for context analysis
    };
  }

  /**
   * Convert user/tool role bidirectionally for proper conversation flow
   * This handles the role conversion needed in text hijacking mode
   */
  convertMessageRole(message: any, hasToolCalls: boolean): any {
    // If the message contains tool calls, convert user role to assistant role
    if (hasToolCalls && message.role === 'user') {
      console.log('🔄 Converting role: user → assistant (due to tool calls)');
      return {
        ...message,
        role: 'assistant'
      };
    }
    
    // If this is a tool response, ensure it has the correct tool role
    if (message.tool_call_id && message.role !== 'tool') {
      console.log('🔄 Converting role: → tool (tool response)');
      return {
        ...message,
        role: 'tool'
      };
    }
    
    return message;
  }

  /**
   * Ensure proper conversation flow by validating and fixing role sequences
   * Standard conversation should be: user → assistant [with tool_calls] → tool → assistant → ...
   */
  validateConversationRoles(messages: any[]): any[] {
    const fixedMessages = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
      
      // Apply role conversion
      const convertedMessage = this.convertMessageRole(message, hasToolCalls);
      fixedMessages.push(convertedMessage);
    }
    
    console.log(`🔄 Validated conversation roles for ${fixedMessages.length} messages`);
    return fixedMessages;
  }
}
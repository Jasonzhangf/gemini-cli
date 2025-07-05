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
   * Convert tools to text guidance for models that don't support native function calls
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
  parseTextForToolCalls(content: string): TextParseResult {
    const toolCalls: ParsedToolCall[] = [];
    let cleanText = content;

    // Step 1: Remove <think></think> blocks for Qwen models
    const isQwenModel = this.model.toLowerCase().includes('qwen') || 
                       this.model.toLowerCase().includes('qwq');
    
    if (isQwenModel) {
      // Remove all <think>...</think> blocks (including nested content)
      cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (cleanText !== content) {
        console.log('🧠 Filtered out <think> blocks from model response');
      }
    }

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

    // Step 3: Clean up remaining content to match function call behavior
    // If we found tool calls, we should minimize remaining text content
    // to match the behavior of native function calls (which typically have minimal or no text)
    if (toolCalls.length > 0) {
      // Remove common instruction/guidance text that might remain
      cleanText = cleanText
        .replace(/User Request:[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove "User Request:" sections
        .replace(/🔧 TOOL CALL REQUIRED:[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove tool guidance
        .replace(/FORMAT:[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove format instructions
        .replace(/EXAMPLE[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove examples
        .replace(/Available tools:[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove tool lists
        .replace(/⚠️ CRITICAL:[\s\S]*?(?=\n\n|\n$|$)/g, '') // Remove critical instructions
        .trim();
      
      // If after cleanup there's only whitespace or common filler text, remove it entirely
      if (!cleanText || cleanText.match(/^[\s\n\r]*$/) || 
          cleanText.includes('I\'ll help') || 
          cleanText.includes('Let me')) {
        cleanText = '';
      }
      
      console.log(`🧹 Cleaned text content: ${cleanText.length > 0 ? `"${cleanText.substring(0, 100)}..."` : 'empty (function call only)'}`);
    }

    return { toolCalls, cleanText };
  }
}
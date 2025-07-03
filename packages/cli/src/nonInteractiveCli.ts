/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
} from '@fanzhang/gemini-cli-core-hijack';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
} from '@google/genai';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';

/**
 * Parse JSON tool calls from model response text
 */
function parseJsonToolCalls(content: string): Array<{name: string, args: any}> {
  const toolCalls: Array<{name: string, args: any}> = [];
  
  try {
    // Look for JSON blocks in the response
    const jsonBlocks = extractJsonBlocks(content);
    
    for (const jsonBlock of jsonBlocks) {
      try {
        const parsed = JSON.parse(jsonBlock);
        
        // Handle structured tool calls format
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          for (const toolCall of parsed.tool_calls) {
            if (toolCall.tool) {
              const args = toolCall.args || {};
              toolCalls.push({
                name: toolCall.tool,
                args: args
              });
            }
          }
        }
        
        // Handle single tool call format
        else if (parsed.tool) {
          const args = parsed.args || {};
          toolCalls.push({
            name: parsed.tool,
            args: args
          });
        }
      } catch (parseError) {
        // Skip invalid JSON blocks
        continue;
      }
    }
  } catch (error) {
    // Skip if no JSON found
  }
  
  return toolCalls;
}

/**
 * Extract JSON blocks from text content
 */
function extractJsonBlocks(content: string): string[] {
  const jsonBlocks: string[] = [];
  
  // Pattern 1: JSON code blocks
  const codeBlockPattern = /```(?:json)?\s*({[\s\S]*?})\s*```/gi;
  let match;
  while ((match = codeBlockPattern.exec(content)) !== null) {
    jsonBlocks.push(match[1]);
  }
  
  // Pattern 2: Standalone JSON objects
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('{') && (line.includes('tool_calls') || line.includes('tool'))) {
      // Try to find the complete JSON object
      let jsonStr = '';
      let braceCount = 0;
      let startFound = false;
      
      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j];
        jsonStr += currentLine + '\n';
        
        for (const char of currentLine) {
          if (char === '{') {
            braceCount++;
            startFound = true;
          } else if (char === '}') {
            braceCount--;
          }
        }
        
        if (startFound && braceCount === 0) {
          const cleanJson = jsonStr.trim();
          if (cleanJson.startsWith('{') && cleanJson.endsWith('}')) {
            jsonBlocks.push(cleanJson);
          }
          break;
        }
      }
      break; // Only process the first JSON object found
    }
  }
  
  return jsonBlocks;
}

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // We are running in headless mode so we don't need to return thoughts to STDOUT.
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

export async function runNonInteractive(
  config: Config,
  input: string,
): Promise<void> {
  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];

  try {
    while (true) {
      const functionCalls: FunctionCall[] = [];

      // Check if we should force JSON tool calls instead of native function calls
      const forceJsonToolCalls = process.env.FORCE_JSON_TOOL_CALLS === 'true';
      
      let messageToSend = currentMessages[0]?.parts || [];
      let configToSend: any = {
        abortSignal: abortController.signal,
      };
      
      if (forceJsonToolCalls) {
        console.log('🔧 FORCE_JSON_TOOL_CALLS enabled - disabling native function calls, using JSON tool call guidance');
        
        // Don't send tools to Gemini API - this forces pure text mode
        // Instead, add tool guidance to the user message
        if (messageToSend.length > 0 && messageToSend[0].text) {
          const originalMessage = messageToSend[0].text;
          const toolDeclarations = toolRegistry.getFunctionDeclarations();
          const toolList = toolDeclarations.map(tool => tool.name).join(', ');
          
          const guidedMessage = `${originalMessage}

IMPORTANT: You cannot directly execute tools. When you need tools, return a JSON block with tool_calls:

\`\`\`json
{
  "tool_calls": [
    {
      "tool": "read_file",
      "args": {
        "absolute_path": "/path/to/file.txt"
      }
    }
  ]
}
\`\`\`

Available tools: ${toolList}

After I execute the tools, I will provide the results and you can continue.`;
          
          messageToSend = [{ text: guidedMessage }];
        }
      } else {
        // Normal mode - send tools to enable native function calls
        configToSend.tools = [
          { functionDeclarations: toolRegistry.getFunctionDeclarations() },
        ];
      }

      const responseStream = await chat.sendMessageStream({
        message: messageToSend,
        config: configToSend,
      });

      let accumulatedText = '';
      
      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }
        const textPart = getResponseText(resp);
        if (textPart) {
          accumulatedText += textPart;
          process.stdout.write(textPart);
        }
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
      }
      
      // If FORCE_JSON_TOOL_CALLS is enabled and no native function calls were received,
      // try to parse JSON tool calls from the accumulated text
      if (forceJsonToolCalls && functionCalls.length === 0 && accumulatedText) {
        console.log('\n🔧 Parsing JSON tool calls from model response...');
        const jsonToolCalls = parseJsonToolCalls(accumulatedText);
        
        if (jsonToolCalls.length > 0) {
          console.log(`🎯 Found ${jsonToolCalls.length} JSON tool calls - but tool execution is DISABLED for verification`);
          console.log('📋 JSON tool calls detected:');
          
          for (const jsonToolCall of jsonToolCalls) {
            console.log(`   - ${jsonToolCall.name}: ${JSON.stringify(jsonToolCall.args)}`);
          }
          
          console.log('🚫 Tool execution bypassed - model cannot access tools');
          console.log('✅ Verification: JSON tool call hijacking system is working correctly');
          
          // DO NOT convert to function calls - this proves the hijack system works
          // functionCalls remain empty, so no tools will be executed
        } else {
          console.log('ℹ️  No JSON tool calls found in response');
        }
      }

      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const callId = fc.id ?? `${fc.name}-${Date.now()}`;
          const requestInfo: ToolCallRequestInfo = {
            callId,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
          };

          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );

          if (toolResponse.error) {
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            process.exit(1);
          }

          if (toolResponse.responseParts) {
            const parts = Array.isArray(toolResponse.responseParts)
              ? toolResponse.responseParts
              : [toolResponse.responseParts];
            for (const part of parts) {
              if (typeof part === 'string') {
                toolResponseParts.push({ text: part });
              } else if (part) {
                toolResponseParts.push(part);
              }
            }
          }
        }
        
        // Always continue the conversation with the tool response.
        console.log(`🔄 Tool execution completed - continuing with next steps...`);
        const continuationParts = [
          ...toolResponseParts
        ];
        currentMessages = [{ role: 'model', parts: continuationParts }];
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig().authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}

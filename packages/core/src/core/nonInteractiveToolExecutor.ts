/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolRegistry,
  ToolResult,
} from '../index.js';
import { Config } from '../config/config.js';
import { convertToFunctionResponse } from './coreToolScheduler.js';

/**
 * Executes a single tool call non-interactively.
 * It does not handle confirmations, multiple calls, or live updates.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  // 使用 ToolRegistry 的新执行方法，支持适配器转换
  const adapter = toolRegistry.getModelCapabilityAdapter();
  let realToolName = toolCallRequest.name;
  let realArgs = toolCallRequest.args;

  if (adapter) {
    const converted = adapter.convertToolCall(toolCallRequest.name, toolCallRequest.args);
    realToolName = converted.realToolName;
    realArgs = converted.realArgs;
    
    if (realToolName !== toolCallRequest.name) {
      console.log(`🔄 Tool call converted in executor: "${toolCallRequest.name}" → "${realToolName}"`);
    }
  }

  const tool = toolRegistry.getTool(realToolName);

  const startTime = Date.now();
  if (!tool) {
    const error = new Error(
      `Tool "${realToolName}" not found in registry (original request: "${toolCallRequest.name}").`,
    );
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: realToolName,
      function_args: realArgs,
      duration_ms: durationMs,
      success: false,
      error: error.message,
    });
    // Ensure the response structure matches what the API expects for an error
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }

  try {
    // Directly execute without confirmation or live output handling
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.execute(
      realArgs,
      effectiveAbortSignal,
      // No live output callback for non-interactive mode
    );

    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: realToolName,
      function_args: realArgs,
      duration_ms: durationMs,
      success: true,
    });

    const response = convertToFunctionResponse(
      toolCallRequest.name, // 保持原始调用ID用于响应匹配
      toolCallRequest.callId,
      toolResult.llmContent,
    );

    return {
      callId: toolCallRequest.callId,
      responseParts: response,
      resultDisplay: toolResult.returnDisplay,
      error: undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: realToolName,
      function_args: realArgs,
      duration_ms: durationMs,
      success: false,
      error: error.message,
    });
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }
}

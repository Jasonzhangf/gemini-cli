/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerGeminiStreamEvent, GeminiEventType } from '../../core/turn.js';
import { ToolCall } from './types.js';
import { ResponseProcessor } from './response-processor.js';

/**
 * 细菌式编程：流适配器操纵子
 * 小巧：仅负责流事件转换
 * 模块化：独立的流处理单元
 * 自包含：完整的流适配功能
 */
export class StreamAdapter {
  private accumulatedContent: string = '';
  private isFirstContent: boolean = true;

  async* processStream(
    openaiStream: AsyncIterable<any>,
    promptId: string
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    
    for await (const chunk of openaiStream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        this.accumulatedContent += delta.content;
        
        // 发送内容事件
        yield {
          type: GeminiEventType.Content,
          value: delta.content
        };

        this.isFirstContent = false;
      }

      // 处理完成事件
      if (chunk.choices?.[0]?.finish_reason === 'stop') {
        yield* this.processCompletedResponse(promptId);
      }
    }
  }

  private async* processCompletedResponse(
    promptId: string
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    
    if (!this.accumulatedContent) {
      return;
    }

    // 处理完整响应
    const processed = ResponseProcessor.processResponse(this.accumulatedContent);
    
    // 发送思考内容（如果有）
    const thinkingContent = ResponseProcessor.extractThinkingContent(this.accumulatedContent);
    if (thinkingContent) {
      yield {
        type: GeminiEventType.Thought,
        value: { summary: thinkingContent, isComplete: true }
      };
    }

    // 发送工具调用请求
    for (const toolCall of processed.toolCalls) {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: toolCall.callId,
          name: toolCall.name,
          args: toolCall.args,
          isClientInitiated: false,
          prompt_id: promptId
        }
      };
    }

    // 重置状态
    this.reset();
  }

  reset(): void {
    this.accumulatedContent = '';
    this.isFirstContent = true;
  }

  getAccumulatedContent(): string {
    return this.accumulatedContent;
  }
}
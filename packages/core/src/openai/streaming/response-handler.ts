/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAI } from 'openai';
import { ServerGeminiStreamEvent, GeminiEventType } from '../../core/turn.js';
import { ToolCall } from '../types/interfaces.js';
import { ToolCallParser } from '../parsers/tool-call-parser.js';
import { ContextInjector } from '../context/context-injector.js';
import { DebugLoggerAdapter } from '../debug/logger-adapter.js';
import { ToolCallTracker } from '../debug/tool-tracker.js';
import { memoryProfiler } from '../utils/memory-profiler.js';
import { memoryOptimizer, processInChunks, createStreamingJSONParser } from '../utils/memory-optimizer.js';

/**
 * 响应处理器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ResponseHandler {
  private readonly openai: OpenAI;
  private readonly config: any;
  private readonly toolCallParser: ToolCallParser;
  private readonly contextInjector: ContextInjector;
  private readonly debugLogger: DebugLoggerAdapter;
  private readonly toolTracker: ToolCallTracker;
  private readonly debugMode: boolean;

  constructor(
    openai: OpenAI,
    config: any,
    toolCallParser: ToolCallParser,
    contextInjector: ContextInjector,
    debugLogger: DebugLoggerAdapter,
    toolTracker: ToolCallTracker,
    debugMode: boolean = false
  ) {
    this.openai = openai;
    this.config = config;
    this.toolCallParser = toolCallParser;
    this.contextInjector = contextInjector;
    this.debugLogger = debugLogger;
    this.toolTracker = toolTracker;
    this.debugMode = debugMode;
  }

  /**
   * 处理模型响应
   */
  async *handleModelResponse(
    messages: any[],
    prompt_id: string,
    includeGuidance: boolean = true
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    const operationId = `response_${prompt_id}_${Date.now()}`;
    memoryProfiler.startOperation(operationId, 'handleModelResponse');
    
    try {
      // 检查是否使用流式处理（大响应优化）
      const useStreaming = this.shouldUseStreaming(messages);
      
      if (useStreaming) {
        yield* this.handleStreamingResponse(messages, prompt_id, includeGuidance);
      } else {
        yield* this.handleRegularResponse(messages, prompt_id, includeGuidance);
      }
      
    } catch (error) {
      yield* this.handleError(error);
    } finally {
      memoryProfiler.endOperation(operationId, 'handleModelResponse');
    }
  }

  /**
   * 处理常规响应
   */
  private async *handleRegularResponse(
    messages: any[],
    prompt_id: string,
    includeGuidance: boolean = true
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    let toolCalls: ToolCall[] = [];
    
    // 调用OpenAI API
    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      stream: false,
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 4096,
    });

    const fullResponse = response.choices[0]?.message?.content || '';
    
    if (this.debugMode) {
      console.log('[ResponseHandler] Received response:', fullResponse.length, 'characters');
    }

    // 记录完整请求和响应
    await this.logRequestResponse(messages, fullResponse);

    // 清理响应（移除<think>标签）
    const cleanedResponse = this.cleanResponse(fullResponse);
    
    // 解析工具调用
    toolCalls = this.parseToolCalls(cleanedResponse);
    
    // 处理工具调用
    if (toolCalls.length > 0) {
      yield* this.handleToolCalls(toolCalls, prompt_id);
    }
    
    // 处理文本响应
    yield* this.handleTextResponse(cleanedResponse, fullResponse, toolCalls);
    
    // 更新上下文
    await this.updateContext(cleanedResponse, toolCalls);
  }

  /**
   * 处理流式响应（大响应优化）
   */
  private async *handleStreamingResponse(
    messages: any[],
    prompt_id: string,
    includeGuidance: boolean = true
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    let toolCalls: ToolCall[] = [];
    let accumulatedContent = '';
    const chunkSize = 1024; // 1KB chunks for processing
    
    try {
      // 调用OpenAI API with streaming
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        stream: true,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4096,
      });

      // 创建流式JSON解析器
      const jsonParser = createStreamingJSONParser<any>(
        (obj) => {
          if (this.debugMode) {
            console.log('[ResponseHandler] Parsed streaming JSON object:', Object.keys(obj));
          }
        },
        (error) => {
          if (this.debugMode) {
            console.warn('[ResponseHandler] Streaming JSON parse error:', error.message);
          }
        }
      );

      // 处理流式响应
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        
        if (content) {
          accumulatedContent += content;
          
          // 定期检查内存使用并处理已接收的内容
          if (accumulatedContent.length > chunkSize) {
            yield* this.processContentChunk(accumulatedContent, toolCalls, prompt_id);
            
            // 保留可能的不完整工具调用
            accumulatedContent = this.preserveIncompleteToolCalls(accumulatedContent);
          }
        }
      }

      // 处理剩余内容
      if (accumulatedContent) {
        yield* this.processContentChunk(accumulatedContent, toolCalls, prompt_id);
      }

      // 记录完整请求和响应
      await this.logRequestResponse(messages, accumulatedContent);

      // 更新上下文
      await this.updateContext(accumulatedContent, toolCalls);
      
    } catch (error) {
      yield* this.handleError(error);
    }
  }

  /**
   * 处理内容块
   */
  private async *processContentChunk(
    content: string,
    toolCalls: ToolCall[],
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // 清理响应
    const cleanedContent = this.cleanResponse(content);
    
    // 解析新的工具调用
    const newToolCalls = this.parseToolCalls(cleanedContent);
    
    // 添加新的工具调用
    for (const toolCall of newToolCalls) {
      const exists = toolCalls.find(tc => tc.callId === toolCall.callId);
      if (!exists) {
        toolCalls.push(toolCall);
      }
    }
    
    // 处理工具调用
    if (newToolCalls.length > 0) {
      yield* this.handleToolCalls(newToolCalls, prompt_id);
    }
    
    // 处理文本响应
    yield* this.handleTextResponse(cleanedContent, content, newToolCalls);
  }

  /**
   * 保留不完整的工具调用
   */
  private preserveIncompleteToolCalls(content: string): string {
    // 查找可能的不完整工具调用
    const jsonPattern = /\{[^}]*$/;
    const match = content.match(jsonPattern);
    
    if (match) {
      return match[0];
    }
    
    return '';
  }

  /**
   * 判断是否应该使用流式处理
   */
  private shouldUseStreaming(messages: any[]): boolean {
    // 基于消息总长度判断
    const totalLength = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
    
    // 如果消息总长度超过10KB，使用流式处理
    return totalLength > 10 * 1024;
  }

  /**
   * 处理工具调用
   */
  private async *handleToolCalls(toolCalls: ToolCall[], prompt_id: string): AsyncGenerator<ServerGeminiStreamEvent, any> {
    for (const toolCall of toolCalls) {
      this.toolTracker.updateTracker(toolCall.name, 'attempted');
      
      if (this.debugMode) {
        console.log('[ResponseHandler] Emitting tool call:', toolCall.name);
      }

      yield {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: toolCall.callId,
          name: toolCall.name,
          args: toolCall.args,
          isClientInitiated: false,
          prompt_id,
          isDangerous: this.isDangerousTool(toolCall.name),
        },
      };

      // 记录工具调用
      await this.debugLogger.logToolCall(toolCall.name, toolCall.args);
    }
  }

  /**
   * 处理文本响应
   */
  private async *handleTextResponse(
    cleanedResponse: string,
    fullResponse: string,
    toolCalls: ToolCall[]
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // 如果有工具调用，不发送文本内容
    if (toolCalls.length > 0) {
      return;
    }

    // 检查可疑声明
    if (this.detectSuspiciousClaims(fullResponse)) {
      const correctionMessage = this.generateCorrectionMessage();
      yield {
        type: GeminiEventType.Content,
        value: correctionMessage,
      };
    }

    // 发送清理后的响应
    if (cleanedResponse.trim()) {
      let finalContent = cleanedResponse;
      
      // 添加任务变更检测
      const taskPrompt = await this.detectTaskChanges(finalContent);
      if (taskPrompt) {
        finalContent += taskPrompt;
      }
      
      yield {
        type: GeminiEventType.Content,
        value: finalContent,
      };
    }
  }

  /**
   * 处理错误
   */
  private async *handleError(error: any): AsyncGenerator<ServerGeminiStreamEvent, any> {
    console.error('[ResponseHandler] Error:', error);
    
    await this.debugLogger.logError(error instanceof Error ? error.message : String(error));
    
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

  /**
   * 解析工具调用
   */
  private parseToolCalls(content: string): ToolCall[] {
    const toolCalls = this.toolCallParser.parseToolCalls(content);
    
    // 更新统计
    for (const toolCall of toolCalls) {
      this.toolTracker.updateTracker(toolCall.name, 'discovered');
    }
    
    if (this.debugMode) {
      console.log('[ResponseHandler] Parsed tool calls:', toolCalls.length);
    }
    
    return toolCalls;
  }

  /**
   * 清理响应
   */
  private cleanResponse(response: string): string {
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  /**
   * 检测可疑声明
   */
  private detectSuspiciousClaims(content: string): boolean {
    const suspiciousPatterns = [
      /已保存到|已写入|saved to|written to/i,
      /文件创建|file created|文档生成|document generated/i,
      /代码更新|code updated|修改完成|modification completed/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 生成纠正消息
   */
  private generateCorrectionMessage(): string {
    return `
⚠️ **重要提醒**: 您刚才的响应中声称执行了文件操作，但实际上没有使用工具调用。

**实际情况**: 
- 没有创建任何文件
- 没有写入任何内容  
- 没有执行任何操作

**正确做法**: 
如需创建/写入文件，必须使用: [tool_call: write_file for {"file_path": "./path", "content": "..."}]

请使用正确的工具调用格式重新执行所需操作。`;
  }

  /**
   * 检测任务变更
   */
  private async detectTaskChanges(content: string): Promise<string> {
    try {
      const { getToolCallInterceptorIfAvailable } = await import('../../context/index.js');
      const interceptor = getToolCallInterceptorIfAvailable(this.config);
      if (interceptor) {
        return await interceptor.detectTaskChangeNeeds(content);
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ResponseHandler] Task change detection failed:', error);
      }
    }
    return '';
  }

  /**
   * 更新上下文
   */
  private async updateContext(response: string, toolCalls: ToolCall[]): Promise<void> {
    const toolCallNames = toolCalls.map(tc => tc.name);
    await this.contextInjector.injectModelResponseContext(response, toolCallNames);
  }

  /**
   * 记录请求响应
   */
  private async logRequestResponse(messages: any[], response: string): Promise<void> {
    const request = {
      model: this.config.model,
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 4096,
      messages,
    };

    await this.debugLogger.logSentToModel(request);
    await this.debugLogger.logModelResponse(response);
    await this.debugLogger.logRawModelResponse(response);
  }

  /**
   * 检查是否为危险工具
   */
  private isDangerousTool(toolName: string): boolean {
    const dangerousTools = ['run_shell_command', 'write_file', 'replace'];
    return dangerousTools.includes(toolName);
  }
}
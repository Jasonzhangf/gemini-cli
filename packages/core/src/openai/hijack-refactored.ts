/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAI } from 'openai';
import { Content } from '@google/genai';
import { ServerGeminiStreamEvent } from '../core/turn.js';
import { Config } from '../config/config.js';

// 导入模块化组件
import { OpenAIHijackConfig, ToolCall } from './types/interfaces.js';
import { ToolCallParser } from './parsers/tool-call-parser.js';
import { ConversationHistoryManager, MessageProcessor } from './conversation/index.js';
import { DebugLoggerAdapter, ToolCallTracker } from './debug/index.js';
import { ContextInjector, ToolGuidanceGenerator } from './context/index.js';
import { ResponseHandler } from './streaming/response-handler.js';

/**
 * OpenAI Hijack适配器 - 重构版
 * 实现细菌式编程：小巧、模块化、自包含
 * 
 * 职责：
 * - 作为主控制器协调各个模块
 * - 处理请求路由
 * - 管理系统状态
 */
export class OpenAIHijackAdapterRefactored {
  private readonly openai: OpenAI;
  private readonly config: OpenAIHijackConfig;
  private readonly coreConfig: Config;
  private readonly sessionId: string;
  private readonly debugMode: boolean;

  // 模块化组件
  private readonly toolCallParser: ToolCallParser;
  private readonly conversationHistory: ConversationHistoryManager;
  private readonly messageProcessor: MessageProcessor;
  private readonly debugLogger: DebugLoggerAdapter;
  private readonly toolTracker: ToolCallTracker;
  private readonly contextInjector: ContextInjector;
  private readonly toolGuidanceGenerator: ToolGuidanceGenerator;
  private readonly responseHandler: ResponseHandler;

  // 工具配置
  private readonly toolDeclarations: any[];
  private readonly dangerousTools: Set<string>;
  private readonly complexTools: Set<string>;

  constructor(config: OpenAIHijackConfig, toolDeclarations: any[], coreConfig: Config) {
    this.config = config;
    this.coreConfig = coreConfig;
    this.toolDeclarations = toolDeclarations;
    this.sessionId = coreConfig.getSessionId();
    this.debugMode = coreConfig.getDebugMode();

    // 工具分类
    this.dangerousTools = new Set(['run_shell_command', 'write_file', 'replace']);
    this.complexTools = new Set(['write_file', 'replace']);

    // 初始化OpenAI客户端
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });

    // 初始化模块化组件
    this.toolCallParser = new ToolCallParser(
      toolDeclarations,
      this.dangerousTools,
      this.complexTools,
      this.debugMode
    );

    this.conversationHistory = new ConversationHistoryManager(20);
    this.messageProcessor = new MessageProcessor(this.debugMode);
    this.toolTracker = new ToolCallTracker(this.debugMode);
    
    this.debugLogger = new DebugLoggerAdapter(
      this.sessionId,
      coreConfig.getTargetDir(),
      this.debugMode
    );

    this.contextInjector = new ContextInjector(coreConfig, this.debugMode);
    
    this.toolGuidanceGenerator = new ToolGuidanceGenerator(
      toolDeclarations,
      this.dangerousTools,
      this.complexTools,
      coreConfig.getContextManager()
    );

    this.responseHandler = new ResponseHandler(
      this.openai,
      config,
      this.toolCallParser,
      this.contextInjector,
      this.debugLogger,
      this.toolTracker,
      this.debugMode
    );

    // 初始化调试日志器
    if (this.debugMode) {
      this.debugLogger.initialize().catch(error => {
        console.warn('[OpenAIHijackAdapterRefactored] Debug logger initialization failed:', error);
      });
    }

    if (this.debugMode) {
      console.log('[OpenAIHijackAdapterRefactored] Initialized with', toolDeclarations.length, 'tools');
    }
  }

  /**
   * 主要的消息流处理方法
   */
  async *sendMessageStream(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // 重置工具调用追踪
    this.toolTracker.reset();

    // 判断请求类型
    if (this.messageProcessor.isToolResponse(request)) {
      yield* this.handleToolResponse(request, signal, prompt_id);
    } else {
      yield* this.handleUserMessage(request, signal, prompt_id);
    }

    return {
      pendingToolCalls: [],
    };
  }

  /**
   * 处理用户消息
   */
  private async *handleUserMessage(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    // 清理处理记录
    this.toolCallParser.clearProcessedCalls();

    // 开始新的调试轮次
    const turnId = this.debugLogger.generateTurnId();
    const rawUserMessage = this.messageProcessor.extractMessageFromRequest(request);
    const userMessage = await this.messageProcessor.preprocessUserMessage(
      rawUserMessage,
      this.coreConfig.getContextManager()
    );

    await this.debugLogger.startTurn(turnId, userMessage);

    // 添加到对话历史
    this.conversationHistory.addUserMessage(userMessage);

    // 注入用户输入上下文
    await this.contextInjector.injectUserInputContext(userMessage);

    // 构建消息
    const messages = await this.buildMessages(userMessage);

    // 记录上下文信息
    await this.logContextDetails();

    // 处理模型响应
    yield* this.responseHandler.handleModelResponse(messages, prompt_id, true);

    // 完成轮次
    await this.debugLogger.finalizeTurn();
  }

  /**
   * 处理工具响应
   */
  private async *handleToolResponse(
    request: any,
    signal: AbortSignal,
    prompt_id: string
  ): AsyncGenerator<ServerGeminiStreamEvent, any> {
    const turnId = this.debugLogger.generateTurnId();
    const toolResults = this.messageProcessor.extractToolResultsFromRequest(request);

    await this.debugLogger.startTurn(turnId, `Tool results: ${toolResults.map(r => r.name).join(', ')}`);

    // 记录工具结果
    for (const result of toolResults) {
      await this.debugLogger.logToolCall(result.name, {}, result.result, (result as any).error);
    }

    // 处理工具调用完成
    await this.processToolCallCompletion(toolResults, prompt_id);

    // 格式化工具结果
    const toolResultMessage = this.messageProcessor.formatToolResultsForModel(toolResults);
    this.conversationHistory.addUserMessage(toolResultMessage);

    // 构建消息
    const messages = await this.buildMessages(toolResultMessage);

    // 处理模型响应
    yield* this.responseHandler.handleModelResponse(messages, prompt_id, true);

    // 完成轮次
    await this.debugLogger.finalizeTurn();
  }

  /**
   * 构建消息
   */
  private async buildMessages(userMessage: string): Promise<any[]> {
    const conversationHistory = this.conversationHistory.getHistory();
    
    // 获取增强的系统提示
    const systemPrompt = await this.contextInjector.getEnhancedSystemPrompt(userMessage);
    
    // 添加工具指导
    const toolGuidance = this.toolGuidanceGenerator.generate();
    const fullSystemPrompt = systemPrompt + '\n\n' + '●'.repeat(120) + '\n\n' + toolGuidance;

    return [
      { role: 'system', content: fullSystemPrompt },
      ...conversationHistory
    ];
  }

  /**
   * 记录上下文详情
   */
  private async logContextDetails(): Promise<void> {
    if (!this.debugMode) return;

    try {
      const contextDetails = await this.contextInjector.collectDetailedContext();
      await this.debugLogger.logSystemContext(contextDetails.systemContext);
      await this.debugLogger.logStaticContext(contextDetails.staticContext);
      await this.debugLogger.logDynamicContext(contextDetails.dynamicContext);
      await this.debugLogger.logTaskContext(contextDetails.taskContext);
    } catch (error) {
      await this.debugLogger.logError(`Failed to log context details: ${error}`);
    }
  }

  /**
   * 处理工具调用完成
   */
  private async processToolCallCompletion(toolResults: any[], prompt_id: string): Promise<void> {
    try {
      const { getToolCallInterceptorIfAvailable } = await import('../context/index.js');
      const interceptor = getToolCallInterceptorIfAvailable(this.coreConfig);
      if (interceptor) {
        for (const toolResult of toolResults) {
          const mockRequest = {
            callId: 'mock-' + Date.now(),
            name: toolResult.name,
            args: {},
            isClientInitiated: false,
            prompt_id: prompt_id,
            isDangerous: false,
            turnId: this.debugLogger.getCurrentTurnId()
          };
          const mockResponse = {
            callId: 'mock-' + Date.now(),
            responseParts: {
              functionResponse: {
                response: toolResult.result
              }
            },
            resultDisplay: undefined,
            error: undefined
          };
          
          await interceptor.postprocessToolCall(mockRequest, mockResponse);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[OpenAIHijackAdapterRefactored] Tool interceptor processing failed:', error);
      }
    }
  }

  /**
   * 添加历史记录
   */
  addHistory(content: Content): void {
    this.conversationHistory.addHistory(content);
  }

  /**
   * 获取历史记录
   */
  getHistory(): Content[] {
    return this.conversationHistory.getGeminiHistory();
  }

  /**
   * 设置历史记录
   */
  setHistory(history: Content[]): void {
    this.conversationHistory.setHistory(history);
  }

  /**
   * 清空对话
   */
  clearConversation(): void {
    this.conversationHistory.clearHistory();
  }

  /**
   * 获取当前模型
   */
  getCurrentModel(): string {
    return this.config.model;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    conversation: any;
    tools: any;
    parser: any;
  } {
    return {
      conversation: this.conversationHistory.getStats(),
      tools: this.toolTracker.getSummaryStats(),
      parser: this.toolCallParser.getStats(),
    };
  }
}
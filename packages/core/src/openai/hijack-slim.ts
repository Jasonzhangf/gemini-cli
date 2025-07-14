/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Tool } from '@google/genai';
import { ServerGeminiStreamEvent } from '../core/turn.js';
import { Config } from '../config/config.js';
import { DebugLogger } from '../context/debugLogger.js';

// 细菌式编程：导入所有操纵子
import {
  OpenAIHijackConfig,
  OpenAIClient,
  ConversationManager,
  StreamAdapter,
  ToolFormatter,
  PathProcessor,
  ToolClassifier
} from './modules/index.js';

/**
 * 细菌式编程：精简OpenAI劫持适配器
 * 小巧：仅负责协调各个操纵子
 * 模块化：由独立的操纵子组成
 * 自包含：完整的劫持适配功能
 */
export class OpenAIHijackAdapter {
  private openaiClient: OpenAIClient;
  private conversationManager: ConversationManager;
  private streamAdapter: StreamAdapter;
  private pathProcessor: PathProcessor;
  private toolDeclarations: Tool[] = [];
  private debugLogger: DebugLogger;

  constructor(config: OpenAIHijackConfig, coreConfig: Config) {
    this.openaiClient = new OpenAIClient(config);
    this.conversationManager = new ConversationManager();
    this.streamAdapter = new StreamAdapter();
    this.pathProcessor = new PathProcessor(coreConfig.getTargetDir());
    this.debugLogger = new DebugLogger('openai-hijack', coreConfig.getDebugMode());
  }

  async *sendMessageStream(
    request: any,
    signal: AbortSignal,
    promptId: string
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    
    this.debugLogger.debug('OpenAI hijack processing request');
    
    try {
      // 1. 处理输入内容
      const userContent = this.extractUserContent(request);
      this.conversationManager.addMessage('user', userContent);
      
      // 2. 准备工具定义
      const tools = this.prepareTools();
      
      // 3. 获取对话历史
      const messages = this.conversationManager.toOpenAIFormat();
      
      // 4. 调用OpenAI API
      const stream = await this.openaiClient.createChatCompletionStream(messages, tools);
      
      // 5. 处理流响应
      yield* this.streamAdapter.processStream(stream, promptId);
      
      // 6. 保存助手响应
      const assistantResponse = this.streamAdapter.getAccumulatedContent();
      if (assistantResponse) {
        this.conversationManager.addMessage('assistant', assistantResponse);
      }
      
      this.debugLogger.debug('OpenAI hijack completed successfully');
      
    } catch (error) {
      this.debugLogger.debug('OpenAI hijack failed:', error);
      throw error;
    }
  }

  setToolDeclarations(tools: Tool[]): void {
    this.toolDeclarations = tools;
  }

  private extractUserContent(request: any): string {
    if (typeof request === 'string') {
      return request;
    }
    
    if (Array.isArray(request)) {
      return request.map(part => part.text || '').join('');
    }
    
    if (request.text) {
      return request.text;
    }
    
    return JSON.stringify(request);
  }

  private prepareTools(): any[] {
    if (this.toolDeclarations.length === 0) {
      return [];
    }
    
    const openaiTools = ToolFormatter.toOpenAIFormat(this.toolDeclarations);
    
    // 添加工具调用指南
    const toolNames = this.toolDeclarations
      .flatMap(tool => tool.functionDeclarations || [])
      .map(func => func.name)
      .filter((name): name is string => name !== undefined);
    
    const toolInstructions = ToolFormatter.formatToolInstructions(toolNames);
    
    if (toolInstructions) {
      // 将工具指南添加到系统消息
      const systemMessage = this.conversationManager.getHistory()
        .find(msg => msg.role === 'system');
      
      if (systemMessage) {
        systemMessage.content += '\n\n' + toolInstructions;
      } else {
        this.conversationManager.addMessage('system', toolInstructions);
      }
    }
    
    return openaiTools;
  }
}
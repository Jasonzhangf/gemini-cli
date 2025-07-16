/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { ConversationMessage } from '../types/interfaces.js';
import { filterThinkTags } from '../../utils/fileUtils.js';
import { 
  ContextHistorySeparator, 
  ExtendedConversationMessage, 
  ContextHistorySeparationResult,
  MessageType 
} from './context-history-separator.js';

/**
 * 对话历史管理器
 * 实现细菌式编程：小巧、模块化、自包含
 * 增强功能：集成上下文历史分离器，确保纯净的对话历史存储
 */
export class ConversationHistoryManager {
  private conversationHistory: ConversationMessage[] = [];
  private readonly maxHistoryLength: number;
  private readonly contextSeparator: ContextHistorySeparator;
  private readonly separatedData: {
    contextData: ExtendedConversationMessage[];
    toolCalls: ExtendedConversationMessage[];
    toolResults: ExtendedConversationMessage[];
    internalProcessing: ExtendedConversationMessage[];
  };

  constructor(maxHistoryLength: number = 20) {
    this.maxHistoryLength = maxHistoryLength;
    this.contextSeparator = new ContextHistorySeparator();
    this.separatedData = {
      contextData: [],
      toolCalls: [],
      toolResults: [],
      internalProcessing: []
    };
  }

  /**
   * 添加用户消息（使用上下文分离）
   */
  addUserMessage(content: string): void {
    const filteredContent = this.filterThinkingContent(content);
    this.addMessageWithSeparation({ role: 'user', content: filteredContent });
  }

  /**
   * 添加助手消息（使用上下文分离）
   */
  addAssistantMessage(content: string): void {
    const filteredContent = this.filterThinkingContent(content);
    this.addMessageWithSeparation({ role: 'assistant', content: filteredContent });
  }

  /**
   * 添加系统消息（使用上下文分离）
   */
  addSystemMessage(content: string): void {
    this.addMessageWithSeparation({ role: 'system', content });
  }

  /**
   * 使用上下文分离器添加消息
   */
  private addMessageWithSeparation(message: ConversationMessage): void {
    const result = this.contextSeparator.separateContextFromHistory([message]);
    
    // 添加纯对话内容到对话历史
    if (result.conversationHistory.length > 0) {
      this.conversationHistory.push(...result.conversationHistory);
    }
    
    // 存储分离的数据
    this.separatedData.contextData.push(...result.contextData);
    this.separatedData.toolCalls.push(...result.toolCalls);
    this.separatedData.toolResults.push(...result.toolResults);
    this.separatedData.internalProcessing.push(...result.internalProcessing);
    
    // 验证分离结果
    const validation = this.contextSeparator.validateSeparation(result);
    if (!validation.isValid) {
      console.warn('Context separation validation failed:', validation.errors);
    }
    
    this.trimHistory();
  }

  /**
   * 从Gemini Content添加历史（使用上下文分离）
   */
  addHistory(content: Content): void {
    if (content.role === 'user') {
      const text = content.parts?.map(part => part.text).join('') || '';
      this.addUserMessage(text);
    } else if (content.role === 'model') {
      const text = content.parts?.map(part => part.text).join('') || '';
      this.addAssistantMessage(text);
    }
  }

  /**
   * 获取对话历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * 获取Gemini格式的历史
   */
  getGeminiHistory(): Content[] {
    return this.conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    })) as Content[];
  }

  /**
   * 设置对话历史（使用上下文分离）
   */
  setHistory(history: Content[]): void {
    // 清空现有数据
    this.conversationHistory = [];
    this.separatedData.contextData = [];
    this.separatedData.toolCalls = [];
    this.separatedData.toolResults = [];
    this.separatedData.internalProcessing = [];

    // 转换并分离历史数据
    const messages: ConversationMessage[] = history.map(content => ({
      role: content.role === 'model' ? 'assistant' as const : content.role as 'user' | 'assistant' | 'system',
      content: content.parts?.map(part => part.text).join('') || '',
    }));

    // 使用上下文分离器处理所有消息
    const result = this.contextSeparator.separateContextFromHistory(messages);
    
    // 设置分离后的数据
    this.conversationHistory = result.conversationHistory;
    this.separatedData.contextData = result.contextData;
    this.separatedData.toolCalls = result.toolCalls;
    this.separatedData.toolResults = result.toolResults;
    this.separatedData.internalProcessing = result.internalProcessing;

    // 验证分离结果
    const validation = this.contextSeparator.validateSeparation(result);
    if (!validation.isValid) {
      console.warn('Bulk history separation validation failed:', validation.errors);
    }
  }

  /**
   * 清空对话历史和分离数据
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.separatedData.contextData = [];
    this.separatedData.toolCalls = [];
    this.separatedData.toolResults = [];
    this.separatedData.internalProcessing = [];
  }

  /**
   * 获取最近的消息
   */
  getRecentMessages(count: number): ConversationMessage[] {
    return this.conversationHistory.slice(-count);
  }

  /**
   * 获取特定角色的消息
   */
  getMessagesByRole(role: 'user' | 'assistant' | 'system'): ConversationMessage[] {
    return this.conversationHistory.filter(msg => msg.role === role);
  }

  /**
   * 获取对话统计
   */
  getStats(): {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    totalCharacters: number;
  } {
    const stats = {
      totalMessages: this.conversationHistory.length,
      userMessages: 0,
      assistantMessages: 0,
      systemMessages: 0,
      totalCharacters: 0,
    };

    for (const msg of this.conversationHistory) {
      stats.totalCharacters += msg.content.length;
      switch (msg.role) {
        case 'user':
          stats.userMessages++;
          break;
        case 'assistant':
          stats.assistantMessages++;
          break;
        case 'system':
          stats.systemMessages++;
          break;
      }
    }

    return stats;
  }

  /**
   * 检查是否有对话历史
   */
  hasHistory(): boolean {
    return this.conversationHistory.length > 0;
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): ConversationMessage | null {
    return this.conversationHistory.length > 0 
      ? this.conversationHistory[this.conversationHistory.length - 1] 
      : null;
  }

  /**
   * 过滤思考内容
   */
  private filterThinkingContent(content: string): string {
    return filterThinkTags(content);
  }

  /**
   * 获取分离的上下文数据
   */
  getContextData(): ExtendedConversationMessage[] {
    return [...this.separatedData.contextData];
  }

  /**
   * 获取工具调用记录
   */
  getToolCalls(): ExtendedConversationMessage[] {
    return [...this.separatedData.toolCalls];
  }

  /**
   * 获取工具结果记录
   */
  getToolResults(): ExtendedConversationMessage[] {
    return [...this.separatedData.toolResults];
  }

  /**
   * 获取内部处理记录
   */
  getInternalProcessing(): ExtendedConversationMessage[] {
    return [...this.separatedData.internalProcessing];
  }

  /**
   * 获取完整的分离结果
   */
  getSeparationResult(): ContextHistorySeparationResult {
    return {
      conversationHistory: this.getHistory(),
      contextData: this.getContextData(),
      toolCalls: this.getToolCalls(),
      toolResults: this.getToolResults(),
      internalProcessing: this.getInternalProcessing()
    };
  }

  /**
   * 获取分离统计信息
   */
  getSeparationStats(): {
    conversationMessages: number;
    contextMessages: number;
    toolCalls: number;
    toolResults: number;
    internalProcessing: number;
    totalMessages: number;
  } {
    const result = this.getSeparationResult();
    return this.contextSeparator.getStatistics(result);
  }

  /**
   * 验证当前分离状态
   */
  validateSeparation(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = this.getSeparationResult();
    return this.contextSeparator.validateSeparation(result);
  }

  /**
   * 获取详细操作日志（用于调试和审计）
   */
  getOperationLog(): {
    timestamp: Date;
    operation: string;
    messageType: MessageType;
    content: string;
    metadata?: any;
  }[] {
    const log: any[] = [];
    
    // 添加工具调用日志
    for (const toolCall of this.separatedData.toolCalls) {
      log.push({
        timestamp: toolCall.timestamp,
        operation: 'tool_call',
        messageType: toolCall.messageType,
        content: toolCall.content,
        metadata: toolCall.metadata
      });
    }
    
    // 添加工具结果日志
    for (const toolResult of this.separatedData.toolResults) {
      log.push({
        timestamp: toolResult.timestamp,
        operation: 'tool_result',
        messageType: toolResult.messageType,
        content: toolResult.content,
        metadata: toolResult.metadata
      });
    }
    
    // 添加内部处理日志
    for (const processing of this.separatedData.internalProcessing) {
      log.push({
        timestamp: processing.timestamp,
        operation: 'internal_processing',
        messageType: processing.messageType,
        content: processing.content,
        metadata: processing.metadata
      });
    }
    
    // 按时间戳排序
    return log.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * 修剪历史记录
   */
  private trimHistory(): void {
    if (this.conversationHistory.length > this.maxHistoryLength) {
      // 保留系统消息，修剪用户和助手消息
      const systemMessages = this.conversationHistory.filter(msg => msg.role === 'system');
      const otherMessages = this.conversationHistory.filter(msg => msg.role !== 'system');
      
      const trimmedOtherMessages = otherMessages.slice(-(this.maxHistoryLength - systemMessages.length));
      this.conversationHistory = [...systemMessages, ...trimmedOtherMessages];
    }
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { ConversationMessage } from '../types/interfaces.js';
import { filterThinkTags } from '../../utils/fileUtils.js';

/**
 * 对话历史管理器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ConversationHistoryManager {
  private conversationHistory: ConversationMessage[] = [];
  private readonly maxHistoryLength: number;

  constructor(maxHistoryLength: number = 20) {
    this.maxHistoryLength = maxHistoryLength;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string): void {
    const filteredContent = this.filterThinkingContent(content);
    this.conversationHistory.push({
      role: 'user',
      content: filteredContent,
    });
    this.trimHistory();
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content: string): void {
    const filteredContent = this.filterThinkingContent(content);
    this.conversationHistory.push({
      role: 'assistant',
      content: filteredContent,
    });
    this.trimHistory();
  }

  /**
   * 添加系统消息
   */
  addSystemMessage(content: string): void {
    this.conversationHistory.push({
      role: 'system',
      content,
    });
    this.trimHistory();
  }

  /**
   * 从Gemini Content添加历史
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
   * 设置对话历史
   */
  setHistory(history: Content[]): void {
    this.conversationHistory = history.map(content => ({
      role: content.role === 'model' ? 'assistant' as const : content.role as 'user' | 'assistant' | 'system',
      content: content.parts?.map(part => part.text).join('') || '',
    }));
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.conversationHistory = [];
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
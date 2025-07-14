/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationMessage } from './types.js';

/**
 * 细菌式编程：对话管理操纵子
 * 小巧：仅管理对话历史
 * 模块化：独立的对话存储单元
 * 自包含：完整的对话管理功能
 */
export class ConversationManager {
  private history: ConversationMessage[] = [];
  private maxHistoryLength: number = 50;

  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.history.push({ role, content });
    this.trimHistory();
  }

  getHistory(): ConversationMessage[] {
    return [...this.history];
  }

  getLastMessage(): ConversationMessage | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getLastUserMessage(): ConversationMessage | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === 'user') {
        return this.history[i];
      }
    }
    return null;
  }

  clearHistory(): void {
    this.history = [];
  }

  setMaxHistoryLength(length: number): void {
    this.maxHistoryLength = length;
    this.trimHistory();
  }

  private trimHistory(): void {
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  toOpenAIFormat(): Array<{ role: string; content: string }> {
    return this.history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { Content } from '@google/genai';

export interface ConversationRecord {
  timestamp: number;
  date: string;
  turnId: string;
  userInput: string;
  modelResponse: string;
  toolCalls?: ToolCallRecord[];
  context?: string;
  sessionId: string;
}

export interface ToolCallRecord {
  name: string;
  args: any;
  result?: string;
  status: 'success' | 'error' | 'cancelled';
}

/**
 * 会话历史RAG系统
 * 单独保存会话历史，使用文本RAG进行关键字检索
 */
export class ConversationRAGSystem {
  private projectRoot: string;
  private debugMode: boolean;
  private vectorProvider: any = null; // 可选的向量搜索支持
  private conversationCache: Map<string, ConversationRecord[]> = new Map();

  constructor(projectRoot: string, debugMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.debugMode = debugMode;
  }

  /**
   * 设置向量搜索提供者（可选）
   */
  setVectorProvider(provider: any): void {
    this.vectorProvider = provider;
  }

  /**
   * 记录会话内容
   */
  async recordConversation(record: ConversationRecord): Promise<void> {
    try {
      const conversationDir = this.getConversationDirectory();
      await this.ensureDirectoryExists(conversationDir);

      const dateStr = record.date;
      const filePath = path.join(conversationDir, `conversations_${dateStr}.jsonl`);

      // 转换为JSONL格式
      const jsonlLine = JSON.stringify(record) + '\n';
      
      // 追加到文件
      await fs.appendFile(filePath, jsonlLine, 'utf-8');

      // 更新缓存
      if (!this.conversationCache.has(dateStr)) {
        this.conversationCache.set(dateStr, []);
      }
      this.conversationCache.get(dateStr)!.push(record);

      if (this.debugMode) {
        console.log(`[ConversationRAG] Recorded conversation: ${record.turnId}`);
      }
    } catch (error) {
      console.error('[ConversationRAG] Failed to record conversation:', error);
    }
  }

  /**
   * 搜索相关会话
   * 1. 向量搜索（如果可用）
   * 2. 关键字回退搜索
   */
  async searchRelevantConversations(query: string, limit: number = 5): Promise<ConversationRecord[]> {
    const results: ConversationRecord[] = [];

    try {
      // 1. 向量搜索 (如果可用)
      if (this.vectorProvider) {
        const vectorResults = await this.vectorSearchConversations(query, limit);
        results.push(...vectorResults);
      }

      // 2. 关键字回退搜索
      if (results.length === 0) {
        const keywordResults = await this.keywordSearchConversations(query, limit);
        results.push(...keywordResults);
      }

      // 去重并按时间排序
      const uniqueResults = this.deduplicateResults(results);
      return uniqueResults.slice(0, limit);

    } catch (error) {
      console.error('[ConversationRAG] Search failed:', error);
      return [];
    }
  }

  /**
   * 向量搜索会话（如果向量提供者可用）
   */
  private async vectorSearchConversations(query: string, limit: number): Promise<ConversationRecord[]> {
    if (!this.vectorProvider) {
      return [];
    }

    try {
      // 加载最近的会话记录
      const recentConversations = await this.loadRecentConversations(30); // 最近30天
      
      // 使用向量搜索查找相似内容
      const searchTexts = recentConversations.map(conv => 
        `${conv.userInput} ${conv.modelResponse}`.substring(0, 500)
      );

      const vectorResults = await this.vectorProvider.search(query, searchTexts, limit);
      
      return vectorResults.map((result: any) => recentConversations[result.index]);
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ConversationRAG] Vector search failed:', error);
      }
      return [];
    }
  }

  /**
   * 关键字搜索会话
   */
  private async keywordSearchConversations(query: string, limit: number): Promise<ConversationRecord[]> {
    try {
      // 提取搜索关键字
      const keywords = this.extractSearchKeywords(query);
      if (keywords.length === 0) {
        return [];
      }

      // 加载最近的会话记录
      const recentConversations = await this.loadRecentConversations(7); // 最近7天
      
      // 关键字匹配评分
      const scoredResults: { record: ConversationRecord; score: number }[] = [];

      for (const conversation of recentConversations) {
        const score = this.calculateKeywordScore(conversation, keywords);
        if (score > 0) {
          scoredResults.push({ record: conversation, score });
        }
      }

      // 按评分排序
      scoredResults.sort((a, b) => b.score - a.score);
      
      return scoredResults.slice(0, limit).map(result => result.record);
    } catch (error) {
      console.error('[ConversationRAG] Keyword search failed:', error);
      return [];
    }
  }

  /**
   * 提取搜索关键字
   */
  private extractSearchKeywords(query: string): string[] {
    // 简单的关键字提取
    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'but', 'for', 'are', 'how', 'what', 'where', 'when', 'why'].includes(word));

    return [...new Set(words)].slice(0, 10); // 去重，最多10个关键字
  }

  /**
   * 计算关键字匹配评分
   */
  private calculateKeywordScore(conversation: ConversationRecord, keywords: string[]): number {
    const text = `${conversation.userInput} ${conversation.modelResponse}`.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = text.match(regex) || [];
      score += matches.length;
    }

    return score;
  }

  /**
   * 加载最近的会话记录
   */
  private async loadRecentConversations(days: number): Promise<ConversationRecord[]> {
    const conversations: ConversationRecord[] = [];
    const conversationDir = this.getConversationDirectory();

    try {
      // 生成最近几天的日期
      const dates: string[] = [];
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }

      // 加载每天的会话记录
      for (const dateStr of dates) {
        // 先检查缓存
        if (this.conversationCache.has(dateStr)) {
          conversations.push(...this.conversationCache.get(dateStr)!);
          continue;
        }

        // 从文件加载
        const filePath = path.join(conversationDir, `conversations_${dateStr}.jsonl`);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n');
          const dayConversations: ConversationRecord[] = [];

          for (const line of lines) {
            if (line.trim()) {
              try {
                const record = JSON.parse(line) as ConversationRecord;
                dayConversations.push(record);
              } catch (parseError) {
                if (this.debugMode) {
                  console.warn(`[ConversationRAG] Failed to parse line: ${line}`);
                }
              }
            }
          }

          // 缓存结果
          this.conversationCache.set(dateStr, dayConversations);
          conversations.push(...dayConversations);
        } catch (fileError) {
          // 文件不存在，跳过
        }
      }

      // 按时间排序（最新的在前）
      conversations.sort((a, b) => b.timestamp - a.timestamp);
      
      if (this.debugMode) {
        console.log(`[ConversationRAG] Loaded ${conversations.length} conversations from last ${days} days`);
      }

      return conversations;
    } catch (error) {
      console.error('[ConversationRAG] Failed to load recent conversations:', error);
      return [];
    }
  }

  /**
   * 去重结果
   */
  private deduplicateResults(results: ConversationRecord[]): ConversationRecord[] {
    const seen = new Set<string>();
    return results.filter(record => {
      const key = `${record.turnId}-${record.timestamp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 格式化会话历史用于模型消费
   */
  formatConversationHistory(conversations: ConversationRecord[]): string {
    if (conversations.length === 0) {
      return '';
    }

    let formatted = '# 📚 相关会话历史 (Relevant Conversation History)\n';
    formatted += '*来源: 会话历史RAG系统检索的相关对话*\n\n';

    conversations.forEach((conversation, index) => {
      const date = new Date(conversation.timestamp).toLocaleString();
      formatted += `## 对话 ${index + 1} (${date})\n\n`;
      formatted += `**用户**: ${conversation.userInput}\n\n`;
      formatted += `**助手**: ${conversation.modelResponse.substring(0, 300)}${conversation.modelResponse.length > 300 ? '...' : ''}\n\n`;
      
      if (conversation.toolCalls && conversation.toolCalls.length > 0) {
        formatted += `**工具调用**: ${conversation.toolCalls.map(tc => tc.name).join(', ')}\n\n`;
      }
      
      formatted += '---\n\n';
    });

    return formatted;
  }

  /**
   * 获取会话目录
   */
  private getConversationDirectory(): string {
    return path.join(this.projectRoot, '.gemini', 'conversations');
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // 目录已存在，忽略错误
    }
  }

  /**
   * 清理旧的会话记录（保留指定天数）
   */
  async cleanupOldConversations(retentionDays: number = 30): Promise<void> {
    try {
      const conversationDir = this.getConversationDirectory();
      const files = await fs.readdir(conversationDir);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      for (const file of files) {
        if (file.startsWith('conversations_') && file.endsWith('.jsonl')) {
          const dateStr = file.replace('conversations_', '').replace('.jsonl', '');
          const fileDate = new Date(dateStr);
          
          if (fileDate < cutoffDate) {
            const filePath = path.join(conversationDir, file);
            await fs.unlink(filePath);
            
            // 从缓存中移除
            this.conversationCache.delete(dateStr);
            
            if (this.debugMode) {
              console.log(`[ConversationRAG] Cleaned up old conversation file: ${file}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('[ConversationRAG] Failed to cleanup old conversations:', error);
    }
  }

  /**
   * 获取系统统计信息
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    totalDays: number;
    oldestDate: string | null;
    newestDate: string | null;
    averageConversationsPerDay: number;
  }> {
    try {
      const recentConversations = await this.loadRecentConversations(365); // 最近一年
      
      const dates = [...new Set(recentConversations.map(conv => conv.date))];
      dates.sort();
      
      return {
        totalConversations: recentConversations.length,
        totalDays: dates.length,
        oldestDate: dates[0] || null,
        newestDate: dates[dates.length - 1] || null,
        averageConversationsPerDay: dates.length > 0 ? recentConversations.length / dates.length : 0
      };
    } catch (error) {
      console.error('[ConversationRAG] Failed to get statistics:', error);
      return {
        totalConversations: 0,
        totalDays: 0,
        oldestDate: null,
        newestDate: null,
        averageConversationsPerDay: 0
      };
    }
  }
}
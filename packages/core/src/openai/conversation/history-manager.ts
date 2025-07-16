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
import { memoryProfiler } from '../utils/memory-profiler.js';
import { memoryOptimizer, processInChunks, withStringPool } from '../utils/memory-optimizer.js';

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
  
  // Memory optimization properties
  private readonly memoryThreshold: number; // bytes
  private readonly chunkSize: number; // messages per chunk
  private isMemoryOptimized: boolean = false;

  constructor(maxHistoryLength: number = 20, memoryThreshold: number = 10 * 1024 * 1024) {
    this.maxHistoryLength = maxHistoryLength;
    this.memoryThreshold = memoryThreshold; // 10MB default
    this.chunkSize = Math.max(5, Math.floor(maxHistoryLength / 4)); // 1/4 of max history
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
    const operationId = `add_message_${Date.now()}`;
    
    memoryProfiler.profileFunction(
      'addMessageWithSeparation',
      () => {
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
        
        // 检查内存使用并优化
        this.checkMemoryUsageAndOptimize();
        
        this.trimHistory();
      },
      { operationId }
    );
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
   * 检查内存使用并优化
   */
  private checkMemoryUsageAndOptimize(): void {
    const memoryUsage = process.memoryUsage();
    
    if (memoryUsage.heapUsed > this.memoryThreshold) {
      this.optimizeMemoryUsage();
    }
    
    // 检查是否需要启用内存优化模式
    if (!this.isMemoryOptimized && memoryUsage.heapUsed > this.memoryThreshold * 0.7) {
      this.enableMemoryOptimization();
    }
  }

  /**
   * 启用内存优化模式
   */
  private enableMemoryOptimization(): void {
    if (this.isMemoryOptimized) return;
    
    this.isMemoryOptimized = true;
    
    // 压缩存储的分离数据
    this.compressSeparatedData();
    
    // 更积极的历史修剪
    this.trimHistoryAggressive();
    
    console.log('[ConversationHistoryManager] Memory optimization enabled');
  }

  /**
   * 优化内存使用
   */
  private optimizeMemoryUsage(): void {
    // 1. 清理过期的分离数据
    this.cleanupSeparatedData();
    
    // 2. 压缩对话历史
    this.compressConversationHistory();
    
    // 3. 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }
    
    console.log('[ConversationHistoryManager] Memory usage optimized');
  }

  /**
   * 清理分离数据
   */
  private cleanupSeparatedData(): void {
    const maxSeparatedDataSize = 1000; // 最大分离数据条目数
    
    // 清理过期的上下文数据
    if (this.separatedData.contextData.length > maxSeparatedDataSize) {
      this.separatedData.contextData = this.separatedData.contextData.slice(-maxSeparatedDataSize);
    }
    
    // 清理过期的工具调用数据
    if (this.separatedData.toolCalls.length > maxSeparatedDataSize) {
      this.separatedData.toolCalls = this.separatedData.toolCalls.slice(-maxSeparatedDataSize);
    }
    
    // 清理过期的工具结果数据
    if (this.separatedData.toolResults.length > maxSeparatedDataSize) {
      this.separatedData.toolResults = this.separatedData.toolResults.slice(-maxSeparatedDataSize);
    }
    
    // 清理过期的内部处理数据
    if (this.separatedData.internalProcessing.length > maxSeparatedDataSize) {
      this.separatedData.internalProcessing = this.separatedData.internalProcessing.slice(-maxSeparatedDataSize);
    }
  }

  /**
   * 压缩分离数据
   */
  private compressSeparatedData(): void {
    // 使用字符串池优化内存
    withStringPool((pool) => {
      // 压缩重复的消息内容
      const compressedContextData = this.compressMessages(this.separatedData.contextData);
      const compressedToolCalls = this.compressMessages(this.separatedData.toolCalls);
      const compressedToolResults = this.compressMessages(this.separatedData.toolResults);
      const compressedInternalProcessing = this.compressMessages(this.separatedData.internalProcessing);
      
      this.separatedData.contextData = compressedContextData;
      this.separatedData.toolCalls = compressedToolCalls;
      this.separatedData.toolResults = compressedToolResults;
      this.separatedData.internalProcessing = compressedInternalProcessing;
    });
  }

  /**
   * 压缩消息数组
   */
  private compressMessages(messages: ExtendedConversationMessage[]): ExtendedConversationMessage[] {
    const compressed: ExtendedConversationMessage[] = [];
    const seenContents = new Map<string, number>();
    
    for (const message of messages) {
      const contentHash = this.hashContent(message.content);
      
      if (seenContents.has(contentHash)) {
        // 引用已存在的内容
        const existingIndex = seenContents.get(contentHash)!;
        compressed.push({
          ...message,
          content: `[REF:${existingIndex}]`
        });
      } else {
        seenContents.set(contentHash, compressed.length);
        compressed.push(message);
      }
    }
    
    return compressed;
  }

  /**
   * 压缩对话历史
   */
  private compressConversationHistory(): void {
    if (this.conversationHistory.length <= this.chunkSize) return;
    
    // 分块处理对话历史
    const chunks = this.createHistoryChunks();
    
    // 保留最近的块，压缩旧的块
    if (chunks.length > 2) {
      const recentChunks = chunks.slice(-2);
      const oldChunks = chunks.slice(0, -2);
      
      // 压缩旧块
      const compressedOldChunks = oldChunks.map(chunk => this.compressHistoryChunk(chunk));
      
      // 重新组装历史
      this.conversationHistory = [...compressedOldChunks.flat(), ...recentChunks.flat()];
    }
  }

  /**
   * 创建历史块
   */
  private createHistoryChunks(): ConversationMessage[][] {
    const chunks: ConversationMessage[][] = [];
    
    for (let i = 0; i < this.conversationHistory.length; i += this.chunkSize) {
      chunks.push(this.conversationHistory.slice(i, i + this.chunkSize));
    }
    
    return chunks;
  }

  /**
   * 压缩历史块
   */
  private compressHistoryChunk(chunk: ConversationMessage[]): ConversationMessage[] {
    // 简单压缩：只保留摘要
    const summary = this.createChunkSummary(chunk);
    return [{ role: 'system', content: `[COMPRESSED: ${summary}]` }];
  }

  /**
   * 创建块摘要
   */
  private createChunkSummary(chunk: ConversationMessage[]): string {
    const userMessages = chunk.filter(m => m.role === 'user').length;
    const assistantMessages = chunk.filter(m => m.role === 'assistant').length;
    const totalChars = chunk.reduce((sum, m) => sum + m.content.length, 0);
    
    return `${userMessages}U/${assistantMessages}A/${totalChars}chars`;
  }

  /**
   * 更积极的历史修剪
   */
  private trimHistoryAggressive(): void {
    const targetSize = Math.floor(this.maxHistoryLength * 0.7); // 70% of max
    
    if (this.conversationHistory.length > targetSize) {
      const systemMessages = this.conversationHistory.filter(msg => msg.role === 'system');
      const otherMessages = this.conversationHistory.filter(msg => msg.role !== 'system');
      
      const trimmedOtherMessages = otherMessages.slice(-(targetSize - systemMessages.length));
      this.conversationHistory = [...systemMessages, ...trimmedOtherMessages];
    }
  }

  /**
   * 创建内容哈希
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * 获取内存使用统计
   */
  getMemoryStats(): {
    isOptimized: boolean;
    conversationHistorySize: number;
    separatedDataSize: number;
    totalMessages: number;
    estimatedMemoryUsage: number;
  } {
    const conversationHistorySize = this.conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
    const separatedDataSize = 
      this.separatedData.contextData.reduce((sum, msg) => sum + msg.content.length, 0) +
      this.separatedData.toolCalls.reduce((sum, msg) => sum + msg.content.length, 0) +
      this.separatedData.toolResults.reduce((sum, msg) => sum + msg.content.length, 0) +
      this.separatedData.internalProcessing.reduce((sum, msg) => sum + msg.content.length, 0);
    
    return {
      isOptimized: this.isMemoryOptimized,
      conversationHistorySize,
      separatedDataSize,
      totalMessages: this.conversationHistory.length + 
                    this.separatedData.contextData.length +
                    this.separatedData.toolCalls.length +
                    this.separatedData.toolResults.length +
                    this.separatedData.internalProcessing.length,
      estimatedMemoryUsage: (conversationHistorySize + separatedDataSize) * 2 // Rough estimate
    };
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
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationMessage } from '../types/interfaces.js';

/**
 * 消息类型定义
 */
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant', 
  SYSTEM = 'system',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  CONTEXT_INJECTION = 'context_injection',
  INTERNAL_PROCESSING = 'internal_processing'
}

/**
 * 扩展的对话消息接口，包含消息分类
 */
export interface ExtendedConversationMessage extends ConversationMessage {
  messageType: MessageType;
  timestamp: Date;
  metadata?: {
    toolName?: string;
    toolCallId?: string;
    taskId?: string;
    contextType?: string;
    internalProcessing?: boolean;
  };
}

/**
 * 上下文历史分离结果
 */
export interface ContextHistorySeparationResult {
  conversationHistory: ConversationMessage[];
  contextData: ExtendedConversationMessage[];
  internalProcessing: ExtendedConversationMessage[];
  toolCalls: ExtendedConversationMessage[];
  toolResults: ExtendedConversationMessage[];
}

/**
 * 上下文历史分离器
 * 实现细菌式编程：小巧、模块化、自包含
 * 
 * 核心功能：
 * 1. 分离对话历史与上下文数据
 * 2. 分类不同类型的消息
 * 3. 确保上下文数据不被持久化在对话历史中
 * 4. 提供消息验证和过滤功能
 */
export class ContextHistorySeparator {
  private readonly contextPatterns: RegExp[];
  private readonly toolCallPatterns: RegExp[];
  private readonly internalProcessingPatterns: RegExp[];

  constructor() {
    // 上下文标识符模式
    this.contextPatterns = [
      /\[Context\]/i,
      /\[RAG\]/i,
      /\[Knowledge Graph\]/i,
      /\[Project Structure\]/i,
      /\[Dynamic Context\]/i,
      /\[Static Context\]/i,
      /\[System Context\]/i,
      /<system-reminder>/i,
      /<context-injection>/i,
      /Context injected:/i,
      /RAG results:/i,
      /Knowledge graph analysis:/i
    ];

    // 工具调用模式
    this.toolCallPatterns = [
      /\[Tool Call\]/i,
      /\[Tool Result\]/i,
      /Tool:\s*\w+/i,
      /Calling tool:/i,
      /Tool execution:/i,
      /✦\s*\w+/i,
      /<\*#\*#CONTENT#\*#\*>/i,
      /<\/\*#\*#CONTENT#\*#\*>/i,
      /\[TOOL_CALL\]/i,
      /\[TOOL_RESULT\]/i
    ];

    // 内部处理模式
    this.internalProcessingPatterns = [
      /\[Internal Processing\]/i,
      /\[Task Management\]/i,
      /\[Maintenance Mode\]/i,
      /\[Debug\]/i,
      /\[Thinking\]/i,
      /<thinking>/i,
      /<\/thinking>/i,
      /Internal note:/i,
      /Debug info:/i,
      /Task status:/i,
      /Maintenance mode:/i
    ];
  }

  /**
   * 主要分离方法：将消息分类为对话历史和上下文数据
   */
  separateContextFromHistory(messages: ConversationMessage[]): ContextHistorySeparationResult {
    const conversationHistory: ConversationMessage[] = [];
    const contextData: ExtendedConversationMessage[] = [];
    const internalProcessing: ExtendedConversationMessage[] = [];
    const toolCalls: ExtendedConversationMessage[] = [];
    const toolResults: ExtendedConversationMessage[] = [];

    for (const message of messages) {
      const classifiedMessage = this.classifyMessage(message);
      
      switch (classifiedMessage.messageType) {
        case MessageType.USER:
        case MessageType.ASSISTANT:
        case MessageType.SYSTEM:
          // 只有纯对话内容才进入对话历史
          if (this.isPureConversationalContent(classifiedMessage)) {
            conversationHistory.push({
              role: classifiedMessage.role,
              content: classifiedMessage.content
            });
          } else {
            // 包含上下文或内部处理信息的消息单独处理
            const separatedContent = this.separateContentFromContext(classifiedMessage);
            if (separatedContent.conversational && separatedContent.conversational.trim() !== '') {
              conversationHistory.push({
                role: classifiedMessage.role,
                content: separatedContent.conversational
              });
            }
            if (separatedContent.contextual) {
              contextData.push({
                ...classifiedMessage,
                content: separatedContent.contextual,
                messageType: MessageType.CONTEXT_INJECTION
              });
            }
          }
          break;

        case MessageType.TOOL_CALL:
          toolCalls.push(classifiedMessage);
          break;

        case MessageType.TOOL_RESULT:
          toolResults.push(classifiedMessage);
          break;

        case MessageType.CONTEXT_INJECTION:
          contextData.push(classifiedMessage);
          break;

        case MessageType.INTERNAL_PROCESSING:
          internalProcessing.push(classifiedMessage);
          break;
      }
    }

    return {
      conversationHistory,
      contextData,
      internalProcessing,
      toolCalls,
      toolResults
    };
  }

  /**
   * 分类单个消息
   */
  private classifyMessage(message: ConversationMessage): ExtendedConversationMessage {
    const content = message.content;
    const timestamp = new Date();
    
    // 检查是否为工具调用
    if (this.isToolCall(content)) {
      return {
        ...message,
        messageType: MessageType.TOOL_CALL,
        timestamp,
        metadata: {
          toolName: this.extractToolName(content),
          toolCallId: this.extractToolCallId(content)
        }
      };
    }

    // 检查是否为工具结果
    if (this.isToolResult(content)) {
      return {
        ...message,
        messageType: MessageType.TOOL_RESULT,
        timestamp,
        metadata: {
          toolName: this.extractToolName(content),
          toolCallId: this.extractToolCallId(content)
        }
      };
    }

    // 检查是否为上下文注入
    if (this.isContextInjection(content)) {
      return {
        ...message,
        messageType: MessageType.CONTEXT_INJECTION,
        timestamp,
        metadata: {
          contextType: this.extractContextType(content)
        }
      };
    }

    // 检查是否为内部处理
    if (this.isInternalProcessing(content)) {
      return {
        ...message,
        messageType: MessageType.INTERNAL_PROCESSING,
        timestamp,
        metadata: {
          internalProcessing: true
        }
      };
    }

    // 默认为对话消息
    return {
      ...message,
      messageType: message.role === 'user' ? MessageType.USER : 
                   message.role === 'assistant' ? MessageType.ASSISTANT : 
                   MessageType.SYSTEM,
      timestamp
    };
  }

  /**
   * 检查是否为纯对话内容
   */
  private isPureConversationalContent(message: ExtendedConversationMessage): boolean {
    const content = message.content;
    
    // 检查是否为空内容
    if (content.trim() === '') {
      return false;
    }
    
    // 检查是否包含上下文标识符
    if (this.containsContextPatterns(content)) {
      return false;
    }

    // 检查是否包含工具调用
    if (this.containsToolCallPatterns(content)) {
      return false;
    }

    // 检查是否包含内部处理标识符
    if (this.containsInternalProcessingPatterns(content)) {
      return false;
    }

    return true;
  }

  /**
   * 从混合内容中分离对话内容和上下文内容
   */
  private separateContentFromContext(message: ExtendedConversationMessage): {
    conversational: string | null;
    contextual: string | null;
  } {
    const content = message.content;
    let conversational: string | null = null;
    let contextual: string | null = null;

    // 使用正则表达式分离上下文标记
    const contextMarkers = [
      /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
      /<context-injection>[\s\S]*?<\/context-injection>/gi,
      /\[Context\][^[\]]*?(?=\[|$)/gi,
      /\[RAG\][^[\]]*?(?=\[|$)/gi,
      /\[Knowledge Graph\][^[\]]*?(?=\[|$)/gi,
      /\[Internal Processing\][^[\]]*?(?=\[|$)/gi,
      /\[Task Management\][^[\]]*?(?=\[|$)/gi,
      /\[Debug\][^[\]]*?(?=\[|$)/gi
    ];

    let processedContent = content;
    const extractedContexts: string[] = [];

    // 使用全局匹配逐个处理每个标记
    for (const marker of contextMarkers) {
      let match;
      while ((match = marker.exec(processedContent)) !== null) {
        extractedContexts.push(match[0]);
        processedContent = processedContent.replace(match[0], ' ');
        marker.lastIndex = 0; // 重置正则表达式状态
      }
    }

    // 清理剩余的对话内容
    conversational = processedContent.replace(/\s+/g, ' ').trim();
    if (conversational === '') {
      conversational = null;
    }

    // 组合上下文内容
    if (extractedContexts.length > 0) {
      contextual = extractedContexts.join('\n\n');
    }

    return { conversational, contextual };
  }

  /**
   * 模式匹配辅助方法
   */
  private isToolCall(content: string): boolean {
    return this.containsToolCallPatterns(content);
  }

  private isToolResult(content: string): boolean {
    return this.containsToolCallPatterns(content) && 
           (content.includes('result') || content.includes('Result') || content.includes('RESULT') ||
            content.includes('Tool result') || content.includes('tool result') || 
            content.includes('successfully') || content.includes('failed') || 
            content.includes('error') || content.includes('Error'));
  }

  private isContextInjection(content: string): boolean {
    return this.containsContextPatterns(content);
  }

  private isInternalProcessing(content: string): boolean {
    return this.containsInternalProcessingPatterns(content);
  }

  private containsContextPatterns(content: string): boolean {
    return this.contextPatterns.some(pattern => pattern.test(content));
  }

  private containsToolCallPatterns(content: string): boolean {
    return this.toolCallPatterns.some(pattern => pattern.test(content));
  }

  private containsInternalProcessingPatterns(content: string): boolean {
    return this.internalProcessingPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 提取元数据辅助方法
   */
  private extractToolName(content: string): string | undefined {
    const toolNameMatch = content.match(/Tool:\s*(\w+)/i) || 
                         content.match(/Calling tool:\s*(\w+)/i) ||
                         content.match(/✦\s*(\w+)/i);
    return toolNameMatch ? toolNameMatch[1] : undefined;
  }

  private extractToolCallId(content: string): string | undefined {
    const callIdMatch = content.match(/call_id:\s*([a-zA-Z0-9_-]+)/i) ||
                       content.match(/id:\s*([a-zA-Z0-9_-]+)/i);
    return callIdMatch ? callIdMatch[1] : undefined;
  }

  private extractContextType(content: string): string | undefined {
    for (const pattern of this.contextPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0].replace(/[\[\]]/g, '');
      }
    }
    return undefined;
  }

  /**
   * 验证分离结果
   */
  validateSeparation(result: ContextHistorySeparationResult): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证对话历史中不包含上下文数据
    for (const message of result.conversationHistory) {
      if (this.containsContextPatterns(message.content)) {
        errors.push(`Conversation history contains context data: ${message.content.substring(0, 100)}...`);
      }
      
      if (this.containsToolCallPatterns(message.content)) {
        errors.push(`Conversation history contains tool call data: ${message.content.substring(0, 100)}...`);
      }
    }

    // 验证上下文数据的完整性
    if (result.contextData.length === 0 && result.toolCalls.length === 0) {
      warnings.push('No context data or tool calls found - this might be expected for pure conversation');
    }

    // 验证消息类型一致性
    for (const message of result.contextData) {
      if (message.messageType !== MessageType.CONTEXT_INJECTION) {
        errors.push(`Context data contains non-context message type: ${message.messageType}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取分离统计信息
   */
  getStatistics(result: ContextHistorySeparationResult): {
    conversationMessages: number;
    contextMessages: number;
    toolCalls: number;
    toolResults: number;
    internalProcessing: number;
    totalMessages: number;
  } {
    return {
      conversationMessages: result.conversationHistory.length,
      contextMessages: result.contextData.length,
      toolCalls: result.toolCalls.length,
      toolResults: result.toolResults.length,
      internalProcessing: result.internalProcessing.length,
      totalMessages: result.conversationHistory.length + 
                    result.contextData.length + 
                    result.toolCalls.length + 
                    result.toolResults.length + 
                    result.internalProcessing.length
    };
  }
}
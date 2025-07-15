/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from './types.js';
import { ToolParser } from './tool-parser.js';
import { filterThinkTags } from '../../utils/fileUtils.js';
import { ContextAgent } from '../../context/contextAgent.js';
import { Config } from '../../config/config.js';

/**
 * 细菌式编程：响应处理操纵子
 * 小巧：仅处理模型响应
 * 模块化：独立的响应处理单元
 * 自包含：完整的响应处理功能
 */
export class ResponseProcessor {
  static async processResponse(
    rawResponse: string,
    contextAgent?: ContextAgent
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
  }> {
    // 1. 过滤思考标签，获取非思考内容
    const filteredContent = filterThinkTags(rawResponse);
    
    // 2. 解析工具调用
    const toolCalls = ToolParser.parseToolCalls(filteredContent);
    
    // 3. 移除工具调用标记，保留纯文本内容
    let cleanContent = this.removeToolCallMarkers(filteredContent);
    
    // 4. 对非思考内容进行RAG处理（思考内容不要RAG）
    if (cleanContent && contextAgent) {
      const ragContext = await this.processResponseWithRAG(cleanContent, contextAgent);
      if (ragContext) {
        // 将RAG上下文拼接到响应中
        cleanContent = `${cleanContent}\n\n${ragContext}`;
      }
    }
    
    return {
      content: cleanContent.trim(),
      toolCalls
    };
  }

  /**
   * 通过Config获取ContextAgent并处理响应
   */
  static async processResponseWithConfig(
    rawResponse: string,
    config?: Config
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
  }> {
    let contextAgent: ContextAgent | undefined;
    
    // 尝试从Config获取ContextAgent
    if (config) {
      try {
        contextAgent = config.getContextAgent();
      } catch (error) {
        // ContextAgent未初始化，继续使用普通处理
        console.debug('[ResponseProcessor] ContextAgent未初始化，跳过RAG处理');
      }
    }
    
    return this.processResponse(rawResponse, contextAgent);
  }

  /**
   * 同步版本的处理方法（向后兼容）
   */
  static processResponseSync(rawResponse: string): {
    content: string;
    toolCalls: ToolCall[];
  } {
    // 1. 过滤思考标签
    const filteredContent = filterThinkTags(rawResponse);
    
    // 2. 解析工具调用
    const toolCalls = ToolParser.parseToolCalls(filteredContent);
    
    // 3. 移除工具调用标记，保留纯文本内容
    const cleanContent = this.removeToolCallMarkers(filteredContent);
    
    return {
      content: cleanContent.trim(),
      toolCalls
    };
  }

  /**
   * 使用RAG处理模型回复中的非思考内容
   */
  private static async processResponseWithRAG(
    responseContent: string,
    contextAgent: ContextAgent
  ): Promise<string | null> {
    try {
      // 使用ContextAgent的RAG系统处理非思考内容
      const ragResult = await contextAgent.getContextForPrompt(responseContent);
      
      if (ragResult && ragResult.length > 0) {
        return `\n---\n# 🧠 模型回复RAG增强上下文\n${ragResult}`;
      }
      
      return null;
    } catch (error) {
      console.warn('[ResponseProcessor] RAG处理失败:', error);
      return null;
    }
  }

  private static removeToolCallMarkers(text: string): string {
    // 移除 ✦ 标记的工具调用
    return text.replace(/✦\s*\w+\s*\([^)]*\)\s*✦/g, '').trim();
  }

  static formatForDisplay(content: string): string {
    if (!content || content.trim().length === 0) {
      return '';
    }
    
    // 确保内容以换行符结束，便于显示
    return content.endsWith('\n') ? content : content + '\n';
  }

  static extractThinkingContent(text: string): string | null {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
    const match = text.match(thinkRegex);
    return match ? match[1].trim() : null;
  }

  static hasToolCalls(text: string): boolean {
    return /✦\s*\w+\s*\([^)]*\)\s*✦/.test(text);
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from './types.js';
import { ToolParser } from './tool-parser.js';
import { filterThinkTags } from '../../utils/fileUtils.js';

/**
 * 细菌式编程：响应处理操纵子
 * 小巧：仅处理模型响应
 * 模块化：独立的响应处理单元
 * 自包含：完整的响应处理功能
 */
export class ResponseProcessor {
  static processResponse(rawResponse: string): {
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
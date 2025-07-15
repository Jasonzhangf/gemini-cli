/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from '../types/interfaces.js';

/**
 * JSON格式工具调用解析器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class JsonToolCallParser {
  private readonly toolDeclarations: any[];
  private readonly debugMode: boolean;

  constructor(toolDeclarations: any[], debugMode: boolean = false) {
    this.toolDeclarations = toolDeclarations;
    this.debugMode = debugMode;
  }

  /**
   * 解析JSON格式的工具调用
   */
  parse(content: string, processedPositions: Set<number>): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const patterns = this.getJsonPatterns();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (processedPositions.has(match.index)) {
          continue;
        }

        const toolCall = this.parseJsonMatch(match, content);
        if (toolCall) {
          toolCalls.push(toolCall);
          processedPositions.add(match.index);
        }
      }
    }

    return toolCalls;
  }

  /**
   * 获取JSON模式
   */
  private getJsonPatterns(): RegExp[] {
    return [
      /✦\s*(\{[\s\S]*?\})/g,                    // ✦ symbol prefix
      /(?:tool_call|function_call):\s*(\{[\s\S]*?\})/gi, // explicit tool_call labels
      /```json\s*(\{[\s\S]*?\})\s*```/gi,       // json code blocks
      /```\s*(\{[\s\S]*?\})\s*```/gi,           // generic code blocks with JSON
    ];
  }

  /**
   * 解析JSON匹配
   */
  private parseJsonMatch(match: RegExpExecArray, content: string): ToolCall | null {
    try {
      let jsonStr = match[1];

      // 尝试提取完整的JSON
      if (!this.isBalancedBraces(jsonStr)) {
        const fullMatch = this.extractCompleteJson(content, match.index + match[0].indexOf('{'));
        if (fullMatch) {
          jsonStr = fullMatch;
        }
      }

      const toolCallJson = this.parseToolCallJson(jsonStr);
      if (!toolCallJson?.name) {
        return null;
      }

      const toolName = this.normalizeToolName(toolCallJson.name);
      if (!this.isValidTool(toolName)) {
        if (this.debugMode) {
          console.warn(`[JsonParser] Unknown tool: ${toolName}`);
        }
        return null;
      }

      const callId = this.generateCallId('json');
      const args = this.processArguments(toolCallJson.arguments || toolCallJson.args || {});

      return {
        callId,
        name: toolName,
        args,
      };
    } catch (error) {
      if (this.debugMode) {
        console.warn('[JsonParser] Parse error:', error);
      }
      return null;
    }
  }

  /**
   * 解析工具调用JSON
   */
  private parseToolCallJson(jsonStr: string): any {
    try {
      return JSON.parse(jsonStr);
    } catch (initialError) {
      // 尝试修复常见的JSON问题
      return this.fixAndParseJson(jsonStr);
    }
  }

  /**
   * 修复并解析JSON
   */
  private fixAndParseJson(jsonStr: string): any {
    let fixed = jsonStr.trim();

    // 移除✦符号
    fixed = fixed.replace(/✦/g, '');
    
    // 移除末尾多余的引号
    fixed = fixed.replace(/}["'`]*$/, '}');
    
    // 添加缺失的闭合括号
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      fixed += '}'.repeat(openBraces - closeBraces);
    }
    
    // 修复未加引号的键
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // 修复尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复未加引号的字符串值
    fixed = fixed.replace(/:\s*([^\s\"\d\{\}\[\],][^,\}\]]*)/g, ': "$1"');

    try {
      return JSON.parse(fixed);
    } catch (finalError) {
      if (this.debugMode) {
        console.warn('[JsonParser] JSON fix failed:', finalError);
      }
      return null;
    }
  }

  /**
   * 处理参数
   */
  private processArguments(args: any): any {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return { input: args };
      }
    }
    return args;
  }

  /**
   * 检查括号是否平衡
   */
  private isBalancedBraces(str: string): boolean {
    let count = 0;
    for (const char of str) {
      if (char === '{') count++;
      else if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  /**
   * 提取完整JSON对象
   */
  private extractCompleteJson(content: string, startPos: number): string | null {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let i = startPos;
    
    // 找到开始括号
    while (i < content.length && content[i] !== '{') {
      i++;
    }
    
    if (i >= content.length) return null;
    
    const start = i;
    
    for (; i < content.length; i++) {
      const char = content[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return content.substring(start, i + 1);
          }
        }
      }
    }
    
    return null;
  }

  /**
   * 工具名称规范化
   */
  private normalizeToolName(name: string): string {
    const mapping: Record<string, string> = {
      readFile: 'read_file',
      writeFile: 'write_file',
      shell: 'run_shell_command',
      bash: 'run_shell_command',
      exec: 'run_shell_command',
      edit: 'replace',
      find: 'glob',
      fetch: 'web_fetch',
      remember: 'save_memory',
      todo: 'create_tasks',
      task: 'create_tasks',
    };
    return mapping[name] || name;
  }

  /**
   * 验证工具是否有效
   */
  private isValidTool(toolName: string): boolean {
    return this.toolDeclarations.some(tool => tool.name === toolName);
  }

  /**
   * 生成调用ID
   */
  private generateCallId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall, ContentIsolationMarkers } from '../types/interfaces.js';

/**
 * 内容隔离解析器 - 专门处理复杂文本参数
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ContentIsolationParser {
  private readonly markers: ContentIsolationMarkers;
  private readonly toolDeclarations: any[];
  private readonly debugMode: boolean;

  constructor(toolDeclarations: any[], debugMode: boolean = false) {
    this.toolDeclarations = toolDeclarations;
    this.debugMode = debugMode;
    this.markers = {
      CONTENT_START_MARKER: '<*#*#CONTENT#*#*>',
      CONTENT_END_MARKER: '</*#*#CONTENT#*#*>',
      CONTENT_MARKER_PATTERN: /<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g,
    };
  }

  /**
   * 解析内容隔离格式的工具调用
   */
  parse(content: string, processedPositions: Set<number>): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const patterns = this.getContentIsolationPatterns();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (processedPositions.has(match.index)) {
          continue;
        }

        const toolCall = this.parseMatch(match);
        if (toolCall) {
          toolCalls.push(toolCall);
          processedPositions.add(match.index);
        }
      }
    }

    return toolCalls;
  }

  /**
   * 获取内容隔离模式
   */
  private getContentIsolationPatterns(): RegExp[] {
    return [
      // Pattern: ✦ tool_name file_path <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
      /✦\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^\s]+)\s+<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g,
      // Pattern: [tool_call: tool_name for file_path] <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([^\]]+)\]\s*<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g,
    ];
  }

  /**
   * 解析匹配结果
   */
  private parseMatch(match: RegExpExecArray): ToolCall | null {
    try {
      const toolName = this.normalizeToolName(match[1]);
      const filePath = match[2].trim().replace(/^['"`]|['"`]$/g, '');
      const contentValue = match[3];

      if (!this.isValidTool(toolName)) {
        if (this.debugMode) {
          console.warn(`[ContentIsolation] Unknown tool: ${toolName}`);
        }
        return null;
      }

      const callId = this.generateCallId('content_isolation');
      const args = this.buildArguments(toolName, filePath, contentValue);

      return {
        callId,
        name: toolName,
        args,
      };
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContentIsolation] Parse error:', error);
      }
      return null;
    }
  }

  /**
   * 构建工具参数
   */
  private buildArguments(toolName: string, filePath: string, contentValue: string): any {
    switch (toolName) {
      case 'write_file':
        return { file_path: filePath, content: contentValue };
      
      case 'replace':
        const parts = contentValue.split('|||');
        return {
          file_path: filePath,
          old_string: parts[0]?.trim() || '',
          new_string: parts[1]?.trim() || contentValue,
        };
      
      default:
        return {
          [this.getContentParameterName(toolName)]: contentValue,
          ...(filePath && { file_path: filePath }),
        };
    }
  }

  /**
   * 获取内容参数名称
   */
  private getContentParameterName(toolName: string): string {
    const contentParams: Record<string, string> = {
      write_file: 'content',
      replace: 'new_string',
      create_tasks: 'tasks',
      save_memory: 'content',
      run_shell_command: 'command',
    };
    return contentParams[toolName] || 'content';
  }

  /**
   * 工具名称规范化
   */
  private normalizeToolName(name: string): string {
    const mapping: Record<string, string> = {
      write: 'write_file',
      edit: 'replace',
      shell: 'run_shell_command',
      bash: 'run_shell_command',
    };
    return mapping[name.toLowerCase()] || name;
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
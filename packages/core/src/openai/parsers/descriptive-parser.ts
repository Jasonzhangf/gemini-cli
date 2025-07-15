/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from '../types/interfaces.js';

/**
 * 描述性格式工具调用解析器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class DescriptiveToolCallParser {
  private readonly toolDeclarations: any[];
  private readonly complexTools: Set<string>;
  private readonly debugMode: boolean;

  constructor(toolDeclarations: any[], complexTools: Set<string>, debugMode: boolean = false) {
    this.toolDeclarations = toolDeclarations;
    this.complexTools = complexTools;
    this.debugMode = debugMode;
  }

  /**
   * 解析描述性格式的工具调用
   */
  parse(content: string, processedPositions: Set<number>): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const patterns = this.getDescriptivePatterns();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (processedPositions.has(match.index)) {
          continue;
        }

        const toolCall = this.parseDescriptiveMatch(match);
        if (toolCall) {
          toolCalls.push(toolCall);
          processedPositions.add(match.index);
        }
      }
    }

    return toolCalls;
  }

  /**
   * 获取描述性模式
   */
  private getDescriptivePatterns(): RegExp[] {
    return [
      // 具体参数模式
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+'([^']+)'\]/gi,
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+"([^"]+)"\]/gi,
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([^\]]+)\]/gi,
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+((?:to|with)\s+[^\]]+)\]/gi,
      
      // 简单无参数格式
      /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\]/gi,
      
      // 替代格式
      /\[([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+(.+)\]/gi,
      /\[([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)\]/gi,
    ];
  }

  /**
   * 解析描述性匹配
   */
  private parseDescriptiveMatch(match: RegExpExecArray): ToolCall | null {
    try {
      const toolName = this.normalizeToolName(match[1]);
      const paramText = match[2] || match[3] || '';

      if (!this.isValidTool(toolName)) {
        if (this.debugMode) {
          console.warn(`[DescriptiveParser] Unknown tool: ${toolName}`);
        }
        return null;
      }

      // 跳过需要JSON格式的复杂工具
      if (this.complexTools.has(toolName)) {
        if (this.debugMode) {
          console.warn(`[DescriptiveParser] Complex tool '${toolName}' requires JSON format`);
        }
        return null;
      }

      const callId = this.generateCallId('descriptive');
      const args = this.parseDescriptiveArgs(toolName, paramText);

      return {
        callId,
        name: toolName,
        args,
      };
    } catch (error) {
      if (this.debugMode) {
        console.warn('[DescriptiveParser] Parse error:', error);
      }
      return null;
    }
  }

  /**
   * 解析描述性参数
   */
  private parseDescriptiveArgs(toolName: string, paramText: string): any {
    const cleanParam = paramText.replace(/^['"`]|['"`]$/g, '').trim();
    
    // 尝试解析复杂参数格式
    const complexArgs = this.parseComplexParams(cleanParam);
    if (Object.keys(complexArgs).length > 0) {
      return complexArgs;
    }

    // 基于工具类型的参数映射
    return this.mapToolSpecificArgs(toolName, cleanParam);
  }

  /**
   * 解析复杂参数
   */
  private parseComplexParams(text: string): any {
    const args: any = {};
    
    // 提取键值对
    const keyValuePattern = /(\w+)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = keyValuePattern.exec(text)) !== null) {
      args[match[1]] = match[2];
    }
    
    // 提取数组参数
    const arrayPattern = /(\w+)\s+\[([^\]]+)\]/g;
    let arrayMatch;
    while ((arrayMatch = arrayPattern.exec(text)) !== null) {
      const items = arrayMatch[2].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
      args[arrayMatch[1]] = items;
    }
    
    return args;
  }

  /**
   * 映射工具特定参数
   */
  private mapToolSpecificArgs(toolName: string, param: string): any {
    switch (toolName) {
      case 'read_file':
        return { file_path: param };
      
      case 'list_directory':
        return { path: param || '.' };
      
      case 'search_file_content':
        return { pattern: param };
      
      case 'run_shell_command':
        return { command: param };
      
      case 'glob':
        return { pattern: param };
      
      case 'web_fetch':
        return { url: param };
      
      case 'google_web_search':
        return { query: param };
      
      case 'save_memory':
        return { content: param };
      
      case 'read_many_files':
        if (param.includes(',')) {
          const paths = param.split(',').map(p => p.trim());
          return { paths };
        }
        return { paths: [param] };
      
      case 'get_current_task':
      case 'finish_current_task':
      case 'get_next_task':
        return {};
      
      case 'insert_task':
        return { description: param.substring(0, 20) };
      
      default:
        // 通用回退
        if (param.includes('/') || param.includes('\\')) {
          return { file_path: param };
        } else if (param.startsWith('http')) {
          return { url: param };
        } else {
          return { input: param };
        }
    }
  }

  /**
   * 工具名称规范化
   */
  private normalizeToolName(name: string): string {
    const mapping: Record<string, string> = {
      read: 'read_file',
      write: 'write_file',
      ls: 'list_directory',
      grep: 'search_file_content',
      shell: 'run_shell_command',
      bash: 'run_shell_command',
      exec: 'run_shell_command',
      edit: 'replace',
      find: 'glob',
      fetch: 'web_fetch',
      remember: 'save_memory',
      todo: 'create_tasks',
      task: 'create_tasks',
      current_task: 'get_current_task',
      finish_task: 'finish_current_task',
      next_task: 'get_next_task',
      add_task: 'insert_task',
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
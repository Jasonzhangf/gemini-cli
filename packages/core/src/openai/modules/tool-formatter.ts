/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from '@google/genai';

/**
 * 细菌式编程：工具格式化操纵子
 * 小巧：仅负责工具格式转换
 * 模块化：独立的格式化单元
 * 自包含：完整的工具格式化功能
 */
export class ToolFormatter {
  static toOpenAIFormat(geminiTools: Tool[]): any[] {
    return geminiTools.map(tool => this.convertSingleTool(tool));
  }

  private static convertSingleTool(tool: Tool): any {
    if (!tool.functionDeclarations || tool.functionDeclarations.length === 0) {
      return null;
    }

    const func = tool.functionDeclarations[0];
    
    return {
      type: 'function',
      function: {
        name: func.name,
        description: func.description || '',
        parameters: this.convertParameters(func.parameters)
      }
    };
  }

  private static convertParameters(params: any): any {
    if (!params) {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    const converted: any = {
      type: 'object',
      properties: {},
      required: []
    };

    if (params.properties) {
      converted.properties = { ...params.properties };
    }

    if (params.required && Array.isArray(params.required)) {
      converted.required = [...params.required];
    }

    return converted;
  }

  static formatToolInstructions(toolNames: string[]): string {
    if (toolNames.length === 0) {
      return '';
    }

    const instructions = [
      '## 工具调用指南',
      '当需要使用工具时，请严格按照以下格式：',
      '✦ tool_name({"param": "value"}) ✦',
      '',
      '可用工具：',
      ...toolNames.map(name => `- ${name}`),
      '',
      '注意：',
      '- 工具调用必须以 ✦ 开始和结束',
      '- 参数必须是有效的JSON格式',
      '- 一次只能调用一个工具',
      ''
    ];

    return instructions.join('\n');
  }

  static isValidToolCall(text: string): boolean {
    const toolCallPattern = /✦\s*\w+\s*\([^)]*\)\s*✦/;
    return toolCallPattern.test(text);
  }
}
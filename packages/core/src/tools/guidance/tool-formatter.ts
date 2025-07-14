/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 细菌式编程：工具格式化操纵子
 * 小巧：仅负责工具描述的格式化
 * 模块化：独立的格式化单元
 * 自包含：完整的工具格式化功能
 */
export class ToolFormatter {
  static formatToolList(tools: Array<{ name: string; description?: string }>): string {
    if (tools.length === 0) {
      return '- No tools available';
    }

    return tools
      .map(tool => {
        const desc = tool.description ? `: ${tool.description}` : '';
        return `- **${tool.name}**${desc}`;
      })
      .join('\n');
  }

  static formatToolExample(toolName: string, params: string): string {
    return `\`[tool_call: ${toolName} for ${params}]\``;
  }

  static formatToolExamples(examples: Array<{ tool: string; params: string; description?: string }>): string {
    return examples
      .map(example => {
        const desc = example.description ? ` // ${example.description}` : '';
        return `- ${this.formatToolExample(example.tool, example.params)}${desc}`;
      })
      .join('\n');
  }

  static formatToolCategory(categoryName: string, tools: string[]): string {
    if (tools.length === 0) {
      return '';
    }

    return `
**${categoryName}:**
${tools.map(tool => `- ${tool}`).join('\n')}
`;
  }

  static formatToolsByCategory(categories: Record<string, string[]>): string {
    return Object.entries(categories)
      .map(([category, tools]) => this.formatToolCategory(category, tools))
      .filter(section => section.length > 0)
      .join('\n');
  }

  static extractToolFromCallSyntax(toolCall: string): { name: string; params: string } | null {
    // 匹配 [tool_call: tool_name for parameters] 格式
    const match = toolCall.match(/\[tool_call:\s*(\w+)\s+for\s+(.+)\]/);
    if (!match) {
      return null;
    }

    return {
      name: match[1],
      params: match[2]
    };
  }

  static validateToolCallSyntax(toolCall: string): boolean {
    return /\[tool_call:\s*\w+\s+for\s+.+\]/.test(toolCall);
  }

  static generateToolCallTemplate(toolName: string, paramDescription: string = 'parameters'): string {
    return `[tool_call: ${toolName} for ${paramDescription}]`;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';

/**
 * 上下文格式化器 - 纯粹的格式化逻辑，无业务逻辑
 * 遵循单一职责原则：只负责将数据格式化为特定格式
 */
export class ContextFormatter {
  
  /**
   * 格式化工具列表为可读字符串
   */
  formatToolList(tools: FunctionDeclaration[]): string {
    if (tools.length === 0) {
      return '- (No tools available in current context)';
    }
    
    return tools
      .map(tool => `- **${tool.name}**: ${tool.description ?? 'No description available'}`)
      .join('\n');
  }

  /**
   * 格式化系统能力列表
   */
  formatCapabilities(capabilities: string[]): string {
    return capabilities.map(cap => `- ${cap}`).join('\n');
  }

  /**
   * 格式化基础系统信息
   */
  formatSystemInfo(info: {
    workingDirectory: string;
    timestamp: string;
    sessionId: string;
    debugMode: boolean;
  }): string {
    return `**Working Directory**: ${info.workingDirectory}
**Session ID**: ${info.sessionId}
**Timestamp**: ${info.timestamp}
**Debug Mode**: ${info.debugMode ? 'Enabled' : 'Disabled'}`;
  }

  /**
   * 格式化工具调用示例
   */
  formatToolCallExamples(): string {
    return `**EXAMPLES**:
- \`[tool_call: glob for pattern '**/*.py']\`
- \`[tool_call: read_file for '/path/to/file.py']\`
- \`[tool_call: run_shell_command for 'ls -la']\`
- \`[tool_call: create_tasks for tasks ["task1", "task2"]]\``;
  }

  /**
   * 格式化分隔符
   */
  formatSeparator(length: number = 80): string {
    return '═'.repeat(length);
  }

  /**
   * 格式化章节标题
   */
  formatSectionTitle(title: string, emoji: string = '📋'): string {
    return `# ${emoji} ${title}`;
  }

  /**
   * 格式化子章节标题
   */
  formatSubSectionTitle(title: string, emoji: string = '##'): string {
    return `${emoji} ${title}`;
  }

  /**
   * 组合多个格式化的部分
   */
  combineFormattedSections(sections: string[], separator: string = '\n\n---\n\n'): string {
    return sections.filter(section => section.trim()).join(separator);
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { PromptSectionGenerator } from './PromptSectionGenerator.js';
import { ContextFormatter } from './ContextFormatter.js';

/**
 * 系统提示词构建器 - 专门负责组装系统提示词
 * 遵循单一职责原则：只负责组装，不负责具体内容生成
 */
export class SystemPromptBuilder {
  private sectionGenerator: PromptSectionGenerator;
  private formatter: ContextFormatter;

  constructor() {
    this.sectionGenerator = new PromptSectionGenerator();
    this.formatter = new ContextFormatter();
  }

  /**
   * 构建完整的系统提示词
   */
  buildSystemPrompt(config: {
    tools: FunctionDeclaration[];
    includeContext: boolean;
    includeTaskManagement: boolean;
    debugMode: boolean;
    includeFileOperations: boolean;
    includeShellCommands: boolean;
    includeTaskGuidance: boolean;
  }): string {
    const sections: string[] = [];

    // 1. 核心身份和角色
    sections.push(this.sectionGenerator.generateIdentitySection());

    // 2. 工具调用格式
    sections.push(this.sectionGenerator.generateToolCallFormatSection(config.tools));

    // 3. 核心准则
    sections.push(this.sectionGenerator.generateCoreMandatesSection());

    // 4. 任务管理（可选）
    if (config.includeTaskManagement) {
      sections.push(this.sectionGenerator.generateTaskManagementSection());
    }

    // 5. 内容隔离格式
    sections.push(this.sectionGenerator.generateContentIsolationSection());

    // 6. 安全和执行规则
    sections.push(this.sectionGenerator.generateSafetySection());

    // 7. 上下文分析（可选）
    if (config.includeContext) {
      sections.push(this.sectionGenerator.generateContextAnalysisSection(config.debugMode));
    }

    // 8. 工具特定引导
    const toolGuidanceSections = this.buildToolGuidanceSections(config);
    if (toolGuidanceSections.length > 0) {
      sections.push(...toolGuidanceSections);
    }

    return this.formatter.combineFormattedSections(sections);
  }

  /**
   * 构建工具特定引导部分
   */
  private buildToolGuidanceSections(config: {
    includeFileOperations: boolean;
    includeShellCommands: boolean;
    includeTaskGuidance: boolean;
  }): string[] {
    const sections: string[] = [];

    if (config.includeFileOperations) {
      sections.push(this.sectionGenerator.generateFileOperationsGuidance());
    }

    if (config.includeShellCommands) {
      sections.push(this.sectionGenerator.generateShellCommandsGuidance());
    }

    if (config.includeTaskGuidance) {
      sections.push(this.sectionGenerator.generateTaskManagementGuidance());
    }

    return sections;
  }

  /**
   * 构建基础系统提示词（无增强功能）
   */
  buildBasicSystemPrompt(tools: FunctionDeclaration[]): string {
    return this.buildSystemPrompt({
      tools,
      includeContext: false,
      includeTaskManagement: false,
      debugMode: false,
      includeFileOperations: false,
      includeShellCommands: false,
      includeTaskGuidance: false
    });
  }

  /**
   * 构建增强系统提示词（包含所有功能）
   */
  buildEnhancedSystemPrompt(tools: FunctionDeclaration[], debugMode: boolean): string {
    return this.buildSystemPrompt({
      tools,
      includeContext: true,
      includeTaskManagement: true,
      debugMode,
      includeFileOperations: this.hasFileTools(tools),
      includeShellCommands: this.hasShellTools(tools),
      includeTaskGuidance: this.hasTaskTools(tools)
    });
  }

  /**
   * 检查是否有文件操作工具
   */
  private hasFileTools(tools: FunctionDeclaration[]): boolean {
    const fileToolNames = ['read_file', 'write_file', 'replace', 'glob', 'search_file_content'];
    return tools.some(tool => tool.name && fileToolNames.includes(tool.name));
  }

  /**
   * 检查是否有Shell命令工具
   */
  private hasShellTools(tools: FunctionDeclaration[]): boolean {
    return tools.some(tool => tool.name === 'run_shell_command');
  }

  /**
   * 检查是否有任务管理工具
   */
  private hasTaskTools(tools: FunctionDeclaration[]): boolean {
    const taskToolNames = ['create_tasks', 'get_current_task', 'finish_current_task', 'get_next_task'];
    return tools.some(tool => tool.name && taskToolNames.includes(tool.name));
  }
}
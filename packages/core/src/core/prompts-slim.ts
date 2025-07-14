/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { GEMINI_CONFIG_DIR } from '../tools/memoryTool.js';
import { PromptBuilder, DevelopmentStrategy, AnalysisStrategy, WorkflowStrategy } from '../tools/guidance/index.js';

/**
 * 细菌式编程：精简提示生成器
 * 小巧：仅负责系统提示的组装
 * 模块化：由独立的策略操纵子组成
 * 自包含：完整的提示生成功能
 */
export class SlimPromptGenerator {
  static getCoreSystemPrompt(userMemory?: string): string {
    const customPrompt = this.loadCustomSystemPrompt();
    if (customPrompt) {
      return this.enhanceWithMemory(customPrompt, userMemory);
    }

    const basePrompt = this.buildDefaultPrompt();
    return this.enhanceWithMemory(basePrompt, userMemory);
  }

  private static loadCustomSystemPrompt(): string | null {
    const systemMdVar = process.env.GEMINI_SYSTEM_MD?.toLowerCase();
    if (!systemMdVar || ['0', 'false'].includes(systemMdVar)) {
      return null;
    }

    const systemMdPath = ['1', 'true'].includes(systemMdVar)
      ? path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'))
      : path.resolve(systemMdVar);

    if (!fs.existsSync(systemMdPath)) {
      throw new Error(`missing system prompt file '${systemMdPath}'`);
    }

    return fs.readFileSync(systemMdPath, 'utf8');
  }

  private static buildDefaultPrompt(): string {
    return PromptBuilder.create()
      .addSection('Role', 'You are an interactive CLI agent specializing in software engineering tasks.')
      .addToolCallFormat()
      .addCoreMandates()
      .addTaskManagement()
      .addSection('Development Workflows', DevelopmentStrategy.formatWorkflowTemplate('explore-plan-code-test'))
      .addSection('Analysis Workflows', DevelopmentStrategy.formatWorkflowTemplate('project-analysis'))
      .build();
  }

  private static enhanceWithMemory(basePrompt: string, userMemory?: string): string {
    if (!userMemory) {
      return basePrompt;
    }

    return `${basePrompt}\n\n# User Memory Context\n\n${userMemory}`;
  }

  static getCompressionPrompt(): string {
    return PromptBuilder.create()
      .addSection('Task', 'Compress the conversation history while preserving essential information.')
      .addSection('Guidelines', `
- Keep all tool calls and their results
- Preserve key decisions and their rationale
- Maintain context for ongoing tasks
- Remove redundant explanations and verbose descriptions
- Focus on actionable information and outcomes
`)
      .build();
  }

  static getStrategyPrompt(strategy: 'development' | 'analysis' | 'workflow'): string {
    switch (strategy) {
      case 'development':
        return DevelopmentStrategy.buildPrompt();
      case 'analysis':
        return AnalysisStrategy.buildPrompt();
      case 'workflow':
        return WorkflowStrategy.buildPrompt();
      default:
        return this.getCoreSystemPrompt();
    }
  }
}
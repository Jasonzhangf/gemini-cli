/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextWrapper } from './contextWrapper.js';
import { Config } from '../config/config.js';
import { TodoService } from './todoService.js';
import { buildPrompt } from './promptBuilder.js';

/**
 * 提示增强器 - 包装现有的提示生成系统，添加上下文管理功能
 * 不修改原有的prompts.ts，而是在其基础上增强
 */
export class PromptEnhancer {
  private contextWrapper: ContextWrapper;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.contextWrapper = new ContextWrapper(config);
    new TodoService();
  }

  /**
   * 初始化增强器
   */
  async initialize(): Promise<void> {
    await this.contextWrapper.initialize();
  }

  /**
   * 生成增强的系统提示
   * 包含基础系统提示词、任务管理和动态上下文
   */
  async getEnhancedSystemPrompt(): Promise<string> {
    return buildPrompt(this.config);
  }

  /**
   * 生成工具调用时的上下文提示
   */
  generateToolCallPrompt(): string {
    return this.contextWrapper.generateToolCallContext();
  }

  /**
   * 获取上下文包装器（用于其他组件访问）
   */
  getContextWrapper(): ContextWrapper {
    return this.contextWrapper;
  }
}

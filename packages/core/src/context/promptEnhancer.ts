/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCoreSystemPrompt } from '../core/prompts.js';
import { ContextWrapper } from './contextWrapper.js';
import { Config } from '../config/config.js';
import { TodoService } from './todoService.js';

/**
 * 提示增强器 - 包装现有的提示生成系统，添加上下文管理功能
 * 不修改原有的prompts.ts，而是在其基础上增强
 */
export class PromptEnhancer {
  private contextWrapper: ContextWrapper;
  private config: Config;
  private todoService: TodoService;

  constructor(config: Config) {
    this.config = config;
    this.contextWrapper = new ContextWrapper(config);
    this.todoService = new TodoService();
  }

  /**
   * 初始化增强器
   */
  async initialize(): Promise<void> {
    await this.contextWrapper.initialize();
  }

  /**
   * 生成增强的系统提示
   * 包装原有的getCoreSystemPrompt，添加上下文管理功能
   */
  async getEnhancedSystemPrompt(userMessage?: string): Promise<string> {
    // 获取增强的用户内存（包含原始内存 + 上下文管理的内容）
    const enhancedMemory = await this.contextWrapper.getEnhancedUserMemory(userMessage);
    
    // 使用原有的提示生成函数，但传入增强的内存
    const basePrompt = getCoreSystemPrompt(enhancedMemory);
    
    // 获取当前任务信息
    const currentTaskPrompt = await this.generateCurrentTaskPrompt();
    
    // 如果在任务维护模式，添加任务相关的系统提示
    if (this.contextWrapper.isInMaintenanceMode()) {
      const taskModePrompt = this.generateTaskModePrompt();
      return `${basePrompt}\n\n${currentTaskPrompt}\n\n${taskModePrompt}`;
    }
    
    // 即使不在维护模式，如果有当前任务也要显示
    if (currentTaskPrompt) {
      return `${basePrompt}\n\n${currentTaskPrompt}`;
    }
    
    return basePrompt;
  }

  /**
   * 生成当前任务提示
   */
  private async generateCurrentTaskPrompt(): Promise<string> {
    try {
      const currentTask = await this.todoService.getCurrentTask();
      if (!currentTask) {
        return '';
      }

      return `
# 🎯 当前工作目标

**目标任务**: ${currentTask.description}
**执行状态**: ${currentTask.status}
**创建时间**: ${new Date(currentTask.createdAt).toLocaleString()}

🔥 **核心工作流程**: 
1. **专注执行**: 当前任务是您的唯一工作目标，必须优先完成
2. **完成标记**: 任务完成后，立即使用以下命令标记完成：
   \`{"action": "update", "taskId": "${currentTask.id}", "status": "completed"}\`
3. **获取下一个**: 标记完成后，系统自动分配下一个任务作为新的工作目标
4. **状态同步**: 每次使用工具时，都要考虑是否推进了当前工作目标

⚠️ **关键提醒**: 
- 当前任务未完成前，不要分心处理其他事项
- 完成任务后必须主动更新状态，否则系统无法分配下一个任务
- 如需修改或分解任务，使用 todo 工具调整后继续执行
`.trim();
    } catch (error) {
      // 如果读取当前任务失败，不添加任务提示
      return '';
    }
  }

  /**
   * 生成任务维护模式的系统提示
   */
  private generateTaskModePrompt(): string {
    return `
# 任务维护模式

你当前处于任务维护模式。在此模式下：

1. **任务导向**: 专注于完成当前活跃的任务
2. **状态更新**: 完成任务后立即使用 todo 工具更新状态  
3. **进度跟踪**: 定期检查任务进度和完成情况
4. **自动提示**: 系统会在工具调用时自动提醒当前任务

## 任务管理工具使用指南

- **查看当前任务**: \`{"action": "current"}\`
- **更新任务状态**: \`{"action": "update", "taskId": "task_id", "status": "completed"}\`
- **查看所有任务**: \`{"action": "list"}\`
- **结束维护模式**: \`{"action": "end_maintenance"}\` (所有任务完成后)

请在执行任何工具调用时，牢记当前的任务目标，并在完成相关工作后及时更新任务状态。
`.trim();
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
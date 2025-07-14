/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { TodoService } from '../context/todoService.js';
import { ContextManager } from '../context/contextManager.js';

/**
 * Simple tool to complete current task
 */
export class FinishCurrentTaskTool extends BaseTool<{}, ToolResult> {
  static readonly Name = 'finish_current_task';
  private todoService: TodoService;
  private contextManager: ContextManager | null;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'finish_current_task',
      '完成当前任务',
      '完成当前正在执行的任务，自动进入下一个任务',
      {
        type: Type.OBJECT,
        properties: {},
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
    
    if (config) {
      try {
        this.contextManager = config.getContextManager();
      } catch (error) {
        this.contextManager = new ContextManager(process.cwd(), false);
      }
    } else {
      this.contextManager = new ContextManager(process.cwd(), false);
    }
  }

  async execute(): Promise<ToolResult> {
    const currentTaskId = await this.todoService.getCurrentTaskId();
    
    if (!currentTaskId) {
      return {
        llmContent: JSON.stringify({ error: 'no_current_task' }),
        returnDisplay: '❌ 没有当前任务可完成',
      };
    }

    const tasks = await this.todoService.loadTasks();
    const task = tasks.find((t: any) => t.id === currentTaskId);
    
    if (!task) {
      return {
        llmContent: JSON.stringify({ error: 'task_not_found' }),
        returnDisplay: '❌ 未找到当前任务',
      };
    }

    // Mark task as completed
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    
    await this.todoService.saveTasks(tasks);
    
    if (this.contextManager) {
      await this.contextManager.updateTaskStatus(currentTaskId, 'completed');
    }

    // Find next pending task
    const nextTask = tasks.find((t: any) => t.status === 'pending');
    
    if (nextTask) {
      // Set next task as current
      await this.todoService.setCurrentTask(nextTask.id);
      await this.todoService.updateTaskStatus(nextTask.id, 'in_progress');
      
      if (this.contextManager) {
        await this.contextManager.updateTaskStatus(nextTask.id, 'in_progress');
      }

      const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
      
      return {
        llmContent: JSON.stringify({ 
          completedTask: task, 
          nextTask,
          progress: `${completedCount}/${tasks.length}`
        }),
        returnDisplay: `✅ 已完成任务: ${task.description}
🔄 下一个任务: ${nextTask.description}
📊 进度: ${completedCount}/${tasks.length}`,
      };
    } else {
      // No more tasks - end maintenance mode
      // Clear current task
      
      if (this.contextManager) {
        await this.contextManager.endMaintenanceMode();
      }

      const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
      
      return {
        llmContent: JSON.stringify({ 
          completedTask: task,
          nextTask: null,
          progress: `${completedCount}/${tasks.length}`,
          finished: true
        }),
        returnDisplay: `✅ 已完成任务: ${task.description}
🎉 所有任务已完成！进度: ${completedCount}/${tasks.length}
✅ 任务维护模式已结束`,
      };
    }
  }
}
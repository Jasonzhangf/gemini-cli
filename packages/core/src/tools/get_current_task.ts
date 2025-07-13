/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { TodoService } from '../context/todoService.js';

/**
 * Simple tool to get current task
 */
export class GetCurrentTaskTool extends BaseTool<{}, ToolResult> {
  static readonly Name = 'get_current_task';
  private todoService: TodoService;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'get_current_task',
      '获取当前任务',
      '获取当前正在执行的任务信息',
      {
        type: Type.OBJECT,
        properties: {},
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
  }

  async execute(): Promise<ToolResult> {
    const currentTaskId = await this.todoService.getCurrentTaskId();
    
    if (!currentTaskId) {
      return {
        llmContent: JSON.stringify({ task: null }),
        returnDisplay: '📋 没有当前任务',
      };
    }

    const tasks = await this.todoService.loadTasks();
    const currentTask = tasks.find((t: any) => t.id === currentTaskId);
    
    if (!currentTask) {
      return {
        llmContent: JSON.stringify({ task: null }),
        returnDisplay: '📋 没有找到当前任务',
      };
    }

    const statusIcon = currentTask.status === 'in_progress' ? '🔄' : 
                      currentTask.status === 'completed' ? '✅' : '⏳';

    return {
      llmContent: JSON.stringify({ task: currentTask }),
      returnDisplay: `📋 当前任务: ${statusIcon} ${currentTask.description} (${currentTask.status})`,
    };
  }
}
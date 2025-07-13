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
 * Simple tool to get next pending task
 */
export class GetNextTaskTool extends BaseTool<{}, ToolResult> {
  static readonly Name = 'get_next_task';
  private todoService: TodoService;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'get_next_task',
      '查看下一个待执行任务',
      '查看下一个等待执行的任务',
      {
        type: Type.OBJECT,
        properties: {},
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
  }

  async execute(): Promise<ToolResult> {
    const tasks = await this.todoService.loadTasks();
    const nextTask = tasks.find((t: any) => t.status === 'pending');
    
    if (!nextTask) {
      const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
      return {
        llmContent: JSON.stringify({ task: null, progress: `${completedCount}/${tasks.length}` }),
        returnDisplay: `📋 没有更多待执行任务
📊 当前进度: ${completedCount}/${tasks.length}`,
      };
    }

    const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
    const currentTaskIndex = tasks.findIndex((t: any) => t.id === nextTask.id) + 1;

    return {
      llmContent: JSON.stringify({ 
        task: nextTask,
        position: currentTaskIndex,
        progress: `${completedCount}/${tasks.length}`
      }),
      returnDisplay: `📋 下一个任务: ${currentTaskIndex}. ⏳ ${nextTask.description}
📊 当前进度: ${completedCount}/${tasks.length}`,
    };
  }
}
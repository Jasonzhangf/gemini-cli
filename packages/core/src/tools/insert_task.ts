/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { TodoService } from '../context/todoService.js';

export interface InsertTaskParams {
  description: string;
}

/**
 * Simple tool to insert a new task after current task
 */
export class InsertTaskTool extends BaseTool<InsertTaskParams, ToolResult> {
  static readonly Name = 'insert_task';
  private todoService: TodoService;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'insert_task',
      '在当前任务后插入新任务',
      '在当前任务后面插入一个新的任务',
      {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: '新任务描述，不超过20个字符'
          }
        },
        required: ['description']
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
  }

  async execute(params: InsertTaskParams): Promise<ToolResult> {
    if (!params.description || params.description.trim().length === 0) {
      throw new Error('任务描述不能为空');
    }

    if (params.description.length > 20) {
      throw new Error(`任务描述"${params.description}"超过20个字符限制`);
    }

    const tasks = await this.todoService.loadTasks();
    const currentTaskId = await this.todoService.getCurrentTaskId();
    
    if (!currentTaskId) {
      throw new Error('没有当前任务，无法插入新任务');
    }

    const currentTaskIndex = tasks.findIndex((t: any) => t.id === currentTaskId);
    
    if (currentTaskIndex === -1) {
      throw new Error('未找到当前任务');
    }

    // Create new task
    const newTask = this.todoService.createTask(params.description.trim());
    
    // Insert after current task
    tasks.splice(currentTaskIndex + 1, 0, newTask);
    
    await this.todoService.saveTasks(tasks);

    const position = currentTaskIndex + 2; // +1 for index, +1 for position after current
    const totalTasks = tasks.length;

    return {
      llmContent: JSON.stringify({ 
        newTask,
        position,
        totalTasks
      }),
      returnDisplay: `✅ 已插入新任务: ${newTask.description}
📍 位置: 第 ${position} 个任务
📊 总任务数: ${totalTasks}`,
    };
  }
}
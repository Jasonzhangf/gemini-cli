/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { TodoService } from '../context/todoService.js';
import { TaskItem } from '../context/contextManager.js';

export interface TodoToolParams {
  action: 'create_list' | 'add_task' | 'update' | 'current' | 'list' | 'end_maintenance';
  tasks?: string[]; // 用于 create_list
  description?: string; // 用于 add_task，最多20个字
  taskId?: string; // 用于 update
  status?: 'pending' | 'in_progress' | 'completed'; // 用于 update
}

export class TodoTool extends BaseTool<TodoToolParams, ToolResult> {
  static readonly Name = 'todo';
  private todoService: TodoService;
  
  constructor() {
    super(
      'todo',
      '任务管理工具',
      '管理任务列表，支持创建任务列表、添加任务、更新状态、查看当前任务等。任务描述不超过20个字。',
      {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: '操作类型',
            enum: ['create_list', 'add_task', 'update', 'current', 'list', 'end_maintenance'],
          },
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '任务描述列表（用于 create_list），每个任务不超过20个字',
          },
          description: {
            type: Type.STRING,
            description: '新任务描述（用于 add_task），不超过20个字',
          },
          taskId: {
            type: Type.STRING,
            description: '任务ID（用于 update）',
          },
          status: {
            type: Type.STRING,
            description: '任务状态（用于 update）',
            enum: ['pending', 'in_progress', 'completed'],
          },
        },
        required: ['action'],
      }
    );
    this.todoService = new TodoService();
  }

  async execute(params: TodoToolParams): Promise<ToolResult> {
    const { action } = params;
    let result: any;

    switch (action) {
      case 'create_list':
        result = await this.createTaskList(params);
        break;

      case 'add_task':
        result = await this.addTask(params);
        break;

      case 'update':
        result = await this.updateTask(params);
        break;

      case 'current':
        result = await this.getCurrentTask();
        break;

      case 'list':
        result = await this.listTasks();
        break;

      case 'end_maintenance':
        result = await this.endMaintenanceMode();
        break;

      default:
        throw new Error(`Invalid action: ${action}`);
    }

    const llmContent = JSON.stringify(result, null, 2);
    return {
      llmContent,
      returnDisplay: llmContent,
    };
  }

  private async createTaskList(params: TodoToolParams): Promise<any> {
    if (!params.tasks || params.tasks.length === 0) {
      throw new Error('任务列表不能为空');
    }

    const tasks: TaskItem[] = [];
    for (const taskDesc of params.tasks) {
      if (!this.todoService.validateTaskDescription(taskDesc)) {
        throw new Error(`任务描述 "${taskDesc}" 超过20个字符限制`);
      }
      tasks.push(this.todoService.createTask(taskDesc));
    }

    await this.todoService.saveTasks(tasks);
    
    return {
      action: 'create_list',
      message: `已创建包含 ${tasks.length} 个任务的任务列表`,
      tasks: tasks.map(t => ({ id: t.id, description: t.description, status: t.status })),
      maintenanceMode: true,
    };
  }

  private async addTask(params: TodoToolParams): Promise<any> {
    if (!params.description) {
      throw new Error('任务描述不能为空');
    }

    const newTask = this.todoService.createTask(params.description);
    const existingTasks = await this.todoService.loadTasks();
    existingTasks.push(newTask);
    await this.todoService.saveTasks(existingTasks);

    return {
      action: 'add_task',
      message: `已添加新任务: "${newTask.description}"`,
      task: { id: newTask.id, description: newTask.description, status: newTask.status },
    };
  }

  private async updateTask(params: TodoToolParams): Promise<any> {
    if (!params.taskId || !params.status) {
      throw new Error('taskId 和 status 参数是必需的');
    }

    const tasks = await this.todoService.loadTasks();
    const task = tasks.find(t => t.id === params.taskId);
    
    if (!task) {
      throw new Error(`未找到ID为 ${params.taskId} 的任务`);
    }

    task.status = params.status;
    if (params.status === 'completed') {
      task.completedAt = new Date().toISOString();
    }

    await this.todoService.saveTasks(tasks);

    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const allCompleted = completedCount === tasks.length;

    return {
      action: 'update',
      message: `任务 "${task.description}" 状态已更新为: ${params.status}`,
      task: { id: task.id, description: task.description, status: task.status },
      progress: `${completedCount}/${tasks.length}`,
      allCompleted,
      suggestion: allCompleted ? '所有任务已完成，建议调用 end_maintenance 结束任务维护模式' : undefined,
    };
  }

  private async getCurrentTask(): Promise<any> {
    const tasks = await this.todoService.loadTasks();
    const currentTask = tasks.find(t => t.status !== 'completed');
    
    if (!currentTask) {
      const allCompleted = tasks.length > 0;
      return {
        action: 'current',
        message: allCompleted ? '所有任务已完成！' : '没有活跃的任务',
        currentTask: null,
        suggestion: allCompleted ? '建议调用 end_maintenance 结束任务维护模式' : '使用 create_list 创建新的任务列表',
      };
    }

    return {
      action: 'current',
      message: `当前任务: "${currentTask.description}"`,
      currentTask: {
        id: currentTask.id,
        description: currentTask.description,
        status: currentTask.status,
        createdAt: currentTask.createdAt,
      },
    };
  }

  private async listTasks(): Promise<any> {
    const tasks = await this.todoService.loadTasks();
    
    if (tasks.length === 0) {
      return {
        action: 'list',
        message: '暂无任务',
        tasks: [],
        suggestion: '使用 create_list 创建新的任务列表',
      };
    }

    const completedCount = tasks.filter(t => t.status === 'completed').length;
    
    return {
      action: 'list',
      message: `任务列表 (${completedCount}/${tasks.length} 已完成)`,
      tasks: tasks.map(t => ({
        id: t.id,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      progress: `${completedCount}/${tasks.length}`,
    };
  }

  private async endMaintenanceMode(): Promise<any> {
    const tasks = await this.todoService.loadTasks();
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    
    await this.todoService.clearTasks();
    
    return {
      action: 'end_maintenance',
      message: '任务维护模式已结束，任务列表已清除',
      finalStats: {
        totalTasks: tasks.length,
        completedTasks: completedCount,
        completionRate: tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0,
      },
      maintenanceMode: false,
    };
  }
} 
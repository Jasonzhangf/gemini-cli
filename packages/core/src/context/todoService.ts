/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { TaskItem } from './contextManager.js';

const TODO_CONTEXT_FILE = path.join(homedir(), '.gemini', 'todo_context.json');

/**
 * TODO服务，负责任务数据的持久化存储
 */
export class TodoService {
  /**
   * 保存任务列表到文件
   */
  async saveTasks(tasks: TaskItem[]): Promise<void> {
    try {
      await fs.mkdir(path.dirname(TODO_CONTEXT_FILE), { recursive: true });
      await fs.writeFile(TODO_CONTEXT_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (error) {
      console.error('[TodoService] Failed to save tasks:', error);
      throw error;
    }
  }

  /**
   * 从文件加载任务列表
   */
  async loadTasks(): Promise<TaskItem[]> {
    try {
      const content = await fs.readFile(TODO_CONTEXT_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 文件不存在或解析失败，返回空数组
      return [];
    }
  }

  /**
   * 清除任务列表文件
   */
  async clearTasks(): Promise<void> {
    try {
      await fs.unlink(TODO_CONTEXT_FILE);
    } catch (error) {
      // 文件不存在，忽略错误
    }
  }

  /**
   * 检查是否存在任务文件
   */
  async hasTasks(): Promise<boolean> {
    try {
      await fs.access(TODO_CONTEXT_FILE);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成唯一的任务ID
   */
  generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 验证任务描述长度（不超过20个字）
   */
  validateTaskDescription(description: string): boolean {
    return description.length <= 20 && description.trim().length > 0;
  }

  /**
   * 创建新任务
   */
  createTask(description: string): TaskItem {
    if (!this.validateTaskDescription(description)) {
      throw new Error('任务描述必须在1-20个字符之间');
    }

    return {
      id: this.generateTaskId(),
      description: description.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { Content } from '@google/genai';
import { TodoService } from './todoService.js';

export interface ContextData {
  historyRecords: Content[];
  staticContext: string[];
  dynamicContext: string[];
  taskList: TaskListContext | null;
}

export interface TaskListContext {
  tasks: TaskItem[];
  currentTaskIndex: number;
  createdAt: string;
  isMaintenanceMode: boolean;
}

export interface TaskItem {
  id: string;
  description: string; // 不超过20个字
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
}

/**
 * 统一管理所有上下文数据：历史记录、静态上下文、动态上下文和任务列表
 */
export class ContextManager {
  private context: ContextData;
  private todoService: TodoService;
  private projectRoot: string;
  private debugMode: boolean;

  constructor(projectRoot: string, debugMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.debugMode = debugMode;
    this.todoService = new TodoService();
    this.context = {
      historyRecords: [],
      staticContext: [],
      dynamicContext: [],
      taskList: null,
    };
  }

  /**
   * 初始化上下文管理器，加载静态上下文
   */
  async initialize(): Promise<void> {
    await this.loadStaticContext();
    if (this.debugMode) {
      console.log('[ContextManager] Initialized with static context items:', this.context.staticContext.length);
    }
  }

  /**
   * 加载静态上下文从 ./gemini/rules 和 ~/.gemini/rules
   */
  private async loadStaticContext(): Promise<void> {
    const staticContextPaths = [
      path.join(this.projectRoot, '.gemini', 'rules'),
      path.join(homedir(), '.gemini', 'rules'),
    ];

    this.context.staticContext = [];

    for (const rulesDir of staticContextPaths) {
      try {
        const files = await fs.readdir(rulesDir);
        const mdFiles = files.filter(file => file.endsWith('.md'));
        
        for (const file of mdFiles) {
          const filePath = path.join(rulesDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            this.context.staticContext.push(`--- ${file} ---\n${content}`);
            if (this.debugMode) {
              console.log(`[ContextManager] Loaded static context: ${filePath}`);
            }
          } catch (error) {
            if (this.debugMode) {
              console.warn(`[ContextManager] Failed to read ${filePath}:`, error);
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist, skip silently
        if (this.debugMode) {
          console.log(`[ContextManager] Rules directory not found: ${rulesDir}`);
        }
      }
    }
  }

  /**
   * 获取完整的上下文数据
   */
  getContext(): ContextData {
    return { ...this.context };
  }

  /**
   * 添加历史记录
   */
  addHistoryRecord(content: Content): void {
    this.context.historyRecords.push(content);
  }

  /**
   * 设置历史记录
   */
  setHistoryRecords(records: Content[]): void {
    this.context.historyRecords = records;
  }

  /**
   * 获取历史记录
   */
  getHistoryRecords(): Content[] {
    return this.context.historyRecords;
  }

  /**
   * 添加动态上下文
   */
  addDynamicContext(context: string): void {
    this.context.dynamicContext.push(context);
  }

  /**
   * 清除动态上下文
   */
  clearDynamicContext(): void {
    this.context.dynamicContext = [];
  }

  /**
   * 创建新的任务列表并进入任务维护模式
   */
  async createTaskList(tasks: TaskItem[]): Promise<void> {
    const taskList: TaskListContext = {
      tasks,
      currentTaskIndex: 0,
      createdAt: new Date().toISOString(),
      isMaintenanceMode: true,
    };

    this.context.taskList = taskList;
    await this.todoService.saveTasks(tasks);
    
    if (this.debugMode) {
      console.log(`[ContextManager] Created task list with ${tasks.length} tasks`);
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: TaskItem['status']): Promise<void> {
    if (!this.context.taskList) return;

    const task = this.context.taskList.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (status === 'completed') {
        task.completedAt = new Date().toISOString();
      }
      await this.todoService.saveTasks(this.context.taskList.tasks);
      
      if (this.debugMode) {
        console.log(`[ContextManager] Updated task ${taskId} to ${status}`);
      }
    }
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): TaskItem | null {
    if (!this.context.taskList || this.context.taskList.tasks.length === 0) {
      return null;
    }

    // 查找第一个未完成的任务
    const pendingTask = this.context.taskList.tasks.find(t => t.status !== 'completed');
    return pendingTask || null;
  }

  /**
   * 检查是否在任务维护模式
   */
  isInMaintenanceMode(): boolean {
    return this.context.taskList?.isMaintenanceMode || false;
  }

  /**
   * 检查任务列表是否全部完成
   */
  isTaskListCompleted(): boolean {
    if (!this.context.taskList) return false;
    return this.context.taskList.tasks.every(t => t.status === 'completed');
  }

  /**
   * 结束任务维护模式并清除任务列表
   */
  async endMaintenanceMode(): Promise<void> {
    if (this.context.taskList) {
      await this.todoService.clearTasks();
      this.context.taskList = null;
      
      if (this.debugMode) {
        console.log('[ContextManager] Ended maintenance mode and cleared task list');
      }
    }
  }

  /**
   * 生成用于模型的完整上下文字符串
   */
  generateModelContext(): string {
    const sections: string[] = [];

    // 静态上下文 - 清晰标记来源
    if (this.context.staticContext.length > 0) {
      let staticSection = `# 📋 静态规则上下文 (Static Context)\n`;
      staticSection += `*来源: 项目和全局规则文件*\n\n`;
      staticSection += this.context.staticContext.join('\n\n');
      sections.push(staticSection);
    }

    // 动态上下文 - 清晰标记来源
    if (this.context.dynamicContext.length > 0) {
      let dynamicSection = `# 🔄 动态上下文 (Dynamic Context)\n`;
      dynamicSection += `*来源: 运行时动态添加的上下文信息*\n\n`;
      dynamicSection += this.context.dynamicContext.join('\n\n');
      sections.push(dynamicSection);
    }

    // 任务列表上下文 - 清晰标记来源
    if (this.context.taskList && this.context.taskList.isMaintenanceMode) {
      const currentTask = this.getCurrentTask();
      const completedCount = this.context.taskList.tasks.filter(t => t.status === 'completed').length;
      const totalCount = this.context.taskList.tasks.length;
      
      let taskContext = `# 🎯 任务管理上下文 (Task Management)\n`;
      taskContext += `*来源: TODO工具创建的任务列表，当前处于任务维护模式*\n\n`;
      taskContext += `## 任务进度: ${completedCount}/${totalCount} 已完成\n\n`;
      
      if (currentTask) {
        taskContext += `## 当前任务: ${currentTask.description}\n`;
        taskContext += `状态: ${currentTask.status}\n`;
        taskContext += `ID: ${currentTask.id}\n\n`;
      } else {
        taskContext += `## 所有任务已完成！\n\n`;
      }
      
      taskContext += `## 所有任务列表:\n`;
      this.context.taskList.tasks.forEach((task, index) => {
        const statusIcon = task.status === 'completed' ? '✅' : 
                          task.status === 'in_progress' ? '🔄' : '⏳';
        taskContext += `${index + 1}. ${statusIcon} ${task.description} (${task.status})\n`;
      });
      
      taskContext += `\n## 重要提示:\n`;
      if (currentTask) {
        taskContext += `- 当前专注于: "${currentTask.description}"\n`;
        taskContext += `- 完成后请使用 todo 工具更新任务状态\n`;
        taskContext += `- 使用 todo 工具的 update 操作: {"action": "update", "taskId": "${currentTask.id}", "status": "completed"}\n`;
      } else {
        taskContext += `- 所有任务已完成，可以结束任务维护模式\n`;
        taskContext += `- 使用 todo 工具结束维护模式: {"action": "end_maintenance"}\n`;
      }

      sections.push(taskContext);
    }

    return sections.join('\n\n---\n\n');
  }
}
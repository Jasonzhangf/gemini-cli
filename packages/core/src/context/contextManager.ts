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
import { MemoryStorageService, MemoryType } from './memoryStorageService.js';
import { StandardContextIntegrator } from './standardContextIntegrator.js';

export interface ContextData {
  historyRecords: Content[];
  staticContext: {
    globalRules: string[];
    projectRules: string[];
    globalMemories: string[];
    projectMemories: string[];
  };
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
  modifiedAt?: Array<{
    timestamp: string;
    oldDescription: string;
    newDescription: string;
    reason: string;
  }>;
}

/**
 * 统一管理所有上下文数据：历史记录、静态上下文、动态上下文和任务列表
 */
export class ContextManager {
  private context: ContextData;
  private todoService: TodoService;
  private memoryService: MemoryStorageService;
  private standardContextIntegrator: StandardContextIntegrator | null = null;
  private projectRoot: string;
  private debugMode: boolean;

  constructor(projectRoot: string, debugMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.debugMode = debugMode;
    this.todoService = new TodoService(projectRoot);
    this.memoryService = new MemoryStorageService(projectRoot, debugMode);
    this.context = {
      historyRecords: [],
      staticContext: {
        globalRules: [],
        projectRules: [],
        globalMemories: [],
        projectMemories: []
      },
      dynamicContext: [],
      taskList: null,
    };
  }

  /**
   * 初始化上下文管理器，加载静态上下文
   */
  async initialize(): Promise<void> {
    await this.loadStaticContext();
    
    // Initialize StandardContextIntegrator for enhanced debug logging
    // Note: We need to pass a Config instance, but we don't have access to it here
    // This will be set by the Config class after initialization
    
    if (this.debugMode) {
      const totalGlobalRules = this.context.staticContext.globalRules.length;
      const totalProjectRules = this.context.staticContext.projectRules.length;
      const totalGlobalMemories = this.context.staticContext.globalMemories.length;
      const totalProjectMemories = this.context.staticContext.projectMemories.length;
      console.log(`[ContextManager] Initialized with ${totalGlobalRules} global rules, ${totalProjectRules} project rules, ${totalGlobalMemories} global memories, ${totalProjectMemories} project memories`);
    }
  }

  /**
   * Set StandardContextIntegrator (called by Config after initialization)
   */
  setStandardContextIntegrator(integrator: StandardContextIntegrator): void {
    this.standardContextIntegrator = integrator;
  }

  /**
   * Get StandardContextIntegrator for debug logging
   */
  getStandardContextIntegrator(): StandardContextIntegrator | null {
    return this.standardContextIntegrator;
  }

  /**
   * 加载静态上下文：全局规则、项目规则、全局记忆和项目记忆
   * 1. 全局规则：~/.gemini/globalrules/ - 每轮都会读取，每个项目都会读取
   * 2. 项目规则：./gemini/localrules/ - 当前项目特定规则
   * 3. 全局记忆：~/.gemini/memories/Memory.md - 全局知识和经验
   * 4. 项目记忆：./gemini/memories/Memory.md - 项目特定知识和经验
   */
  private async loadStaticContext(): Promise<void> {
    // 清空现有静态上下文
    this.context.staticContext.globalRules = [];
    this.context.staticContext.projectRules = [];
    this.context.staticContext.globalMemories = [];
    this.context.staticContext.projectMemories = [];

    // 1. 加载全局规则
    await this.loadGlobalRules();
    
    // 2. 加载项目规则
    await this.loadProjectRules();
    
    // 3. 加载全局记忆
    await this.loadGlobalMemories();
    
    // 4. 加载项目记忆
    await this.loadProjectMemories();
  }

  /**
   * 加载全局规则从 ~/.gemini/globalrules/
   */
  private async loadGlobalRules(): Promise<void> {
    const globalRulesDir = path.join(homedir(), '.gemini', 'globalrules');
    
    try {
      const files = await fs.readdir(globalRulesDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      for (const file of mdFiles) {
        const filePath = path.join(globalRulesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          this.context.staticContext.globalRules.push(`--- 全局规则: ${file} ---\n${content}`);
          if (this.debugMode) {
            console.log(`[ContextManager] Loaded global rule: ${filePath}`);
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn(`[ContextManager] Failed to read global rule ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // 全局规则目录不存在，跳过
      if (this.debugMode) {
        console.log(`[ContextManager] Global rules directory not found: ${globalRulesDir}`);
      }
    }
  }

  /**
   * 加载项目规则从 ./gemini/localrules/
   */
  private async loadProjectRules(): Promise<void> {
    const projectRulesDir = path.join(this.projectRoot, '.gemini', 'localrules');
    
    try {
      const files = await fs.readdir(projectRulesDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      for (const file of mdFiles) {
        const filePath = path.join(projectRulesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          this.context.staticContext.projectRules.push(`--- 项目规则: ${file} ---\n${content}`);
          if (this.debugMode) {
            console.log(`[ContextManager] Loaded project rule: ${filePath}`);
          }
        } catch (error) {
          if (this.debugMode) {
            console.warn(`[ContextManager] Failed to read project rule ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // 项目规则目录不存在，跳过
      if (this.debugMode) {
        console.log(`[ContextManager] Project rules directory not found: ${projectRulesDir}`);
      }
    }
  }

  /**
   * 加载全局记忆从 ~/.gemini/memories/Memory.md
   */
  private async loadGlobalMemories(): Promise<void> {
    try {
      const globalMemories = await this.memoryService.getMemories(MemoryType.GLOBAL);
      if (globalMemories) {
        this.context.staticContext.globalMemories.push(`--- 全局记忆: Memory.md ---\n${globalMemories}`);
        if (this.debugMode) {
          console.log(`[ContextManager] Loaded global memories`);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.log(`[ContextManager] No global memories found or failed to load`);
      }
    }
  }

  /**
   * 加载项目记忆从 ./gemini/memories/Memory.md
   */
  private async loadProjectMemories(): Promise<void> {
    try {
      const projectMemories = await this.memoryService.getMemories(MemoryType.PROJECT);
      if (projectMemories) {
        this.context.staticContext.projectMemories.push(`--- 项目记忆: Memory.md ---\n${projectMemories}`);
        if (this.debugMode) {
          console.log(`[ContextManager] Loaded project memories`);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.log(`[ContextManager] No project memories found or failed to load`);
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
   * 刷新记忆内容（在记忆保存后调用）
   */
  async refreshMemories(): Promise<void> {
    // 清除现有记忆
    this.context.staticContext.globalMemories = [];
    this.context.staticContext.projectMemories = [];
    
    // 重新加载记忆
    await this.loadGlobalMemories();
    await this.loadProjectMemories();
    
    if (this.debugMode) {
      console.log('[ContextManager] Refreshed memories in context');
    }
  }

  /**
   * 生成用于模型的完整上下文字符串
   */
  generateModelContext(): string {
    const sections: string[] = [];

    // 静态上下文 - 分离全局和项目规则、记忆
    const hasGlobalRules = this.context.staticContext.globalRules.length > 0;
    const hasProjectRules = this.context.staticContext.projectRules.length > 0;
    const hasGlobalMemories = this.context.staticContext.globalMemories.length > 0;
    const hasProjectMemories = this.context.staticContext.projectMemories.length > 0;
    
    if (hasGlobalRules || hasProjectRules || hasGlobalMemories || hasProjectMemories) {
      let staticSection = `# 📋 静态上下文 (Static Context)\n`;
      staticSection += `*来源: 全局规则、项目规则、全局记忆和项目记忆*\n\n`;
      
      // 全局规则
      if (hasGlobalRules) {
        staticSection += `## 🌍 全局规则 (${this.context.staticContext.globalRules.length}个)\n`;
        staticSection += `*适用于所有项目的通用规则*\n\n`;
        staticSection += this.context.staticContext.globalRules.join('\n\n');
        staticSection += '\n\n';
      }
      
      // 项目规则
      if (hasProjectRules) {
        staticSection += `## 🏠 项目规则 (${this.context.staticContext.projectRules.length}个)\n`;
        staticSection += `*当前项目特定规则*\n\n`;
        staticSection += this.context.staticContext.projectRules.join('\n\n');
        staticSection += '\n\n';
      }
      
      // 全局记忆
      if (hasGlobalMemories) {
        staticSection += `## 🧠 全局记忆 (${this.context.staticContext.globalMemories.length}个)\n`;
        staticSection += `*适用于所有项目的知识和经验*\n\n`;
        staticSection += this.context.staticContext.globalMemories.join('\n\n');
        staticSection += '\n\n';
      }
      
      // 项目记忆
      if (hasProjectMemories) {
        staticSection += `## 💡 项目记忆 (${this.context.staticContext.projectMemories.length}个)\n`;
        staticSection += `*当前项目特定的知识和经验*\n\n`;
        staticSection += this.context.staticContext.projectMemories.join('\n\n');
      }
      
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
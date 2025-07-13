/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { TaskItem } from './contextManager.js';

/**
 * 将绝对路径转换为目录名（参考Claude的命名方式）
 * 例如: /Users/fanzhang/Documents/github/project -> -Users-fanzhang-Documents-github-project
 */
const pathToDirectoryName = (absolutePath: string): string => {
  return absolutePath.replace(/\//g, '-');
};

/**
 * 获取项目特定的任务存储目录
 */
const getProjectTaskDir = (cwd: string = process.cwd()): string => {
  const absolutePath = path.resolve(cwd);
  const projectDirName = pathToDirectoryName(absolutePath);
  return path.join(homedir(), '.gemini', 'todos', projectDirName);
};

/**
 * 获取项目上下文存储目录
 */
const getProjectContextDir = (cwd: string = process.cwd()): string => {
  const absolutePath = path.resolve(cwd);
  const projectDirName = pathToDirectoryName(absolutePath);
  return path.join(homedir(), '.gemini', 'projects', projectDirName);
};

const getTodoContextFile = (cwd: string = process.cwd()) => 
  path.join(getProjectTaskDir(cwd), 'todo_context.json');

const getCurrentTaskFile = (cwd: string = process.cwd()) => 
  path.join(getProjectTaskDir(cwd), 'current_task.txt');

const getProjectMetaFile = (cwd: string = process.cwd()) => 
  path.join(getProjectContextDir(cwd), 'project_meta.json');

const getProjectContextFile = (cwd: string = process.cwd()) => 
  path.join(getProjectContextDir(cwd), 'context.json');

/**
 * TODO服务，负责任务数据的持久化存储
 * 每个项目目录都有独立的任务存储空间
 */
export class TodoService {
  private readonly projectDir: string;

  constructor(projectDir: string = process.cwd()) {
    this.projectDir = projectDir;
  }
  /**
   * 保存任务列表到文件
   */
  async saveTasks(tasks: TaskItem[]): Promise<void> {
    try {
      const todoFile = getTodoContextFile(this.projectDir);
      await fs.mkdir(path.dirname(todoFile), { recursive: true });
      await fs.writeFile(todoFile, JSON.stringify(tasks, null, 2), 'utf-8');
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
      const todoFile = getTodoContextFile(this.projectDir);
      const content = await fs.readFile(todoFile, 'utf-8');
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
      const todoFile = getTodoContextFile(this.projectDir);
      await fs.unlink(todoFile);
    } catch (error) {
      // 文件不存在，忽略错误
    }
  }

  /**
   * 检查是否存在任务文件
   */
  async hasTasks(): Promise<boolean> {
    try {
      const todoFile = getTodoContextFile(this.projectDir);
      await fs.access(todoFile);
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

  /**
   * 设置当前任务ID到单独的文件
   */
  async setCurrentTask(taskId: string): Promise<void> {
    try {
      const currentTaskFile = getCurrentTaskFile(this.projectDir);
      await fs.mkdir(path.dirname(currentTaskFile), { recursive: true });
      await fs.writeFile(currentTaskFile, taskId, 'utf-8');
    } catch (error) {
      console.error('[TodoService] Failed to set current task:', error);
      throw error;
    }
  }

  /**
   * 获取当前任务ID
   */
  async getCurrentTaskId(): Promise<string | null> {
    try {
      const currentTaskFile = getCurrentTaskFile(this.projectDir);
      const taskId = await fs.readFile(currentTaskFile, 'utf-8');
      return taskId.trim();
    } catch {
      return null;
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<void> {
    const tasks = await this.loadTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`未找到ID为 ${taskId} 的任务`);
    }

    task.status = status;
    if (status === 'completed') {
      task.completedAt = new Date().toISOString();
    }

    await this.saveTasks(tasks);
  }

  /**
   * 获取当前任务详情
   */
  async getCurrentTask(): Promise<TaskItem | null> {
    const currentTaskId = await this.getCurrentTaskId();
    if (!currentTaskId) {
      return null;
    }

    const tasks = await this.loadTasks();
    return tasks.find(t => t.id === currentTaskId) || null;
  }

  /**
   * 保存项目元数据信息到projects目录
   */
  async saveProjectMeta(): Promise<void> {
    try {
      const metaFile = getProjectMetaFile(this.projectDir);
      const meta = {
        projectPath: path.resolve(this.projectDir),
        directoryName: pathToDirectoryName(path.resolve(this.projectDir)),
        createdAt: new Date().toISOString(),
        lastAccessAt: new Date().toISOString(),
        taskStorageDir: getProjectTaskDir(this.projectDir),
        contextStorageDir: getProjectContextDir(this.projectDir),
      };
      await fs.mkdir(path.dirname(metaFile), { recursive: true });
      await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (error) {
      console.error('[TodoService] Failed to save project meta:', error);
    }
  }

  /**
   * 保存项目上下文缓存
   */
  async saveProjectContext(context: any): Promise<void> {
    try {
      const contextFile = getProjectContextFile(this.projectDir);
      const contextData = {
        ...context,
        cachedAt: new Date().toISOString(),
        projectPath: path.resolve(this.projectDir),
      };
      await fs.mkdir(path.dirname(contextFile), { recursive: true });
      await fs.writeFile(contextFile, JSON.stringify(contextData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[TodoService] Failed to save project context:', error);
    }
  }

  /**
   * 加载项目上下文缓存
   */
  async loadProjectContext(): Promise<any | null> {
    try {
      const contextFile = getProjectContextFile(this.projectDir);
      const content = await fs.readFile(contextFile, 'utf-8');
      const context = JSON.parse(content);
      
      // 检查缓存是否过期（24小时）
      const cacheAge = Date.now() - new Date(context.cachedAt).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24小时
      
      if (cacheAge > maxAge) {
        return null; // 缓存过期
      }
      
      return context;
    } catch (error) {
      return null; // 文件不存在或解析失败
    }
  }

  /**
   * 获取项目任务存储目录路径（用于调试）
   */
  getProjectTaskDir(): string {
    return getProjectTaskDir(this.projectDir);
  }

  /**
   * 获取项目上下文存储目录路径（用于调试）
   */
  getProjectContextDir(): string {
    return getProjectContextDir(this.projectDir);
  }

  /**
   * 获取项目可读的目录名
   */
  getProjectDirectoryName(): string {
    return pathToDirectoryName(path.resolve(this.projectDir));
  }

  /**
   * 列出所有项目（用于管理）
   */
  static async listAllProjects(): Promise<Array<{
    directoryName: string;
    projectPath: string;
    lastAccess: string;
    hasActiveTasks: boolean;
  }>> {
    const projects: Array<{
      directoryName: string;
      projectPath: string;
      lastAccess: string;
      hasActiveTasks: boolean;
    }> = [];

    try {
      const projectsDir = path.join(homedir(), '.gemini', 'projects');
      const todosDir = path.join(homedir(), '.gemini', 'todos');
      
      const projectDirs = await fs.readdir(projectsDir);
      
      for (const dirName of projectDirs) {
        try {
          const metaFile = path.join(projectsDir, dirName, 'project_meta.json');
          const metaContent = await fs.readFile(metaFile, 'utf-8');
          const meta = JSON.parse(metaContent);
          
          // 检查是否有活跃任务
          const todoFile = path.join(todosDir, dirName, 'todo_context.json');
          let hasActiveTasks = false;
          try {
            const todoContent = await fs.readFile(todoFile, 'utf-8');
            const tasks = JSON.parse(todoContent);
            hasActiveTasks = Array.isArray(tasks) && tasks.some((t: any) => t.status !== 'completed');
          } catch {
            // 没有任务文件或解析失败
          }

          projects.push({
            directoryName: dirName,
            projectPath: meta.projectPath,
            lastAccess: meta.lastAccessAt,
            hasActiveTasks
          });
        } catch {
          // 跳过无效的项目目录
        }
      }
    } catch {
      // projects目录不存在
    }

    return projects.sort((a, b) => new Date(b.lastAccess).getTime() - new Date(a.lastAccess).getTime());
  }
}
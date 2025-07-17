/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Task result interface
 */
export interface TaskResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Task creation options
 */
export interface TaskCreationOptions {
  templateId?: string;
  parentTaskId?: string;
  metadata?: Record<string, any>;
}

/**
 * TaskManager class
 * Responsible for managing tasks and maintenance mode
 */
export class TaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private currentTaskId: string | null = null;
  private isInMaintenanceMode: boolean = false;
  private projectId: string;

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
  }

  /**
   * Check if system is in maintenance mode
   */
  public isMaintenanceMode(): boolean {
    return this.isInMaintenanceMode;
  }

  /**
   * Enter maintenance mode
   */
  public enterMaintenanceMode(): void {
    if (!this.isInMaintenanceMode) {
      this.isInMaintenanceMode = true;
      this.emit('maintenanceModeEntered', { projectId: this.projectId });
    }
  }

  /**
   * Exit maintenance mode
   */
  public exitMaintenanceMode(): void {
    if (this.isInMaintenanceMode) {
      this.isInMaintenanceMode = false;
      this.emit('maintenanceModeExited', { projectId: this.projectId });
    }
  }

  /**
   * Create tasks from input
   * @param input Task descriptions or template ID
   * @param options Task creation options
   * @returns Created tasks
   */
  public async createTasks(
    input: string[] | string,
    options: TaskCreationOptions = {}
  ): Promise<Task[]> {
    // Validate input
    if (this.isInMaintenanceMode) {
      throw new Error("Cannot create new tasks in maintenance mode. Use getCurrentTask() to continue with existing tasks.");
    }

    let taskDescriptions: string[] = [];
    
    // Handle different input types
    if (Array.isArray(input)) {
      taskDescriptions = input;
    } else if (typeof input === 'string') {
      // Check if it's a template ID
      if (input.startsWith('template:')) {
        return this.createTasksFromTemplate(input.substring(9), options);
      }
      
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          taskDescriptions = parsed.map(item => 
            typeof item === 'string' ? item : item.description || String(item)
          );
        } else {
          throw new Error("Input must be an array of task descriptions or a template ID");
        }
      } catch (e) {
        // Not valid JSON, treat as single task
        taskDescriptions = [input];
      }
    }

    // Validate we have tasks to create
    if (!taskDescriptions || taskDescriptions.length === 0) {
      throw new Error("Must provide task list or template ID");
    }

    // Create tasks
    const createdTasks: Task[] = [];
    for (const description of taskDescriptions) {
      const task = await this.createTask(description, options);
      createdTasks.push(task);
    }

    // If tasks were created successfully, enter maintenance mode
    if (createdTasks.length > 0) {
      this.enterMaintenanceMode();
      
      // Set the first task as current if no current task
      if (!this.currentTaskId) {
        this.currentTaskId = createdTasks[0].id;
        this.emit('currentTaskSet', { taskId: this.currentTaskId });
      }
    }

    return createdTasks;
  }

  /**
   * Create a single task
   * @param description Task description
   * @param options Task creation options
   * @returns Created task
   */
  private async createTask(
    description: string,
    options: TaskCreationOptions = {}
  ): Promise<Task> {
    const now = new Date();
    const taskId = `task_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const task: Task = {
      id: taskId,
      description,
      status: TaskStatus.PENDING,
      dependencies: options.parentTaskId ? [options.parentTaskId] : [],
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata || {},
    };

    this.tasks.set(taskId, task);
    this.emit('taskCreated', { task });
    
    return task;
  }

  /**
   * Create tasks from a template
   * @param templateId Template ID
   * @param options Task creation options
   * @returns Created tasks
   */
  private async createTasksFromTemplate(
    templateId: string,
    options: TaskCreationOptions = {}
  ): Promise<Task[]> {
    // This would typically load templates from storage
    // For now, we'll use some hardcoded templates
    const templates: Record<string, string[]> = {
      'basic': [
        'Research requirements',
        'Design solution',
        'Implement code',
        'Write tests',
        'Document changes',
      ],
      'feature': [
        'Analyze requirements',
        'Create design document',
        'Implement core functionality',
        'Add unit tests',
        'Update documentation',
        'Create PR',
      ],
      'bugfix': [
        'Reproduce issue',
        'Identify root cause',
        'Implement fix',
        'Add regression test',
        'Verify fix',
      ],
    };

    const templateTasks = templates[templateId];
    if (!templateTasks) {
      throw new Error(`Template "${templateId}" not found`);
    }

    return this.createTasks(templateTasks, options);
  }

  /**
   * Get current task
   * @returns Current task or null if no current task
   */
  public async getCurrentTask(): Promise<Task | null> {
    if (!this.currentTaskId) {
      return null;
    }

    return this.tasks.get(this.currentTaskId) || null;
  }

  /**
   * Get all tasks
   * @returns Array of all tasks
   */
  public async getAllTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  /**
   * Get pending tasks
   * @returns Array of pending tasks
   */
  public async getPendingTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.status === TaskStatus.PENDING);
  }

  /**
   * Update task status
   * @param taskId Task ID
   * @param status New status
   * @returns Updated task
   */
  public async updateTaskStatus(
    taskId: string,
    status: TaskStatus
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    const now = new Date();
    task.status = status;
    task.updatedAt = now;

    if (status === TaskStatus.COMPLETED) {
      task.completedAt = now;
    } else if (status === TaskStatus.FAILED) {
      task.failedAt = now;
    }

    this.tasks.set(taskId, task);
    this.emit('taskUpdated', { task });

    return task;
  }

  /**
   * Finish current task
   * @param result Task result
   * @returns Next task or null if no more tasks
   */
  public async finishCurrentTask(result: TaskResult): Promise<Task | null> {
    if (!this.currentTaskId) {
      throw new Error("No current task to finish");
    }

    const currentTask = this.tasks.get(this.currentTaskId);
    if (!currentTask) {
      throw new Error(`Current task "${this.currentTaskId}" not found`);
    }

    // Update task status based on result
    await this.updateTaskStatus(
      this.currentTaskId,
      result.success ? TaskStatus.COMPLETED : TaskStatus.FAILED
    );

    // Find next available task
    const nextTask = await this.findNextAvailableTask();
    
    // Update current task
    this.currentTaskId = nextTask?.id || null;
    
    if (this.currentTaskId) {
      this.emit('currentTaskSet', { taskId: this.currentTaskId });
    } else {
      // If no more tasks, exit maintenance mode
      this.exitMaintenanceMode();
      this.emit('allTasksCompleted');
    }

    return nextTask;
  }

  /**
   * Find next available task
   * @returns Next available task or null if no more tasks
   */
  private async findNextAvailableTask(): Promise<Task | null> {
    const pendingTasks = await this.getPendingTasks();
    
    // Find tasks with no dependencies or all dependencies completed
    for (const task of pendingTasks) {
      if (this.canTaskStart(task)) {
        return task;
      }
    }

    return null;
  }

  /**
   * Check if a task can start
   * @param task Task to check
   * @returns True if task can start, false otherwise
   */
  private canTaskStart(task: Task): boolean {
    // If task is not pending, it can't start
    if (task.status !== TaskStatus.PENDING) {
      return false;
    }

    // If task has no dependencies, it can start
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    // Check if all dependencies are completed
    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId);
      return depTask && depTask.status === TaskStatus.COMPLETED;
    });
  }

  /**
   * Set current task
   * @param taskId Task ID
   * @returns Set task
   */
  public async setCurrentTask(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    this.currentTaskId = taskId;
    this.emit('currentTaskSet', { taskId });

    return task;
  }

  /**
   * Delete task
   * @param taskId Task ID
   * @returns True if task was deleted, false otherwise
   */
  public async deleteTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove task
    this.tasks.delete(taskId);
    
    // If current task was deleted, find next task
    if (this.currentTaskId === taskId) {
      const nextTask = await this.findNextAvailableTask();
      this.currentTaskId = nextTask?.id || null;
      
      if (this.currentTaskId) {
        this.emit('currentTaskSet', { taskId: this.currentTaskId });
      }
    }

    this.emit('taskDeleted', { taskId });
    return true;
  }

  /**
   * Clear all tasks
   */
  public async clearAllTasks(): Promise<void> {
    this.tasks.clear();
    this.currentTaskId = null;
    this.exitMaintenanceMode();
    this.emit('tasksCleared');
  }
}
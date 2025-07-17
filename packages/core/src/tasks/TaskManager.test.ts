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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskManager, TaskStatus } from './TaskManager';

describe('TaskManager', () => {
  let taskManager: TaskManager;

  beforeEach(() => {
    taskManager = new TaskManager('test-project');
  });

  describe('Task Creation', () => {
    it('should create tasks from string array', async () => {
      const tasks = await taskManager.createTasks([
        'Task 1',
        'Task 2',
        'Task 3',
      ]);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].description).toBe('Task 1');
      expect(tasks[1].description).toBe('Task 2');
      expect(tasks[2].description).toBe('Task 3');
      
      // Should enter maintenance mode after creating tasks
      expect(taskManager.isMaintenanceMode()).toBe(true);
    });

    it('should create tasks from JSON string', async () => {
      const tasks = await taskManager.createTasks(JSON.stringify([
        'Task 1',
        'Task 2',
      ]));

      expect(tasks).toHaveLength(2);
      expect(tasks[0].description).toBe('Task 1');
      expect(tasks[1].description).toBe('Task 2');
    });

    it('should create a single task from string', async () => {
      const tasks = await taskManager.createTasks('Single task');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe('Single task');
    });

    it('should create tasks from template', async () => {
      const tasks = await taskManager.createTasks('template:basic');

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].status).toBe(TaskStatus.PENDING);
    });

    it('should throw error for empty task list', async () => {
      await expect(taskManager.createTasks([])).rejects.toThrow(
        'Must provide task list or template ID'
      );
    });

    it('should throw error when creating tasks in maintenance mode', async () => {
      // Create initial tasks to enter maintenance mode
      await taskManager.createTasks(['Task 1']);
      
      // Try to create more tasks
      await expect(taskManager.createTasks(['Task 2'])).rejects.toThrow(
        'Cannot create new tasks in maintenance mode'
      );
    });

    it('should set first task as current task', async () => {
      const tasks = await taskManager.createTasks(['Task 1', 'Task 2']);
      const currentTask = await taskManager.getCurrentTask();
      
      expect(currentTask).not.toBeNull();
      expect(currentTask?.id).toBe(tasks[0].id);
    });

    it('should emit taskCreated event', async () => {
      const eventHandler = vi.fn();
      taskManager.on('taskCreated', eventHandler);

      await taskManager.createTasks(['Task 1']);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0].task.description).toBe('Task 1');
    });

    it('should emit maintenanceModeEntered event', async () => {
      const eventHandler = vi.fn();
      taskManager.on('maintenanceModeEntered', eventHandler);

      await taskManager.createTasks(['Task 1']);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0].projectId).toBe('test-project');
    });
  });

  describe('Task Management', () => {
    beforeEach(async () => {
      await taskManager.createTasks(['Task 1', 'Task 2', 'Task 3']);
    });

    it('should get current task', async () => {
      const currentTask = await taskManager.getCurrentTask();
      
      expect(currentTask).not.toBeNull();
      expect(currentTask?.description).toBe('Task 1');
    });

    it('should get all tasks', async () => {
      const tasks = await taskManager.getAllTasks();
      
      expect(tasks).toHaveLength(3);
    });

    it('should get pending tasks', async () => {
      const pendingTasks = await taskManager.getPendingTasks();
      
      expect(pendingTasks).toHaveLength(3);
      expect(pendingTasks.every(task => task.status === TaskStatus.PENDING)).toBe(true);
    });

    it('should update task status', async () => {
      const tasks = await taskManager.getAllTasks();
      const taskId = tasks[0].id;
      
      const updatedTask = await taskManager.updateTaskStatus(taskId, TaskStatus.IN_PROGRESS);
      
      expect(updatedTask.status).toBe(TaskStatus.IN_PROGRESS);
      expect(updatedTask.updatedAt).not.toBe(updatedTask.createdAt);
    });

    it('should finish current task and move to next', async () => {
      const currentTask = await taskManager.getCurrentTask();
      const nextTask = await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      expect(nextTask).not.toBeNull();
      expect(nextTask?.id).not.toBe(currentTask?.id);
      
      // Original task should be completed
      const tasks = await taskManager.getAllTasks();
      const originalTask = tasks.find(t => t.id === currentTask?.id);
      expect(originalTask?.status).toBe(TaskStatus.COMPLETED);
      
      // New task should be current
      const newCurrentTask = await taskManager.getCurrentTask();
      expect(newCurrentTask?.id).toBe(nextTask?.id);
    });

    it('should exit maintenance mode when all tasks are completed', async () => {
      // Complete all tasks
      const task1 = await taskManager.getCurrentTask();
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      const task2 = await taskManager.getCurrentTask();
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      const task3 = await taskManager.getCurrentTask();
      const nextTask = await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      // No more tasks
      expect(nextTask).toBeNull();
      
      // Should exit maintenance mode
      expect(taskManager.isMaintenanceMode()).toBe(false);
    });

    it('should emit events when finishing tasks', async () => {
      const taskUpdatedHandler = vi.fn();
      const currentTaskSetHandler = vi.fn();
      
      taskManager.on('taskUpdated', taskUpdatedHandler);
      taskManager.on('currentTaskSet', currentTaskSetHandler);
      
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      expect(taskUpdatedHandler).toHaveBeenCalledTimes(1);
      expect(currentTaskSetHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit allTasksCompleted event when finishing last task', async () => {
      const allTasksCompletedHandler = vi.fn();
      taskManager.on('allTasksCompleted', allTasksCompletedHandler);
      
      // Complete all tasks
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      expect(allTasksCompletedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task Dependencies', () => {
    it('should handle task dependencies', async () => {
      // Create parent task
      const parentTasks = await taskManager.createTasks(['Parent Task']);
      const parentId = parentTasks[0].id;
      
      // Exit maintenance mode to create child tasks
      taskManager.exitMaintenanceMode();
      
      // Create child tasks with parent dependency
      const childTasks = await taskManager.createTasks(['Child Task'], {
        parentTaskId: parentId
      });
      
      const childTask = childTasks[0];
      expect(childTask.dependencies).toContain(parentId);
      
      // Child task should not be selected as next task until parent is completed
      await taskManager.finishCurrentTask({ success: true, message: 'Completed' });
      
      const currentTask = await taskManager.getCurrentTask();
      expect(currentTask?.id).toBe(childTask.id);
    });
  });

  describe('Maintenance Mode', () => {
    it('should enter and exit maintenance mode', () => {
      expect(taskManager.isMaintenanceMode()).toBe(false);
      
      taskManager.enterMaintenanceMode();
      expect(taskManager.isMaintenanceMode()).toBe(true);
      
      taskManager.exitMaintenanceMode();
      expect(taskManager.isMaintenanceMode()).toBe(false);
    });

    it('should emit events when entering/exiting maintenance mode', () => {
      const enterHandler = vi.fn();
      const exitHandler = vi.fn();
      
      taskManager.on('maintenanceModeEntered', enterHandler);
      taskManager.on('maintenanceModeExited', exitHandler);
      
      taskManager.enterMaintenanceMode();
      expect(enterHandler).toHaveBeenCalledTimes(1);
      
      taskManager.exitMaintenanceMode();
      expect(exitHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task Deletion', () => {
    it('should delete tasks', async () => {
      const tasks = await taskManager.createTasks(['Task 1', 'Task 2']);
      const taskId = tasks[1].id;
      
      const result = await taskManager.deleteTask(taskId);
      expect(result).toBe(true);
      
      const remainingTasks = await taskManager.getAllTasks();
      expect(remainingTasks).toHaveLength(1);
      expect(remainingTasks[0].id).not.toBe(taskId);
    });

    it('should handle deleting current task', async () => {
      const tasks = await taskManager.createTasks(['Task 1', 'Task 2']);
      const currentTaskId = (await taskManager.getCurrentTask())?.id;
      
      const deleteHandler = vi.fn();
      const currentTaskSetHandler = vi.fn();
      
      taskManager.on('taskDeleted', deleteHandler);
      taskManager.on('currentTaskSet', currentTaskSetHandler);
      
      await taskManager.deleteTask(currentTaskId!);
      
      expect(deleteHandler).toHaveBeenCalledTimes(1);
      expect(currentTaskSetHandler).toHaveBeenCalledTimes(1);
      
      const newCurrentTask = await taskManager.getCurrentTask();
      expect(newCurrentTask?.id).toBe(tasks[1].id);
    });

    it('should clear all tasks', async () => {
      await taskManager.createTasks(['Task 1', 'Task 2']);
      
      const clearHandler = vi.fn();
      taskManager.on('tasksCleared', clearHandler);
      
      await taskManager.clearAllTasks();
      
      expect(clearHandler).toHaveBeenCalledTimes(1);
      expect(await taskManager.getAllTasks()).toHaveLength(0);
      expect(await taskManager.getCurrentTask()).toBeNull();
      expect(taskManager.isMaintenanceMode()).toBe(false);
    });
  });
});
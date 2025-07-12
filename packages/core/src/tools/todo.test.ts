/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { TodoTool, TodoToolParams } from './todo.js';

// Mock the fs/promises module
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  };
});

const mockedFs = vi.mocked(fs);

describe('TodoTool', () => {
  let todoTool: TodoTool;

  beforeEach(() => {
    todoTool = new TodoTool();
    vi.resetAllMocks();
  });

  describe('create_list', () => {
    it('should create a new task list', async () => {
      const params: TodoToolParams = {
        action: 'create_list',
        tasks: ['测试任务1', '测试任务2']
      };
      
      const result = await todoTool.execute(params);
      const parsedResult = JSON.parse(result.llmContent as string);
      
      expect(parsedResult.action).toBe('create_list');
      expect(parsedResult.tasks).toHaveLength(2);
      expect(parsedResult.maintenanceMode).toBe(true);
    });

    it('should throw error for empty task list', async () => {
      const params: TodoToolParams = {
        action: 'create_list',
        tasks: []
      };
      
      await expect(todoTool.execute(params)).rejects.toThrow('任务列表不能为空');
    });

    it('should throw error for tasks exceeding 20 characters', async () => {
      const params: TodoToolParams = {
        action: 'create_list',
        tasks: ['这是一个超过二十个字符限制的任务描述，应该会抛出错误']
      };
      
      await expect(todoTool.execute(params)).rejects.toThrow('超过20个字符限制');
    });
  });

  describe('list', () => {
    it('should list all tasks', async () => {
      // Mock existing tasks
      mockedFs.readFile.mockResolvedValue(JSON.stringify([
        { id: 'task1', description: '任务1', status: 'pending', createdAt: '2025-01-01' },
        { id: 'task2', description: '任务2', status: 'completed', createdAt: '2025-01-01' }
      ]));
      
      const result = await todoTool.execute({ action: 'list' });
      const parsedResult = JSON.parse(result.llmContent as string);
      
      expect(parsedResult.action).toBe('list');
      expect(parsedResult.tasks).toHaveLength(2);
      expect(parsedResult.progress).toBe('1/2');
    });

    it('should return empty message if no tasks exist', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const result = await todoTool.execute({ action: 'list' });
      const parsedResult = JSON.parse(result.llmContent as string);
      
      expect(parsedResult.message).toContain('暂无任务');
      expect(parsedResult.tasks).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update task status', async () => {
      // Mock existing tasks
      const existingTasks = [
        { id: 'task1', description: '任务1', status: 'pending', createdAt: '2025-01-01' },
        { id: 'task2', description: '任务2', status: 'in_progress', createdAt: '2025-01-01' }
      ];
      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingTasks));

      const params: TodoToolParams = {
        action: 'update',
        taskId: 'task1',
        status: 'completed'
      };

      const result = await todoTool.execute(params);
      const parsedResult = JSON.parse(result.llmContent as string);

      expect(parsedResult.action).toBe('update');
      expect(parsedResult.task.status).toBe('completed');
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for non-existent task ID', async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify([]));

      const params: TodoToolParams = {
        action: 'update',
        taskId: 'nonexistent',
        status: 'completed'
      };

      await expect(todoTool.execute(params)).rejects.toThrow('未找到ID为 nonexistent 的任务');
    });
  });

  describe('current', () => {
    it('should get the current (first pending) task', async () => {
      const existingTasks = [
        { id: 'task1', description: '任务1', status: 'completed', createdAt: '2025-01-01' },
        { id: 'task2', description: '任务2', status: 'pending', createdAt: '2025-01-01' }
      ];
      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingTasks));

      const result = await todoTool.execute({ action: 'current' });
      const parsedResult = JSON.parse(result.llmContent as string);

      expect(parsedResult.action).toBe('current');
      expect(parsedResult.currentTask.description).toBe('任务2');
      expect(parsedResult.currentTask.status).toBe('pending');
    });

    it('should return message when all tasks completed', async () => {
      const existingTasks = [
        { id: 'task1', description: '任务1', status: 'completed', createdAt: '2025-01-01' }
      ];
      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingTasks));
      
      const result = await todoTool.execute({ action: 'current' });
      const parsedResult = JSON.parse(result.llmContent as string);
      
      expect(parsedResult.message).toContain('所有任务已完成');
      expect(parsedResult.currentTask).toBeNull();
    });
  });
}); 
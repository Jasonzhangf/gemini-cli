/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { TodoService } from '../context/todoService.js';
import { ContextManager } from '../context/contextManager.js';

export interface ModifyTaskParams {
  taskId?: string;
  newDescription: string;
  reason: string;
  confirmed?: boolean;
}

/**
 * Tool to modify task descriptions with confirmation
 */
export class ModifyTaskTool extends BaseTool<ModifyTaskParams, ToolResult> {
  static readonly Name = 'modify_task';
  private todoService: TodoService;
  private contextManager: ContextManager | null;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'modify_task',
      '修改任务描述',
      '修改任务的描述，需要确认机制防止误操作',
      {
        type: Type.OBJECT,
        properties: {
          taskId: {
            type: Type.STRING,
            description: '要修改的任务ID（可选，默认为当前任务）'
          },
          newDescription: {
            type: Type.STRING,
            description: '新的任务描述，建议不超过30个字符'
          },
          reason: {
            type: Type.STRING,
            description: '修改原因说明'
          },
          confirmed: {
            type: Type.BOOLEAN,
            description: '是否确认修改（首次调用应为false或不提供）'
          }
        },
        required: ['newDescription', 'reason']
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
    
    if (config) {
      try {
        this.contextManager = config.getContextManager();
      } catch (error) {
        this.contextManager = null;
      }
    } else {
      this.contextManager = null;
    }
  }

  async execute(params: ModifyTaskParams): Promise<ToolResult> {
    const { taskId, newDescription, reason, confirmed = false } = params;
    
    // Validate new description
    if (!newDescription || newDescription.trim().length === 0) {
      throw new Error('新任务描述不能为空');
    }

    if (newDescription.length > 100) {
      throw new Error(`新任务描述"${newDescription}"超过100个字符限制`);
    }

    // Get target task
    let targetTaskId: string;
    if (taskId) {
      targetTaskId = taskId;
    } else {
      const currentTaskId = await this.todoService.getCurrentTaskId();
      if (!currentTaskId) {
        throw new Error('没有当前任务，请指定要修改的任务ID');
      }
      targetTaskId = currentTaskId;
    }

    const tasks = await this.todoService.loadTasks();
    const targetTask = tasks.find((t: any) => t.id === targetTaskId);
    
    if (!targetTask) {
      throw new Error(`未找到ID为 ${targetTaskId} 的任务`);
    }

    // If not confirmed, show confirmation prompt
    if (!confirmed) {
      return {
        llmContent: JSON.stringify({
          action: 'confirmation_required',
          currentTask: targetTask,
          newDescription: newDescription.trim(),
          reason: reason,
          confirmationNeeded: true
        }),
        returnDisplay: `⚠️ **任务修改确认**

🎯 **当前任务**: "${targetTask.description}"
📝 **新描述**: "${newDescription.trim()}"
🤔 **修改原因**: ${reason}

❓ **请确认是否要修改任务**:
- 这将改变当前的任务目标
- 修改后需要按新目标执行

💡 **如需确认**，请再次调用此工具并设置 confirmed: true
🚫 **如需取消**，请忽略此消息并继续当前任务`
      };
    }

    // Confirmed - proceed with modification
    const oldDescription = targetTask.description;
    targetTask.description = newDescription.trim();
    
    // Add modification timestamp to task
    if (!targetTask.modifiedAt) {
      targetTask.modifiedAt = [];
    }
    targetTask.modifiedAt.push({
      timestamp: new Date().toISOString(),
      oldDescription,
      newDescription: newDescription.trim(),
      reason
    });

    await this.todoService.saveTasks(tasks);

    // Update context manager if available
    if (this.contextManager) {
      try {
        await this.contextManager.updateTaskStatus(targetTaskId, targetTask.status);
      } catch (error) {
        console.warn('[ModifyTaskTool] Failed to update context manager:', error);
      }
    }

    return {
      llmContent: JSON.stringify({
        action: 'task_modified',
        taskId: targetTaskId,
        oldDescription,
        newDescription: newDescription.trim(),
        reason,
        task: targetTask
      }),
      returnDisplay: `✅ **任务已修改**

🔄 **原描述**: "${oldDescription}"
✨ **新描述**: "${newDescription.trim()}"
📝 **修改原因**: ${reason}

🎯 **现在请按照新的任务目标执行**`
    };
  }
}
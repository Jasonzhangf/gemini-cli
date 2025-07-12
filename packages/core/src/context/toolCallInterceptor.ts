/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import { ContextWrapper } from './contextWrapper.js';
import { TodoTool } from '../tools/todo.js';
import { Config } from '../config/config.js';

/**
 * 工具调用拦截器 - 在工具调用前后添加上下文相关的处理
 * 不修改现有的工具调度器，而是作为中间件层
 */
export class ToolCallInterceptor {
  private contextWrapper: ContextWrapper;
  private config: Config;
  private todoTool: TodoTool;

  constructor(config: Config) {
    this.config = config;
    this.contextWrapper = new ContextWrapper(config);
    this.todoTool = new TodoTool();
  }

  /**
   * 工具调用前的预处理
   * 在任务维护模式下，自动注入当前任务信息到响应中
   */
  async preprocessToolCall(request: ToolCallRequestInfo): Promise<string> {
    if (!this.contextWrapper.isInMaintenanceMode()) {
      return '';
    }

    // 如果是todo工具调用，不需要额外处理
    if (request.name === 'todo') {
      return '';
    }

    // 获取当前任务信息
    const currentTask = this.contextWrapper.getCurrentTask();
    if (!currentTask) {
      return '\n🎯 所有任务已完成！建议结束任务维护模式。';
    }

    // 自动调用todoCurrent获取最新任务状态
    try {
      const todoResult = await this.todoTool.execute({ action: 'current' });
      const todoData = JSON.parse(todoResult.llmContent as string);
      
      if (todoData.currentTask) {
        return `\n🎯 当前任务: "${todoData.currentTask.description}"
📋 任务状态: ${todoData.currentTask.status}
💡 提示: 这个工具调用与当前任务相关，完成后请更新任务状态`;
      } else {
        return `\n🎯 ${todoData.message}
${todoData.suggestion ? `💡 建议: ${todoData.suggestion}` : ''}`;
      }
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[ToolCallInterceptor] Failed to get current task:', error);
      }
      return '\n🎯 任务维护模式已激活';
    }
  }

  /**
   * 工具调用后的后处理
   * 处理todo工具的特殊响应，更新上下文状态
   */
  async postprocessToolCall(
    request: ToolCallRequestInfo, 
    response: ToolCallResponseInfo
  ): Promise<string> {
    try {
      // 如果是todo工具调用，需要特殊处理
      if (request.name === 'todo' && !response.error) {
        let toolResult;
        try {
          // 从响应中提取工具结果
          if (response.responseParts && typeof response.responseParts === 'object' && 
              'functionResponse' in response.responseParts &&
              response.responseParts.functionResponse?.response) {
            toolResult = JSON.parse(response.responseParts.functionResponse.response as unknown as string);
          }
        } catch (parseError) {
          if (this.config.getDebugMode()) {
            console.warn('[ToolCallInterceptor] Failed to parse todo tool result:', parseError);
          }
        }

        if (toolResult) {
          await this.contextWrapper.handleToolCallComplete('todo', toolResult);
          
          // 根据todo操作类型返回不同的后处理信息
          switch (toolResult.action) {
            case 'create_list':
              return '\n🚀 任务维护模式已激活！系统将在每次工具调用时提示当前任务。';
              
            case 'update':
              if (toolResult.allCompleted) {
                return '\n🎉 所有任务已完成！建议使用 {"action": "end_maintenance"} 结束任务维护模式。';
              } else {
                return `\n✅ 任务状态已更新！进度: ${toolResult.progress}`;
              }
              
            case 'end_maintenance':
              return '\n🏁 任务维护模式已结束，回到常规对话模式。';
              
            default:
              return '';
          }
        }
      }

      // 对于其他工具调用，在任务维护模式下提供任务完成提示
      if (this.contextWrapper.isInMaintenanceMode() && request.name !== 'todo') {
        const currentTask = this.contextWrapper.getCurrentTask();
        if (currentTask && currentTask.status === 'pending') {
          return `\n💡 工具执行完成！如果这完成了当前任务 "${currentTask.description}"，请使用以下命令更新状态：
{"action": "update", "taskId": "${currentTask.id}", "status": "completed"}`;
        }
      }

      return '';
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[ToolCallInterceptor] Error in postprocessToolCall:', error);
      }
      return '';
    }
  }

  /**
   * 获取上下文包装器
   */
  getContextWrapper(): ContextWrapper {
    return this.contextWrapper;
  }

  /**
   * 检查是否需要拦截特定工具调用
   */
  shouldIntercept(toolName: string): boolean {
    // 在任务维护模式下拦截所有工具调用
    return this.contextWrapper.isInMaintenanceMode();
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import { ContextWrapper } from './contextWrapper.js';
import { TodoTool } from '../tools/todo.js';
import { Config } from '../config/config.js';
import { TodoService } from './todoService.js';

/**
 * 工具调用拦截器 - 在工具调用前后添加上下文相关的处理
 * 不修改现有的工具调度器，而是作为中间件层
 */
export class ToolCallInterceptor {
  private contextWrapper: ContextWrapper;
  private config: Config;
  private todoTool: TodoTool;
  private todoService: TodoService;

  constructor(config: Config) {
    this.config = config;
    this.contextWrapper = new ContextWrapper(config);
    this.todoTool = new TodoTool(config);
    this.todoService = new TodoService();
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
          
          // 根据todo操作类型返回不同的后处理信息（精简版，不干扰用户）
          switch (toolResult.action) {
            case 'create_list':
              return '\n🚀 任务维护模式已激活！';
              
            case 'update':
              if (toolResult.allCompleted) {
                return '\n🎉 所有任务已完成！';
              } else {
                return `\n✅ 任务状态已更新！进度: ${toolResult.progress}`;
              }
              
            case 'end_maintenance':
              return '\n🏁 任务维护模式已结束。';
              
            default:
              return '';
          }
        }
      }

      // 对于其他工具调用，在任务维护模式下不显示任务提示给用户
      // 任务状态信息通过系统提示传递给模型
      if (this.contextWrapper.isInMaintenanceMode() && request.name !== 'todo') {
        // 静默更新任务状态，但不显示给用户
        const currentTask = await this.todoService.getCurrentTask();
        if (currentTask && (currentTask.status === 'pending' || currentTask.status === 'in_progress')) {
          // 记录调试信息但不返回给用户
          if (this.config.getDebugMode()) {
            console.log(`[ToolCallInterceptor] Task reminder for model: ${currentTask.description} (${currentTask.status})`);
          }
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

  /**
   * 检测任务变更需求
   * 当模型没有工具调用但任务未完成时，提示用户是否需要更新任务
   */
  async detectTaskChangeNeeds(modelResponse: string): Promise<string> {
    try {
      // 只在任务维护模式下进行检测
      if (!this.contextWrapper.isInMaintenanceMode()) {
        return '';
      }

      // 获取当前任务
      const currentTask = await this.todoService.getCurrentTask();
      if (!currentTask || currentTask.status === 'completed') {
        return '';
      }

      // 检查模型的响应是否包含任务相关关键词，但没有工具调用
      const hasTaskKeywords = this.containsTaskKeywords(modelResponse);
      const hasToolCalls = this.containsToolCalls(modelResponse);

      if (hasTaskKeywords && !hasToolCalls) {
        // 记录检测到的情况但不显示给用户
        if (this.config.getDebugMode()) {
          console.log(`[ToolCallInterceptor] Detected task-related response without tool calls for task: ${currentTask.description}`);
        }
        // 任务提醒通过系统提示处理，不在这里显示给用户
        return '';
      }

      return '';
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[ToolCallInterceptor] Error in detectTaskChangeNeeds:', error);
      }
      return '';
    }
  }

  /**
   * 检查文本是否包含任务相关关键词
   */
  private containsTaskKeywords(text: string): boolean {
    const taskKeywords = [
      '完成', '完成了', '已完成', '任务', '下一步', '接下来', 
      '开始', '继续', '准备', '需要', '现在', '然后', '步骤',
      '实现', '修改', '创建', '更新', '处理', '解决', '优化'
    ];
    
    const lowerText = text.toLowerCase();
    return taskKeywords.some(keyword => 
      lowerText.includes(keyword) || 
      text.includes(keyword)
    );
  }

  /**
   * 检查文本是否包含工具调用格式
   */
  private containsToolCalls(text: string): boolean {
    // 检查是否包含工具调用的JSON格式
    const toolCallPatterns = [
      /\{[^}]*"action"[^}]*\}/,  // todo工具格式
      /\{[^}]*"tool"[^}]*\}/,   // 通用工具格式
      /✦[^✦]*\{[^}]*\}/,       // OpenAI文本引导格式
    ];
    
    return toolCallPatterns.some(pattern => pattern.test(text));
  }
}
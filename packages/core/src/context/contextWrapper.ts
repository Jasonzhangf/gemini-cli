/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { ContextManager } from './contextManager.js';
import { Config } from '../config/config.js';

/**
 * 上下文包装器 - 用于集成现有的内存系统和新的上下文管理系统
 * 这个包装器不修改现有代码，而是在其基础上添加增强功能
 */
export class ContextWrapper {
  private contextManager: ContextManager;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.contextManager = config.getContextManager();
  }

  /**
   * 包装现有的getUserMemory方法，添加上下文管理功能
   */
  getEnhancedUserMemory(): string {
    // 获取原始的用户内存
    const originalMemory = this.config.getUserMemory();
    
    // 获取上下文管理器生成的额外上下文
    const contextualMemory = this.contextManager.generateModelContext();
    
    // 合并内存内容
    const sections: string[] = [];
    
    if (originalMemory && originalMemory.trim().length > 0) {
      sections.push('# 用户记忆\n' + originalMemory.trim());
    }
    
    if (contextualMemory && contextualMemory.trim().length > 0) {
      sections.push(contextualMemory.trim());
    }
    
    return sections.join('\n\n---\n\n');
  }

  /**
   * 包装历史记录管理
   */
  addHistoryRecord(content: Content): void {
    this.contextManager.addHistoryRecord(content);
  }

  /**
   * 包装历史记录获取
   */
  getHistoryRecords(): Content[] {
    return this.contextManager.getHistoryRecords();
  }

  /**
   * 设置历史记录
   */
  setHistoryRecords(records: Content[]): void {
    this.contextManager.setHistoryRecords(records);
  }

  /**
   * 检查是否在任务维护模式
   */
  isInMaintenanceMode(): boolean {
    return this.contextManager.isInMaintenanceMode();
  }

  /**
   * 获取当前任务（用于工具调用前的上下文注入）
   */
  getCurrentTask(): any {
    return this.contextManager.getCurrentTask();
  }

  /**
   * 生成工具调用前的上下文提示
   * 当系统处于任务维护模式时，自动注入当前任务信息
   */
  generateToolCallContext(): string {
    if (!this.isInMaintenanceMode()) {
      return '';
    }

    const currentTask = this.getCurrentTask();
    if (!currentTask) {
      return '\n🎯 任务状态: 所有任务已完成，建议结束任务维护模式';
    }

    return `\n🎯 当前任务: "${currentTask.description}" (状态: ${currentTask.status})
💡 提示: 完成当前任务后，请使用 todo 工具更新状态: {"action": "update", "taskId": "${currentTask.id}", "status": "completed"}`;
  }

  /**
   * 处理工具调用后的上下文更新
   */
  async handleToolCallComplete(toolName: string, toolResult: any): Promise<void> {
    // 如果是todo工具且创建了任务列表，需要特殊处理
    if (toolName === 'todo' && toolResult?.maintenanceMode === true) {
      // 任务列表已创建，上下文管理器会自动处理
      if (this.config.getDebugMode()) {
        console.log('[ContextWrapper] Entered task maintenance mode');
      }
    }
    
    // 如果是todo工具且结束了维护模式
    if (toolName === 'todo' && toolResult?.maintenanceMode === false) {
      if (this.config.getDebugMode()) {
        console.log('[ContextWrapper] Exited task maintenance mode');
      }
    }
  }

  /**
   * 添加动态上下文
   */
  addDynamicContext(context: string): void {
    this.contextManager.addDynamicContext(context);
  }

  /**
   * 清除动态上下文
   */
  clearDynamicContext(): void {
    this.contextManager.clearDynamicContext();
  }

  /**
   * 获取完整的上下文数据（用于调试和监控）
   */
  getContextData(): any {
    return this.contextManager.getContext();
  }
}
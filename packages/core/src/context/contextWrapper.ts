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
   * 初始化包装器
   */
  async initialize(): Promise<void> {
    // 移除旧的调试器初始化，统一使用新的 DebugLogger
    // 初始化工作现在在 ContextManager 中完成
  }

  /**
   * 包装现有的getUserMemory方法，添加上下文管理功能
   */
  async getEnhancedUserMemory(_userMessage?: string): Promise<string> {
    // 获取原始的用户内存
    const originalMemory = this.config.getUserMemory();
    
    // 获取上下文管理器生成的额外上下文
    const contextualMemory = this.contextManager.generateModelContext();
    
    // 合并内存内容
    const sections: string[] = [];
    
    if (originalMemory && originalMemory.trim().length > 0) {
      sections.push('# 用户记忆 (Memory Tool)\n' + originalMemory.trim());
    }
    
    if (contextualMemory && contextualMemory.trim().length > 0) {
      sections.push(contextualMemory.trim());
    }
    
    const enhancedMemory = sections.join('\n\n---\n\n');
    
    // NOTE: Debug快照现在在getEnhancedSystemPromptIfAvailable中统一处理
    // 避免重复记录debug信息
    
    return enhancedMemory;
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
  getCurrentTask(): unknown {
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

    const currentTask = this.getCurrentTask() as any;
    if (!currentTask) {
      return '\n🎯 任务状态: 所有任务已完成，建议结束任务维护模式';
    }

    return `\n🎯 当前任务: "${currentTask.description}" (状态: ${currentTask.status})
💡 提示: 完成当前任务后，请使用 todo 工具更新状态: {"action": "update", "taskId": "${currentTask.id}", "status": "completed"}`;
  }

  /**
   * 处理工具调用后的上下文更新
   */
  async handleToolCallComplete(toolName: string, toolResult: unknown): Promise<void> {
    const result = toolResult as any;
    // 如果是todo工具且创建了任务列表，需要特殊处理
    if (toolName === 'todo' && result?.maintenanceMode === true) {
      // 任务列表已创建，上下文管理器会自动处理
      if (this.config.getDebugMode()) {
        console.log('[ContextWrapper] Entered task maintenance mode');
      }
    }
    
    // 如果是todo工具且结束了维护模式
    if (toolName === 'todo' && result?.maintenanceMode === false) {
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
  getContextData(): unknown {
    return this.contextManager.getContext();
  }

  /**
   * 手动保存debug快照（用于额外的debug记录点）
   * 现在使用统一的 DebugLogger 替代旧的调试器
   */
  async saveDebugSnapshot(_enhancedPrompt?: string, _userMessage?: string): Promise<void> {
    // 移除旧的调试器方法，现在统一使用 DebugLogger
    // Debug 快照现在在 OpenAI hijack 模块中统一处理
  }

  /**
   * 获取调试器当前轮次
   * 现在返回默认值，实际轮次由 DebugLogger 管理
   */
  getCurrentDebugTurn(): number {
    return 0; // 旧的调试器已移除，返回默认值
  }
}
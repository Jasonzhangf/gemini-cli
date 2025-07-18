/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { FunctionDeclaration } from '@google/genai';

/**
 * 上下文数据提供器 - 纯粹的数据获取，无格式化逻辑
 * 遵循单一职责原则：只负责数据获取和基本处理
 */
export class ContextDataProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * 获取系统基础信息
   */
  async getSystemInfo(): Promise<{
    workingDirectory: string;
    timestamp: string;
    sessionId: string;
    debugMode: boolean;
  }> {
    return {
      workingDirectory: process.cwd(),
      timestamp: new Date().toISOString(),
      sessionId: this.config.getSessionId(),
      debugMode: this.config.getDebugMode()
    };
  }

  /**
   * 获取可用工具列表
   */
  async getAvailableTools(): Promise<FunctionDeclaration[]> {
    try {
      const toolRegistry = await this.config.getToolRegistry();
      return toolRegistry.getFunctionDeclarations();
    } catch (error) {
      console.warn('[ContextDataProvider] Failed to get tool registry:', error);
      return [];
    }
  }

  /**
   * 获取系统能力列表
   */
  getSystemCapabilities(): string[] {
    return [
      'file_operations',
      'shell_execution',
      'web_search',
      'memory_management',
      'task_management',
      'workflow_templates'
    ];
  }

  /**
   * 获取上下文管理器
   */
  getContextManager() {
    return this.config.getContextManager();
  }

  /**
   * 获取ContextAgent（如果可用）
   */
  async getContextAgent() {
    try {
      return this.config.getContextAgent();
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查是否启用上下文增强
   */
  isContextEnhancementEnabled(): boolean {
    return process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false';
  }
}
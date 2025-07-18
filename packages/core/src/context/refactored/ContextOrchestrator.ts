/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { ContextDataProvider } from './ContextDataProvider.js';
import { SystemPromptBuilder } from './SystemPromptBuilder.js';

/**
 * 上下文编排器 - 统一的上下文生成入口点
 * 遵循单一职责原则：只负责编排和协调，不负责具体实现
 */
export class ContextOrchestrator {
  private dataProvider: ContextDataProvider;
  private promptBuilder: SystemPromptBuilder;

  constructor(config: Config) {
    this.dataProvider = new ContextDataProvider(config);
    this.promptBuilder = new SystemPromptBuilder();
  }

  /**
   * 生成系统提示词 - 统一入口点
   */
  async generateSystemPrompt(userMessage?: string): Promise<string> {
    // 1. 获取系统信息
    const systemInfo = await this.dataProvider.getSystemInfo();
    
    // 2. 检查是否启用增强功能
    const isEnhancementEnabled = this.dataProvider.isContextEnhancementEnabled();
    
    // 3. 获取可用工具
    const availableTools = await this.dataProvider.getAvailableTools();
    
    // 4. 根据配置生成提示词
    if (!isEnhancementEnabled) {
      if (systemInfo.debugMode) {
        console.log('[ContextOrchestrator] Context enhancement disabled, using basic system prompt');
      }
      return this.promptBuilder.buildBasicSystemPrompt(availableTools);
    }

    if (systemInfo.debugMode) {
      console.log('[ContextOrchestrator] Using enhanced system prompt');
    }
    
    return this.promptBuilder.buildEnhancedSystemPrompt(availableTools, systemInfo.debugMode);
  }

  /**
   * 生成动态上下文 - 基于用户输入的智能上下文
   */
  async generateDynamicContext(userInput?: string): Promise<string> {
    if (!userInput) {
      return '';
    }

    try {
      const contextAgent = await this.dataProvider.getContextAgent();
      if (!contextAgent) {
        return '';
      }

      return await contextAgent.getContextForPrompt(userInput);
    } catch (error) {
      console.warn('[ContextOrchestrator] Failed to generate dynamic context:', error);
      return '';
    }
  }

  /**
   * 生成完整上下文 - 系统提示词 + 动态上下文
   */
  async generateFullContext(userMessage?: string): Promise<{
    systemPrompt: string;
    dynamicContext: string;
    combinedContext: string;
  }> {
    const systemPrompt = await this.generateSystemPrompt(userMessage);
    const dynamicContext = await this.generateDynamicContext(userMessage);
    
    // 组合上下文
    const combinedContext = dynamicContext 
      ? `${systemPrompt}\n\n---\n\n# 📊 Dynamic Context\n\n${dynamicContext}`
      : systemPrompt;

    return {
      systemPrompt,
      dynamicContext,
      combinedContext
    };
  }

  /**
   * 验证上下文生成配置
   */
  async validateConfiguration(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const systemInfo = await this.dataProvider.getSystemInfo();
      const tools = await this.dataProvider.getAvailableTools();
      
      if (!systemInfo.sessionId) {
        issues.push('Missing session ID');
      }
      
      if (tools.length === 0) {
        issues.push('No tools available');
      }
      
      if (this.dataProvider.isContextEnhancementEnabled()) {
        const contextAgent = await this.dataProvider.getContextAgent();
        if (!contextAgent) {
          issues.push('Context enhancement enabled but ContextAgent not available');
        }
      }
      
    } catch (error) {
      issues.push(`Configuration validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}
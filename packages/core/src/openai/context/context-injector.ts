/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { DetailedContextComponents } from '../types/interfaces.js';

/**
 * 上下文注入器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ContextInjector {
  private readonly config: Config;
  private readonly debugMode: boolean;

  constructor(config: Config, debugMode: boolean = false) {
    this.config = config;
    this.debugMode = debugMode;
  }

  /**
   * 注入用户输入上下文
   */
  async injectUserInputContext(userInput: string): Promise<void> {
    try {
      const contextAgent = this.config.getContextAgent();
      if (contextAgent) {
        if (this.debugMode) {
          console.log('[ContextInjector] Triggering ContextAgent for user input');
        }
        
        await contextAgent.injectContextIntoDynamicSystem(userInput);
        
        if (this.debugMode) {
          console.log('[ContextInjector] ✅ User input context injected');
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContextInjector] User input context injection failed:', error);
      }
    }
  }

  /**
   * 注入模型响应上下文
   */
  async injectModelResponseContext(response: string, toolCallNames: string[] = []): Promise<void> {
    try {
      const contextAgent = this.config.getContextAgent();
      if (contextAgent && (contextAgent as any).initialized) {
        let contextInput = response;
        if (toolCallNames.length > 0) {
          contextInput += `\nTool calls: ${toolCallNames.join(', ')}`;
        }
        
        if (this.debugMode) {
          console.log('[ContextInjector] Triggering ContextAgent for model response');
        }
        
        await contextAgent.injectContextIntoDynamicSystem(contextInput);
        
        if (this.debugMode) {
          console.log('[ContextInjector] ✅ Model response context injected');
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContextInjector] Model response context injection failed:', error);
      }
    }
  }

  /**
   * 获取增强的系统提示
   */
  async getEnhancedSystemPrompt(userMessage: string): Promise<string> {
    try {
      const { getEnhancedSystemPromptIfAvailable } = await import('../../context/index.js');
      return await getEnhancedSystemPromptIfAvailable(this.config, userMessage);
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContextInjector] Enhanced system prompt failed, using fallback');
      }
      return this.getFallbackSystemPrompt();
    }
  }

  /**
   * 获取回退系统提示
   */
  private async getFallbackSystemPrompt(): Promise<string> {
    try {
      const { getCoreSystemPrompt } = await import('../../core/prompts.js');
      const userMemory = this.config.getUserMemory();
      return getCoreSystemPrompt(userMemory);
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContextInjector] Fallback system prompt failed');
      }
      return 'You are a helpful AI assistant.';
    }
  }

  /**
   * 收集详细上下文信息（用于调试）
   */
  async collectDetailedContext(): Promise<DetailedContextComponents> {
    const contextComponents: DetailedContextComponents = {
      systemContext: null,
      staticContext: null,
      dynamicContext: null,
      taskContext: null,
    };

    try {
      const standardIntegrator = this.config.getContextManager().getStandardContextIntegrator();
      if (standardIntegrator) {
        const fullContext = await standardIntegrator.getStandardContext({ includeProjectDiscovery: false });
        contextComponents.systemContext = fullContext.system;
        contextComponents.staticContext = fullContext.static;
        contextComponents.dynamicContext = fullContext.dynamic;
        contextComponents.taskContext = fullContext.task;
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[ContextInjector] Failed to collect detailed context:', error);
      }
    }

    return contextComponents;
  }

  /**
   * 获取格式化的动态上下文 - RAG removed from system prompts
   */
  async getFormattedDynamicContext(): Promise<string> {
    // RAG content removed from system prompts - all dynamic context handled by contextAgent
    if (this.debugMode) {
      console.log('[ContextInjector] Dynamic context removed from system prompts - handled by contextAgent');
    }
    return '';
  }

  /**
   * 检查上下文代理是否可用
   */
  isContextAgentAvailable(): boolean {
    const contextAgent = this.config.getContextAgent();
    return contextAgent && (contextAgent as any).initialized;
  }
}
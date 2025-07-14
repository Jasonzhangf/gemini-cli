/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 导出所有上下文管理相关的组件
export { ContextManager, ContextData, TaskListContext, TaskItem } from './contextManager.js';
export { TodoService } from './todoService.js';
export { ContextWrapper } from './contextWrapper.js';
export { PromptEnhancer } from './promptEnhancer.js';
export { ToolCallInterceptor } from './toolCallInterceptor.js';
export { ContextAgent } from './contextAgent.js';

// 便捷函数：检查是否启用了上下文增强功能
export function isContextEnhancementEnabled(): boolean {
  // 可以通过环境变量控制是否启用
  return process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false';
}

// 便捷函数：获取增强的系统提示（如果可用）
import { Config } from '../config/config.js';

export async function getEnhancedSystemPromptIfAvailable(config: Config, userMessage?: string): Promise<string> {
  // Import getCoreSystemPrompt from prompts
  const { getCoreSystemPrompt } = await import('../core/prompts.js');
  
  if (!isContextEnhancementEnabled()) {
    // 回退到原始的getCoreSystemPrompt，而不是仅仅getUserMemory
    if (config.getDebugMode()) {
      console.log('[Context] Context enhancement disabled, using original system prompt');
    }
    const originalMemory = config.getUserMemory();
    return getCoreSystemPrompt(originalMemory);
  }

  try {
    if (config.getDebugMode()) {
      console.log('[Context] Using enhanced system prompt with context management');
    }
    
    const promptEnhancer = config.getPromptEnhancer();
    let enhancedPrompt = await promptEnhancer.getEnhancedSystemPrompt(userMessage);
    
    // ContextAgent integration (Milestone 4) - Inject into dynamic context
    try {
      const contextAgent = config.getContextAgent();
      if (contextAgent?.isInitialized()) {
        // Use the new injection method for better dynamic context integration
        await contextAgent.injectContextIntoDynamicSystem(userMessage);
        
        if (config.getDebugMode()) {
          console.log('[Context] ContextAgent layered context injected into dynamic context system');
        }
      }
    } catch (contextAgentError) {
      // ContextAgent is optional, don't break the flow if it fails
      if (config.getDebugMode()) {
        console.log('[Context] ContextAgent not available or failed:', contextAgentError);
      }
    }
    
    // 在每次调用时保存debug快照（如果启用了debug模式）
    if (config.getDebugMode()) {
      const contextWrapper = promptEnhancer.getContextWrapper();
      await contextWrapper.saveDebugSnapshot(enhancedPrompt, userMessage);
    }
    
    return enhancedPrompt;
  } catch (_error) {
    // 如果增强器未初始化，回退到原始方法
    console.warn('[Context] PromptEnhancer not available, falling back to original method:', _error);
    const originalMemory = config.getUserMemory();
    return getCoreSystemPrompt(originalMemory);
  }
}

// 便捷函数：获取工具调用拦截器（如果可用）
import { ToolCallInterceptor } from './toolCallInterceptor.js';
export function getToolCallInterceptorIfAvailable(config: Config): ToolCallInterceptor | null {
  if (!isContextEnhancementEnabled()) {
    return null;
  }

  try {
    return config.getToolCallInterceptor();
  } catch (error) {
    // 拦截器未初始化
    return null;
  }
}
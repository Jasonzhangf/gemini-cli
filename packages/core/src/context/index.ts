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
import { UnifiedPromptManager } from '../core/unifiedPromptManager.js';

export async function getEnhancedSystemPromptIfAvailable(config: Config, userMessage?: string): Promise<string> {
  // 使用统一的提示词管理器
  const promptManager = new UnifiedPromptManager(config);
  
  if (!isContextEnhancementEnabled()) {
    // 回退到基础的系统提示词
    if (config.getDebugMode()) {
      console.log('[Context] Context enhancement disabled, using basic system prompt');
    }
    // 即使在fallback模式下，也获取基本工具列表
    try {
      const toolRegistry = await config.getToolRegistry();
      const basicTools = toolRegistry.getFunctionDeclarations();
      return promptManager.generateSystemPrompt(basicTools, false, false);
    } catch (error) {
      console.warn('[Context] Failed to get tool registry, using minimal prompt:', error);
      return promptManager.generateSystemPrompt([], false, false);
    }
  }

  try {
    if (config.getDebugMode()) {
      console.log('[Context] Using enhanced system prompt with unified prompt manager');
    }
    
    // 获取可用工具列表
    const toolRegistry = await config.getToolRegistry();
    const availableTools = toolRegistry.getFunctionDeclarations();
    
    // 生成统一的增强系统提示词
    let enhancedPrompt = promptManager.generateSystemPrompt(
      availableTools,
      true, // 包含上下文
      true  // 包含任务管理
    );
    
    // 添加工具特定引导
    const toolSpecificGuidance = promptManager.generateToolSpecificGuidance(availableTools);
    if (toolSpecificGuidance) {
      enhancedPrompt += '\n\n---\n\n' + toolSpecificGuidance;
    }
    
    // ContextAgent integration is now handled in hijack.ts for better timing
    // This avoids duplicate injection calls
    
    // 在每次调用时保存debug快照（如果启用了debug模式）
    if (config.getDebugMode()) {
      console.log('[Context] Enhanced system prompt generated successfully');
    }
    
    return enhancedPrompt;
  } catch (_error) {
    // 如果增强器未初始化，回退到基础方法
    console.warn('[Context] Enhanced prompt generation failed, falling back to basic method:', _error);
    return promptManager.generateSystemPrompt([], false, false);
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
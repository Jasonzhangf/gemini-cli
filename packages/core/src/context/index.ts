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

// 便捷函数：检查是否启用了上下文增强功能
export function isContextEnhancementEnabled(): boolean {
  // 可以通过环境变量控制是否启用
  return process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false';
}

// 便捷函数：获取增强的系统提示（如果可用）
import { Config } from '../config/config.js';

export function getEnhancedSystemPromptIfAvailable(config: Config): string {
  if (!isContextEnhancementEnabled()) {
    // 回退到原始的getUserMemory
    const originalMemory = config.getUserMemory();
    return originalMemory || '';
  }

  try {
    return config.getPromptEnhancer().getEnhancedSystemPrompt();
  } catch (error) {
    // 如果增强器未初始化，回退到原始方法
    console.warn('[Context] PromptEnhancer not available, falling back to original method');
    const originalMemory = config.getUserMemory();
    return originalMemory || '';
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
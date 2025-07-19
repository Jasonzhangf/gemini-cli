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

// 注意：重构后的上下文生成系统已废弃，使用主要的 prompts.ts 实现

// 便捷函数：检查是否启用了上下文增强功能
export function isContextEnhancementEnabled(): boolean {
  // 可以通过环境变量控制是否启用
  return process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false';
}

// 使用主要的系统提示实现
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from '../core/prompts.js';

/**
 * 获取增强的系统提示（使用主要实现）
 * 保持向后兼容性
 */
export async function getEnhancedSystemPromptIfAvailable(config: Config, userMessage?: string): Promise<string> {
  const userMemory = config.getUserMemory();
  return getCoreSystemPrompt(userMemory);
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
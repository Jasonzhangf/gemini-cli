/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

// 重构后的上下文生成系统 - 导出统一接口
export { ContextDataProvider } from './ContextDataProvider.js';
export { ContextFormatter } from './ContextFormatter.js';
export { PromptSectionGenerator } from './PromptSectionGenerator.js';
export { SystemPromptBuilder } from './SystemPromptBuilder.js';
export { ContextOrchestrator } from './ContextOrchestrator.js';

// 便捷函数 - 简化的统一接口
import { Config } from '../../config/config.js';
import { ContextOrchestrator } from './ContextOrchestrator.js';

/**
 * 获取系统提示词 - 重构后的统一接口
 * 替代原有的 getEnhancedSystemPromptIfAvailable
 */
export async function getSystemPrompt(config: Config, userMessage?: string): Promise<string> {
  const orchestrator = new ContextOrchestrator(config);
  return await orchestrator.generateSystemPrompt(userMessage);
}

/**
 * 获取动态上下文 - 重构后的统一接口
 */
export async function getDynamicContext(config: Config, userInput?: string): Promise<string> {
  const orchestrator = new ContextOrchestrator(config);
  return await orchestrator.generateDynamicContext(userInput);
}

/**
 * 获取完整上下文 - 重构后的统一接口
 */
export async function getFullContext(config: Config, userMessage?: string): Promise<{
  systemPrompt: string;
  dynamicContext: string;
  combinedContext: string;
}> {
  const orchestrator = new ContextOrchestrator(config);
  return await orchestrator.generateFullContext(userMessage);
}

/**
 * 验证上下文配置 - 重构后的统一接口
 */
export async function validateContextConfiguration(config: Config): Promise<{
  isValid: boolean;
  issues: string[];
}> {
  const orchestrator = new ContextOrchestrator(config);
  return await orchestrator.validateConfiguration();
}
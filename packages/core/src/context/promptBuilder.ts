/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCoreSystemPrompt } from '../core/prompts.js';
import { Config } from '../config/config.js';
import { TodoService } from './todoService.js';
import { ContextWrapper } from './contextWrapper.js';

// A mapping of the fileds to their respective getter
// IMPORTANT: The order of this mapping is the order in which the prompts will be assembled.
const PROMPT_GETTER_MAPPING = {
  base: getBasePrompt,
  openAI: getOpenAIAdaptedPrompt,
  task: getCurrentTaskPrompt,
  mode: getModePrompt,
  context: getDynamicContextPrompt,
}

const todoService = new TodoService();

async function getBasePrompt(config: Config) {
  const originalMemory = config.getUserMemory();
    
  // 获取基础系统提示词
  const { getCoreSystemPrompt } = await import('../core/prompts.js');
  return getCoreSystemPrompt(originalMemory);
}

function isOpenAIMode(config: Config): boolean {
  // 检查配置或环境变量来确定是否为OpenAI模式
  try {
    const geminiClient = config.getGeminiClient();
    // 如果有hijack适配器，说明是OpenAI模式
    return !!(geminiClient as any)?.hijackAdapter;
  } catch {
    // 如果无法获取客户端信息，检查环境变量
    return !!(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL);
  }
}

async function getOpenAIAdaptedPrompt(config: Config, basePrompt: string) {
  if (!isOpenAIMode(config)) {
    return;
  }

  if (config.getDebugMode()) {
    console.log('[PromptBuilder] In OpenAI hijack mode, keeping text-based tool call format.');
  }

  // In hijack mode, we want the OpenAI model to produce the same
  // [tool_call: ...] syntax as the Gemini model. The hijack adapter
  // is responsible for translating this. Therefore, we do not replace
  // the core tool calling instructions.
  const adaptedPrompt = basePrompt;

  return adaptedPrompt;
}

async function getCurrentTaskPrompt() {
  try {
    const currentTask = await todoService.getCurrentTask();
    if (!currentTask) {
      return;
    }

    return `
# 🎯 当前工作目标

**目标任务**: ${currentTask.description}
**执行状态**: ${currentTask.status}
**创建时间**: ${new Date(currentTask.createdAt).toLocaleString()}

🔥 **核心工作流程**: 
1. **专注执行**: 当前任务是您的唯一工作目标，必须优先完成
2. **完成标记**: 任务完成后，立即使用以下命令标记完成：
   \`[tool_call: todo for action 'update' taskId '${currentTask.id}' status 'completed']\`
3. **获取下一个**: 标记完成后，系统自动分配下一个任务作为新的工作目标
4. **状态同步**: 每次使用工具时，都要考虑是否推进了当前工作目标

⚠️ **关键提醒**: 
- 当前任务未完成前，不要分心处理其他事项
- 完成任务后必须主动更新状态，否则系统无法分配下一个任务
- 如需修改或分解任务，使用 todo 工具调整后继续执行
`.trim();
  } catch (error) {
    // 如果读取当前任务失败，不添加任务提示
    return;
  }
}

function getModePrompt(config: Config) {
  const contextWrapper = new ContextWrapper(config);
  if (contextWrapper.isInMaintenanceMode()) {
    return getTaskModePrompt();
  }
  
  return getNonMaintenanceModePrompt();
}

function getTaskModePrompt() {
  return `
# 🔧 MAINTENANCE MODE ACTIVE

活跃任务列表已存在，进入维护模式。

⚠️ **严格禁止**: create_tasks (任务列表已存在)
✅ **专注维护**: 执行现有任务，不重新规划
`.trim();
}

function getNonMaintenanceModePrompt() {
  return `
# 📋 PLANNING MODE ACTIVE

无活跃任务列表，进入规划模式。

✅ **可使用**: create_tasks (对于复杂请求)
⚠️ **禁止**: 维护专用工具 (finish_current_task, insert_task, modify_task)
`.trim();
}

async function getDynamicContextPrompt(config: Config) {
  // RAG content removed from system prompts - all dynamic context now handled by contextAgent
  // The contextAgent injects dynamic context through the separate dynamic context system
  if (config.getDebugMode()) {
    console.log('[PromptBuilder] Dynamic context removed from system prompts - handled by contextAgent');
  }
  return '';
}

export async function buildPrompt(config: Config): Promise<string> {
  const sections = [];
  const basePrompt = await getBasePrompt(config);
  const openAIPrompt = await getOpenAIAdaptedPrompt(config, basePrompt);
  sections.push(openAIPrompt ?? basePrompt);

  const taskPrompt = await getCurrentTaskPrompt();
  if (taskPrompt) {
    sections.push(taskPrompt);
  }

  const modePrompt = getModePrompt(config);
  if (modePrompt) {
    sections.push(modePrompt);
  }

  const dynamicContext = await getDynamicContextPrompt(config);
  if (dynamicContext) {
    sections.push(dynamicContext);
  }

  return sections.join('\n\n');
}


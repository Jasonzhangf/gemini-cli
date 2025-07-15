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
   \`{"action": "update", "taskId": "${currentTask.id}", "status": "completed"}\`
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
# 🔧 任务维护模式

你当前处于任务维护模式。在此模式下：

## 🎯 工作重点
1. **任务导向**: 专注于完成当前活跃的任务列表中的各项任务
2. **状态更新**: 完成任务后立即更新任务状态
3. **进度跟踪**: 定期检查任务进度和完成情况
4. **维护任务列表**: 根据需要插入新任务或修改现有任务

## 🛠️ 可用的任务维护工具

### 任务状态管理
- **get_current_task**: 查看当前正在执行的任务
- **finish_current_task**: 完成当前任务并自动切换到下一个
- **get_next_task**: 获取下一个待执行的任务

### 任务列表维护
- **insert_task**: 在当前任务后插入新任务
- **modify_task**: 修改任务描述或更新任务信息

## ⚠️ 重要限制
- **禁止使用 create_tasks**: 任务列表已存在，不要重复创建新的任务列表
- **专注维护模式**: 当前应该维护现有任务，而不是重新规划整个项目

## 💡 工作流程建议
1. 使用 **get_current_task** 确认当前工作目标
2. 专注完成当前任务
3. 完成后使用 **finish_current_task** 标记完成
4. 如需要可使用 **insert_task** 添加细化任务
5. 继续下一个任务直到全部完成

请在任务维护模式下避免使用 create_tasks 工具，专注于维护和完成现有的任务列表。
`.trim();
}

function getNonMaintenanceModePrompt() {
  return `
# 📋 任务规划模式

当前没有活跃的任务列表，你处于任务规划模式。

## 🛠️ 推荐使用的工具

### 任务规划工具
- **create_tasks**: 将复杂目标分解为具体的任务列表
  - 用于创建3-8个具体可执行的任务
  - 每个任务应该是独立的执行步骤
  - 建议不超过30个字符，简洁明确

### 工作流模板
- **workflow_template**: 使用预定义的工作流模板
  - explore-plan-code-test: 探索-规划-编码-测试流程
  - project-analysis: 项目分析工作流
  - bug-fix: 问题修复工作流

## ⚠️ 当前限制
- **避免使用任务维护工具**: insert_task, modify_task, finish_current_task 等
- **无当前任务**: 没有活跃任务时，维护工具不适用

## 💡 建议工作流程
1. 分析用户需求和目标
2. 使用 **create_tasks** 制定完整的执行计划
3. 系统自动进入任务维护模式
4. 开始逐个执行任务

当你需要处理复杂任务时，优先使用 create_tasks 工具来制定清晰的执行计划。
`.trim();
}

async function getDynamicContextPrompt(config: Config) {
  let dynamicContextContent = '';
  try {
    const standardIntegrator = config.getContextManager().getStandardContextIntegrator();
    if (standardIntegrator) {
      const fullContext = await standardIntegrator.getStandardContext({ includeProjectDiscovery: false });
      dynamicContextContent = standardIntegrator.formatStandardContextForModel(fullContext);
    }
  } catch (error) {
    if (config.getDebugMode()) {
      console.log('[PromptEnhancer] Failed to get dynamic context:', error);
    }
  }

  if (dynamicContextContent && dynamicContextContent.trim()) {
    return `\n${'═'.repeat(100)}\n║                              📋 CURRENT CONTEXT SECTION                              ║\n${'═'.repeat(100)}\n\n${dynamicContextContent}\n\n${'═'.repeat(100)}\n║                            END OF CONTEXT SECTION                            ║\n${'═'.repeat(100)}`;
  }
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


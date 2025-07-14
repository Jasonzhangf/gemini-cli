/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCoreSystemPrompt } from '../core/prompts.js';
import { ContextWrapper } from './contextWrapper.js';
import { Config } from '../config/config.js';
import { TodoService } from './todoService.js';

/**
 * 提示增强器 - 包装现有的提示生成系统，添加上下文管理功能
 * 不修改原有的prompts.ts，而是在其基础上增强
 */
export class PromptEnhancer {
  private contextWrapper: ContextWrapper;
  private config: Config;
  private todoService: TodoService;

  constructor(config: Config) {
    this.config = config;
    this.contextWrapper = new ContextWrapper(config);
    this.todoService = new TodoService();
  }

  /**
   * 初始化增强器
   */
  async initialize(): Promise<void> {
    await this.contextWrapper.initialize();
  }

  /**
   * 生成增强的系统提示
   * 包含基础系统提示词、任务管理和动态上下文
   */
  async getEnhancedSystemPrompt(userMessage?: string): Promise<string> {
    // 获取原始的用户内存
    const originalMemory = this.config.getUserMemory();
    
    // 获取基础系统提示词
    const { getCoreSystemPrompt } = await import('../core/prompts.js');
    let basePrompt = getCoreSystemPrompt(originalMemory);
    
    // 检查是否为OpenAI模式，如果是，替换工具引导
    const isOpenAIMode = this.isOpenAIMode();
    if (isOpenAIMode) {
      basePrompt = this.adaptPromptForOpenAI(basePrompt);
    }
    
    // 获取当前任务信息
    const currentTaskPrompt = await this.generateCurrentTaskPrompt();
    
    // 获取动态上下文（通过StandardContextIntegrator）
    let dynamicContextContent = '';
    try {
      const standardIntegrator = this.config.getContextManager().getStandardContextIntegrator();
      if (standardIntegrator) {
        const fullContext = await standardIntegrator.getStandardContext({ includeProjectDiscovery: false });
        dynamicContextContent = standardIntegrator.formatStandardContextForModel(fullContext);
      }
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.log('[PromptEnhancer] Failed to get dynamic context:', error);
      }
    }
    
    // 构建最终的系统提示
    const sections = [basePrompt];
    
    if (currentTaskPrompt) {
      sections.push(currentTaskPrompt);
    }
    
    // 添加模式相关的提示
    if (this.contextWrapper.isInMaintenanceMode()) {
      sections.push(this.generateTaskModePrompt());
    } else {
      sections.push(this.generateNonMaintenanceModePrompt());
    }
    
    // 添加动态上下文
    if (dynamicContextContent && dynamicContextContent.trim()) {
      sections.push(`\n${'═'.repeat(100)}\n║                              📋 CURRENT CONTEXT SECTION                              ║\n${'═'.repeat(100)}\n\n${dynamicContextContent}\n\n${'═'.repeat(100)}\n║                            END OF CONTEXT SECTION                            ║\n${'═'.repeat(100)}`);
    }
    
    return sections.join('\n\n');
  }

  /**
   * 生成当前任务提示
   */
  private async generateCurrentTaskPrompt(): Promise<string> {
    try {
      const currentTask = await this.todoService.getCurrentTask();
      if (!currentTask) {
        return '';
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
      return '';
    }
  }

  /**
   * 生成任务维护模式的系统提示
   */
  private generateTaskModePrompt(): string {
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

  /**
   * 生成非维护模式的系统提示
   */
  private generateNonMaintenanceModePrompt(): string {
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

  /**
   * 生成工具调用时的上下文提示
   */
  generateToolCallPrompt(): string {
    return this.contextWrapper.generateToolCallContext();
  }

  /**
   * 获取上下文包装器（用于其他组件访问）
   */
  getContextWrapper(): ContextWrapper {
    return this.contextWrapper;
  }

  /**
   * 检测是否为OpenAI模式
   */
  private isOpenAIMode(): boolean {
    // 检查配置或环境变量来确定是否为OpenAI模式
    try {
      const geminiClient = this.config.getGeminiClient();
      // 如果有hijack适配器，说明是OpenAI模式
      return !!(geminiClient as any)?.hijackAdapter;
    } catch {
      // 如果无法获取客户端信息，检查环境变量
      return !!(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL);
    }
  }

  /**
   * 将系统提示适配为OpenAI兼容格式
   */
  private adaptPromptForOpenAI(basePrompt: string): string {
    if (this.config.getDebugMode()) {
      console.log('[PromptEnhancer] Adapting prompt for OpenAI mode');
    }

    // 替换Gemini格式的工具调用指导为OpenAI格式
    let adaptedPrompt = basePrompt;

    // 替换工具调用格式指导
    const toolCallSection = `# 🔧 CRITICAL: Tool Call Format
**MANDATORY TOOL CALL SYNTAX**: All tool calls MUST use this exact format:
\`[tool_call: tool_name for parameters]\`

**EXAMPLES**:
- \`[tool_call: glob for pattern '**/*.py']\`
- \`[tool_call: read_file for '/path/to/file.py']\`
- \`[tool_call: run_shell_command for 'ls -la']\`
- \`[tool_call: todo for action 'create_list' tasks ["task1", "task2"]]\`

**✅ ALWAYS USE**: The exact [tool_call: ...] format above for ALL tool calls.
**TEMPLATE**: \`[tool_call: TOOL_NAME for PARAMETERS]\``;

    const openaiToolCallSection = `# 🔧 CRITICAL: Tool Usage in OpenAI Mode
**TOOL AVAILABILITY**: You have access to function calling tools that will be provided in the OpenAI function call format. 

**FUNCTION CALLING**: When you need to use tools, simply call the appropriate function with the required parameters. The system will execute the function and return results.

**AVAILABLE TOOLS**: 
- **list_directory**: List contents of directories
- **read_file**: Read contents of files
- **write_file**: Create or modify files  
- **search_file_content**: Search for patterns in files
- **glob**: Find files matching patterns
- **replace**: Find and replace text in files
- **run_shell_command**: Execute shell commands
- **web_fetch**: Fetch content from URLs
- **google_web_search**: Search the web
- **create_tasks**: Create task lists for complex work
- **save_memory**: Save information for future reference
- **read_many_files**: Read multiple files efficiently

**USAGE EXAMPLES**:
- To read a file: Call read_file function with file_path parameter
- To search files: Call search_file_content function with pattern parameter  
- To create tasks: Call create_tasks function with tasks array parameter
- To run commands: Call run_shell_command function with command parameter

**⚠️ IMPORTANT**: Use function calls naturally based on your needs. The system will handle tool execution automatically.`;

    // 替换工具调用指导部分
    adaptedPrompt = adaptedPrompt.replace(toolCallSection, openaiToolCallSection);

    // 移除其他Gemini特定的工具格式引用
    adaptedPrompt = adaptedPrompt.replace(/\[tool_call:[^\]]+\]/g, 'appropriate function calls');
    adaptedPrompt = adaptedPrompt.replace(/`\[tool_call:/g, 'function call for');
    adaptedPrompt = adaptedPrompt.replace(/\]`/g, '');

    // 更新任务创建指导
    adaptedPrompt = adaptedPrompt.replace(
      /\*\*PREFERRED SYNTAX FOR COMPLEX DEVELOPMENT TASKS\*\*:[^`]*`[^`]*`/,
      '**PREFERRED APPROACH FOR COMPLEX DEVELOPMENT TASKS**: Call create_tasks function with template parameter "explore-plan-code-test" and autoContext true'
    );

    adaptedPrompt = adaptedPrompt.replace(
      /\*\*FALLBACK SYNTAX FOR CUSTOM TASKS\*\*:[^`]*`[^`]*`/,
      '**CUSTOM TASK CREATION**: Call create_tasks function with tasks array parameter containing task descriptions'
    );

    if (this.config.getDebugMode()) {
      console.log('[PromptEnhancer] ✅ Prompt adapted for OpenAI function calling format');
    }

    return adaptedPrompt;
  }
}
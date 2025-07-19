/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { TodoService } from '../context/todoService.js';
import { TaskItem, ContextManager } from '../context/contextManager.js';
import { WorkflowTemplateService, BUILTIN_TEMPLATES } from '../context/workflowTemplates.js';
import { ContextDiscoveryService } from '../context/contextDiscovery.js';
import { StandardContextIntegrator } from '../context/standardContextIntegrator.js';

export interface CreateTasksParams {
  tasks?: string[];
  template?: string;
  autoContext?: boolean;
}

/**
 * Simple tool to create a task list
 */
export class CreateTasksTool extends BaseTool<CreateTasksParams, ToolResult> {
  static readonly Name = 'create_tasks';
  private todoService: TodoService;
  private contextManager: ContextManager | null;
  private config: Config | null;
  private templateService: WorkflowTemplateService;
  private contextDiscovery: ContextDiscoveryService | null;

  constructor(config?: Config) {
    super(
      'create_tasks',
      '创建完整的任务分解列表',
      '将复杂目标分解为多个具体任务，创建完整的任务列表。每个任务应该是独立可执行的步骤。',
      {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '任务列表数组，将大目标分解为3-8个具体的执行步骤。每个任务描述应简洁明确，建议不超过30个字符。\n\n**正确格式示例**：\n["分析项目结构", "设计接口方案", "实现核心功能", "编写测试代码", "集成调试"]\n\n**重要**：必须是有效的JSON数组格式，每个任务用双引号包围。工具调用格式应为：{"tasks": ["任务1", "任务2", "任务3"]}',
          },
          template: {
            type: Type.STRING,
            description: '工作流模板ID，如: explore-plan-code-test, project-analysis, bug-fix',
          },
          autoContext: {
            type: Type.BOOLEAN,
            description: '是否自动收集项目上下文信息（默认true）',
          }
        }
      }
    );
    
    this.todoService = new TodoService(process.cwd());
    this.config = config || null;
    this.templateService = new WorkflowTemplateService(process.cwd());
    
    // Initialize context integrator if config is available
    if (config) {
      try {
        this.contextManager = config.getContextManager();
        this.contextDiscovery = new ContextDiscoveryService(config, process.cwd());
      } catch (error) {
        // Context manager not available, create a fallback
        this.contextManager = new ContextManager(process.cwd(), false);
        this.contextDiscovery = null;
      }
    } else {
      // No config provided, create a fallback
      this.contextManager = new ContextManager(process.cwd(), false);
      this.contextDiscovery = null;
    }
  }

  /**
   * Parse string input into CreateTasksParams
   * Handles malformed JSON strings from tool calls
   */
  private parseStringInput(input: string): CreateTasksParams {
    if (!input || typeof input !== 'string') {
      throw new Error('无效的输入参数');
    }

    // 规范化输入：移除多余的空格和换行
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    
    if (this.config?.getDebugMode()) {
      console.log(`[CreateTasksTool] 解析输入: "${normalizedInput}"`);
    }

    // 1. 处理标准JSON格式: {"tasks": ["task1", "task2"]}
    try {
      const parsed = JSON.parse(normalizedInput);
      if (parsed && typeof parsed === 'object') {
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          return { tasks: parsed.tasks.filter((task: any) => typeof task === 'string' && task.trim()) };
        }
        if (parsed.template && typeof parsed.template === 'string') {
          return { template: parsed.template };
        }
      }
    } catch (e) {
      // 继续其他解析方法
    }

    // 2. 处理嵌套输入格式: {"input": "..."}
    const inputMatch = normalizedInput.match(/\{\s*"input"\s*:\s*"(.+?)"\s*\}/);
    if (inputMatch && inputMatch[1]) {
      try {
        return this.parseStringInput(inputMatch[1]);
      } catch (e) {
        // 继续其他解析方法
      }
    }

    // 3. 处理不完整的JSON: {"tasks": ["task1", "task2"
    if (normalizedInput.includes('"tasks"') && normalizedInput.includes('[')) {
      try {
        const fixedJson = this.fixIncompleteJson(normalizedInput);
        const parsed = JSON.parse(fixedJson);
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          return { tasks: parsed.tasks.filter((task: any) => typeof task === 'string' && task.trim()) };
        }
      } catch (e) {
        // 继续其他解析方法
      }
    }

    // 4. 处理template格式
    const templateMatch = normalizedInput.match(/template\s*[:"']\s*([^"'}]+)/);
    if (templateMatch && templateMatch[1]) {
      return { template: templateMatch[1].replace(/["}]/g, '') };
    }

    // 5. 最后尝试：将整个输入作为单个任务
    if (normalizedInput.length > 0) {
      return { tasks: [normalizedInput] };
    }

    throw new Error('无法解析输入参数');
  }

  /**
   * 修复不完整的JSON
   */
  private fixIncompleteJson(input: string): string {
    let fixed = input.trim();
    
    // 统计括号和引号
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    const doubleQuotes = (fixed.match(/"/g) || []).length;
    
    // 如果双引号数量是奇数，添加一个引号
    if (doubleQuotes % 2 === 1) {
      fixed += '"';
    }
    
    // 补充缺失的括号
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed += ']';
    }
    
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed += '}';
    }
    
    return fixed;
  }


  async execute(params: CreateTasksParams | string): Promise<ToolResult> {
    // Handle string input that might be malformed JSON
    let parsedParams: CreateTasksParams;
    if (typeof params === 'string') {
      parsedParams = this.parseStringInput(params);
    } else {
      parsedParams = params;
    }
    
    let { tasks, template, autoContext = true } = parsedParams;
    
    // **IMPORTANT**: Check task maintenance mode status - STRICTLY FORBIDDEN
    if (this.contextManager?.isInMaintenanceMode()) {
      const currentTask = this.contextManager.getCurrentTask();
      const context = this.contextManager.getContext();
      const totalTasks = context.taskList?.tasks?.length || 0;
      const completedTasks = context.taskList?.tasks?.filter(t => t.status === 'completed').length || 0;
      
      // Log the violation attempt
      console.warn(`[CreateTasksTool] VIOLATION: Attempted to create new task list while in maintenance mode`);
      console.warn(`[CreateTasksTool] Current task: ${currentTask?.description || 'none'}`);
      console.warn(`[CreateTasksTool] Progress: ${completedTasks}/${totalTasks}`);
      
      return {
        llmContent: JSON.stringify({
          error: 'forbidden_in_maintenance_mode',
          currentTask: currentTask,
          progress: `${completedTasks}/${totalTasks}`,
          message: '🚫 严格禁止：已处于任务维护模式，绝对不能创建新的任务列表！'
        }),
        returnDisplay: `🚫 **严格禁止**: 已处于任务维护模式，绝对不能创建新的任务列表！

📋 **当前任务列表**:
   • 总任务数: ${totalTasks}
   • 已完成: ${completedTasks}
   • 剩余: ${totalTasks - completedTasks}

🎯 **当前任务**: ${currentTask?.description || '未知'} (${currentTask?.status || '未知'})

✅ **正确操作**:
   • \`get_current_task\` - 查看当前任务详情
   • \`finish_current_task\` - 完成当前任务
   • \`insert_task\` - 添加细化任务
   • 直接执行当前任务的具体步骤

❌ **禁止操作**:
   • create_tasks - 绝对禁止重复创建任务列表
   • 任何形式的任务重新规划

💡 **请专注于完成现有任务列表中的各项任务！**`
      };
    }
    
    // Validate inputs
    if (!tasks && !template) {
      throw new Error('必须提供任务列表或模板ID');
    }

    if (tasks && tasks.length === 0) {
      throw new Error('任务列表不能为空');
    }

    // Validate and fix task descriptions if provided
    if (tasks) {
      // Handle malformed JSON arrays - attempt to fix common formatting issues
      if (!Array.isArray(tasks)) {
        // Try to extract tasks from malformed JSON string
        const tasksStr = JSON.stringify(tasks);
        console.log(`[CreateTasks] Attempting to fix malformed tasks parameter: ${tasksStr}`);
        
        // Look for patterns like 'tasks ["task1", "task2"' and extract actual task descriptions
        const taskPattern = /"([^"]+)"/g;
        const extractedTasks = [];
        let match;
        while ((match = taskPattern.exec(tasksStr)) !== null) {
          const task = match[1].trim();
          // Skip meta-strings like "tasks [" and only keep actual task descriptions
          if (task && !task.includes('tasks [') && !task.includes('[') && !task.includes(']')) {
            extractedTasks.push(task);
          }
        }
        
        if (extractedTasks.length > 0) {
          console.log(`[CreateTasks] Extracted ${extractedTasks.length} tasks: ${JSON.stringify(extractedTasks)}`);
          // Use the corrected tasks array
          parsedParams.tasks = extractedTasks;
          tasks = extractedTasks;
        } else {
          throw new Error(`参数格式错误：tasks必须是字符串数组，收到: ${tasksStr}。请使用格式: ["任务1", "任务2", "任务3"]`);
        }
      }
      
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (typeof task !== 'string') {
          throw new Error(`任务${i + 1}必须是字符串，收到: ${JSON.stringify(task)}`);
        }
        if (!task || task.trim().length === 0) {
          throw new Error(`任务${i + 1}描述不能为空`);
        }
        if (task.length > 100) {
          throw new Error(`任务${i + 1}描述"${task}"超过100个字符限制`);
        }
      }
    }

    // **ALWAYS** use StandardContextIntegrator for comprehensive context management
    // Only fallback if config is completely unavailable
    if (!this.config) {
      throw new Error('配置不可用，无法创建任务');
    }
    
    const contextIntegrator = new StandardContextIntegrator(this.config, process.cwd());
    
    try {
      const result = await contextIntegrator.createTasksWithContext(
        tasks || [],
        template,
        autoContext
      );

      // Format comprehensive output with full context
      const fullContext = contextIntegrator.formatStandardContextForModel(result.context);
      
      const displayMessage = `✅ 已创建 ${result.tasks.length} 个任务${template ? ` (使用模板: ${template})` : ''}

🎯 **当前任务**: ${result.tasks[0]?.description || ''}
📊 **进度**: ${result.tasks.filter(t => t.status === 'completed').length}/${result.tasks.length} 已完成

🚀 任务维护模式已激活！`;

      return {
        llmContent: fullContext,
        returnDisplay: displayMessage,
      };
      
    } catch (error) {
      console.error('[CreateTasksTool] Context integration failed:', error);
      
      // Return error instead of silent fallback to simple mode
      return {
        llmContent: JSON.stringify({
          error: 'context_integration_failed',
          message: `上下文集成失败: ${error instanceof Error ? error.message : String(error)}`
        }),
        returnDisplay: `❌ **错误**: 任务创建失败
        
🔍 **原因**: 上下文集成失败
📝 **详情**: ${error instanceof Error ? error.message : String(error)}

💡 **建议**: 
- 检查项目配置
- 确保工作目录正确
- 重试任务创建`
      };
    }
  }
}
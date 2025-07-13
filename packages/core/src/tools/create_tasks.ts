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
      '创建任务列表',
      '创建新的任务列表，支持工作流模板和自动上下文发现',
      {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '任务列表，每个任务描述不超过20个字符（当使用template时可选）',
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


  async execute(params: CreateTasksParams): Promise<ToolResult> {
    const { tasks, template, autoContext = true } = params;
    
    // Validate inputs
    if (!tasks && !template) {
      throw new Error('必须提供任务列表或模板ID');
    }

    if (tasks && tasks.length === 0) {
      throw new Error('任务列表不能为空');
    }

    // Validate task descriptions if provided
    if (tasks) {
      for (const task of tasks) {
        if (!task || task.trim().length === 0) {
          throw new Error('任务描述不能为空');
        }
        if (task.length > 20) {
          throw new Error(`任务描述"${task}"超过20个字符限制`);
        }
      }
    }

    // Use StandardContextIntegrator for comprehensive context management
    if (this.config && this.contextDiscovery) {
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

📊 **项目上下文摘要**:
${result.contextSummary}

📋 **任务列表** (${result.tasks.length} 个):
${result.tasks.map((task, index) => {
  const statusIcon = task.status === 'completed' ? '✅' : 
                    task.status === 'in_progress' ? '🔄' : '⏳';
  return `   ${index + 1}. ${statusIcon} ${task.description} (${task.status})`;
}).join('\n')}

🎯 **当前任务**: ${result.tasks[0]?.description || ''}
📊 **进度**: ${result.tasks.filter(t => t.status === 'completed').length}/${result.tasks.length} 已完成

${autoContext ? `
📄 **完整项目上下文已收集并可用于任务执行**
- 系统环境信息 ✅
- 项目结构分析 ✅  
- 依赖配置信息 ✅
- 项目文档内容 ✅
- 任务管理状态 ✅

💡 **提示**: 模型现在拥有完整的项目上下文，可以更智能地执行任务。
` : ''}`;

        return {
          llmContent: fullContext,
          returnDisplay: displayMessage,
        };
        
      } catch (error) {
        console.error('[CreateTasksTool] Context integration failed:', error);
        // Fall back to simple task creation
      }
    }

    // Fallback: Simple task creation without context integration
    let finalTasks = tasks || [];
    
    // If using template, get tasks from template
    if (template) {
      const templateObj = await this.templateService.getTemplate(template);
      if (templateObj) {
        finalTasks = this.templateService.createTasksFromTemplate(templateObj);
      } else {
        throw new Error(`未找到模板: ${template}`);
      }
    }

    // Create task objects
    const taskObjects = finalTasks.map(description => 
      this.todoService.createTask(description.trim())
    );

    // Save tasks and project metadata
    await this.todoService.saveTasks(taskObjects);
    await this.todoService.saveProjectMeta();

    // Set first task as current
    if (taskObjects.length > 0) {
      await this.todoService.setCurrentTask(taskObjects[0].id);
      await this.todoService.updateTaskStatus(taskObjects[0].id, 'in_progress');
    }

    // Update context manager
    if (this.contextManager) {
      await this.contextManager.createTaskList(taskObjects);
    }

    const displayMessage = `✅ 已创建 ${taskObjects.length} 个任务${template ? ` (使用模板: ${template})` : ''}

📋 **任务列表** (${taskObjects.length} 个):
${taskObjects.map((task, index) => {
  const statusIcon = task.status === 'completed' ? '✅' : 
                    task.status === 'in_progress' ? '🔄' : '⏳';
  return `   ${index + 1}. ${statusIcon} ${task.description} (${task.status})`;
}).join('\n')}

🎯 **当前任务**: ${taskObjects[0]?.description || ''}
📊 **进度**: 0/${taskObjects.length} 已完成

⚠️ **注意**: 简化模式，未收集完整上下文。建议在支持的环境中启用autoContext。`;

    return {
      llmContent: JSON.stringify({
        tasks: taskObjects,
        currentTaskId: taskObjects[0]?.id,
        maintenanceMode: true,
        template,
        contextMode: 'simple'
      }),
      returnDisplay: displayMessage,
    };
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextManager } from './contextManager.js';
import { ContextDiscoveryService, ProjectContext } from './contextDiscovery.js';
import { WorkflowTemplateService, WorkflowTemplate } from './workflowTemplates.js';
import { Config } from '../config/config.js';

export interface SystemContext {
  workingDirectory: string;
  timestamp: string;
  sessionId: string;
  tools: string[];
  capabilities: string[];
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>;
}

export interface StaticContext {
  projectStructure?: string;
  dependencies?: string[];
  documentation?: string[];
  gitStatus?: string;
  globalRules?: string[];
  projectRules?: string[];
  globalMemories?: string[];
  projectMemories?: string[];
}

export interface DynamicContext {
  recentOperations: string[];
  errorHistory: string[];
  userInstructions: string[];
}

export interface TaskContext {
  workflow?: WorkflowTemplate;
  currentTask?: string;
  taskList?: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  progress?: string;
  maintenanceMode: boolean;
}

export interface StandardContext {
  system: SystemContext;
  static: StaticContext;
  dynamic: DynamicContext;
  task: TaskContext;
}

/**
 * 标准化上下文集成器
 * 按照标准结构组织所有上下文信息: {系统上下文},{静态上下文},{动态上下文},{任务上下文}
 */
export class StandardContextIntegrator {
  private config: Config;
  private contextManager: ContextManager;
  private contextDiscovery: ContextDiscoveryService;
  private templateService: WorkflowTemplateService;
  private projectDir: string;
  
  // 缓存静态上下文以避免重复加载内存
  private cachedStaticContext: StaticContext | null = null;
  private staticContextCacheValid: boolean = false;
  
  // 跟踪是否已经为当前会话记录了debug信息
  private debugRecordedForSession: boolean = false;

  constructor(config: Config, projectDir: string = process.cwd()) {
    this.config = config;
    this.projectDir = projectDir;
    this.contextManager = config.getContextManager();
    this.contextDiscovery = new ContextDiscoveryService(config, projectDir);
    this.templateService = new WorkflowTemplateService(projectDir);
  }

  /**
   * 收集系统上下文
   */
  private async getSystemContext(): Promise<SystemContext> {
    const toolRegistry = await this.config.getToolRegistry();
    const tools = toolRegistry.getAllTools().map((tool: any) => tool.name);

    // 获取对话历史
    let conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }> = [];
    
    try {
      // 从现有上下文中获取历史记录
      const existingContext = this.contextManager.getContext();
      if (existingContext.historyRecords && Array.isArray(existingContext.historyRecords)) {
        conversationHistory = existingContext.historyRecords.slice(-10).map((record: any) => {
          const content = record.parts?.[0]?.text || record.content || '';
          return {
            role: record.role || 'user',
            content: this.filterThinkingContent(content), // 过滤<think>标签
            timestamp: record.timestamp || new Date().toISOString()
          };
        });
      }
    } catch (error) {
      console.warn('[StandardContextIntegrator] Failed to get conversation history:', error);
    }

    return {
      workingDirectory: this.projectDir,
      timestamp: new Date().toISOString(),
      sessionId: this.config.getSessionId(),
      tools: tools,
      capabilities: [
        'file_operations',
        'shell_execution', 
        'web_search',
        'memory_management',
        'task_management',
        'workflow_templates'
      ],
      conversationHistory
    };
  }

  /**
   * 收集静态上下文
   */
  private async getStaticContext(includeProjectDiscovery: boolean = false): Promise<StaticContext> {
    // 如果不需要项目发现且缓存有效，直接返回缓存
    if (!includeProjectDiscovery && this.staticContextCacheValid && this.cachedStaticContext) {
      return this.cachedStaticContext;
    }
    
    const context: StaticContext = {};
    
    // 获取现有静态规则和记忆
    const existingContext = this.contextManager.getContext();
    if (existingContext.staticContext.globalRules.length > 0) {
      context.globalRules = existingContext.staticContext.globalRules;
    }
    if (existingContext.staticContext.projectRules.length > 0) {
      context.projectRules = existingContext.staticContext.projectRules;
    }
    if (existingContext.staticContext.globalMemories.length > 0) {
      context.globalMemories = existingContext.staticContext.globalMemories;
    }
    if (existingContext.staticContext.projectMemories.length > 0) {
      context.projectMemories = existingContext.staticContext.projectMemories;
    }

    // 如果需要，进行项目发现
    if (includeProjectDiscovery) {
      try {
        const projectContext = await this.contextDiscovery.discoverFullContext({
          projectStructure: true,
          dependencies: true,
          documentation: true,
          gitStatus: true
        });

        context.projectStructure = projectContext.structure;
        context.dependencies = projectContext.dependencies;
        context.documentation = projectContext.documentation;
        context.gitStatus = projectContext.gitStatus;
      } catch (error) {
        console.error('[StandardContextIntegrator] Failed to discover project context:', error);
      }
    }

    // 如果不需要项目发现，缓存结果
    if (!includeProjectDiscovery) {
      this.cachedStaticContext = context;
      this.staticContextCacheValid = true;
    }

    return context;
  }

  /**
   * 清空静态上下文缓存（当内存更新时调用）
   */
  public invalidateStaticContextCache(): void {
    this.staticContextCacheValid = false;
    this.cachedStaticContext = null;
  }

  /**
   * 重置debug记录状态（用于测试或手动重置）
   */
  public resetDebugRecording(): void {
    this.debugRecordedForSession = false;
  }

  /**
   * 收集动态上下文
   * 动态上下文主要来自ContextAgent基于当前用户输入生成的分层上下文
   */
  private async getDynamicContext(): Promise<DynamicContext> {
    const existingContext = this.contextManager.getContext();
    
    // 从ContextManager获取当前的动态上下文（由ContextAgent注入的分层内容）
    const contextAgentContent = existingContext.dynamicContext || [];
    
    // RuntimeInfo removed as per requirements
    
    // 从历史记录中提取最近的用户指令（用于上下文连贯性）
    const userInstructions = this.extractUserInstructions(existingContext);
    
    // 构建结构化的动态上下文 - 直接使用ContextAgent注入的内容
    const recentOperations: string[] = [];
    
    // 如果有ContextAgent内容，直接使用它们（它们已经是格式化的内容）
    if (contextAgentContent.length > 0) {
      // 直接添加ContextAgent生成的内容，不要重新格式化
      recentOperations.push(...contextAgentContent);
      recentOperations.push(`\n📍 Context updated: ${new Date().toLocaleTimeString()}`);
    } else {
      // 如果没有ContextAgent内容，显示会话基本信息
      recentOperations.push(`📍 Session: ${this.config.getSessionId()}`);
      recentOperations.push(`📂 Working directory: ${this.projectDir}`);
      recentOperations.push(`⏰ No dynamic context available yet`);
    }
    
    return {
      recentOperations,
      errorHistory: this.extractErrorHistory(), // 实际提取错误历史
      userInstructions
    };
  }


  /**
   * 提取错误历史
   */
  private extractErrorHistory(): string[] {
    const errors: string[] = [];
    
    try {
      // 从上下文中收集错误信息
      const existingContext = this.contextManager.getContext();
      
      // 如果有错误记录机制，在这里提取
      // 目前返回一个示例结构
      if (existingContext.dynamicContext && Array.isArray(existingContext.dynamicContext)) {
        const recentErrors = existingContext.dynamicContext
          .filter(item => typeof item === 'string' && item.includes('Error'))
          .slice(-3);
        errors.push(...recentErrors);
      }
      
    } catch (error) {
      errors.push(`Context error collection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return errors;
  }

  /**
   * 收集运行时信息
   */
  // collectRuntimeInfo method removed as RuntimeInfo is no longer needed
  
  /**
   * 从历史记录中提取用户指令
   */
  private extractUserInstructions(existingContext: any): string[] {
    const instructions: string[] = [];
    
    try {
      // 从历史记录中提取最近的用户指令
      if (existingContext.historyRecords && Array.isArray(existingContext.historyRecords)) {
        const recentUserMessages = existingContext.historyRecords
          .filter((record: any) => record.role === 'user')
          .slice(-2) // 最近2条用户消息
          .map((record: any) => {
            const content = record.parts?.[0]?.text || record.content || '';
            return content.length > 100 ? content.substring(0, 100) + '...' : content;
          });
        
        instructions.push(...recentUserMessages);
      }
      
      // 如果没有历史记录，添加默认信息
      if (instructions.length === 0) {
        instructions.push('No recent user instructions available');
      }
      
    } catch (error) {
      instructions.push(`User instruction extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return instructions;
  }

  /**
   * 收集任务上下文
   */
  private async getTaskContext(): Promise<TaskContext> {
    const existingContext = this.contextManager.getContext();
    const taskList = existingContext.taskList;
    
    const context: TaskContext = {
      maintenanceMode: this.contextManager.isInMaintenanceMode()
    };

    if (taskList && taskList.isMaintenanceMode) {
      const currentTask = this.contextManager.getCurrentTask();
      const completedCount = taskList.tasks.filter(t => t.status === 'completed').length;
      
      context.currentTask = currentTask?.description;
      context.taskList = taskList.tasks.map(task => ({
        id: task.id,
        description: task.description,
        status: task.status
      }));
      context.progress = `${completedCount}/${taskList.tasks.length}`;
    }

    return context;
  }

  /**
   * 收集完整的标准化上下文
   */
  async getStandardContext(options: {
    includeProjectDiscovery?: boolean;
    templateId?: string;
  } = {}): Promise<StandardContext> {
    const { includeProjectDiscovery = false, templateId } = options;

    // 并行收集所有上下文
    const [systemContext, staticContext, dynamicContext, taskContext] = await Promise.all([
      this.getSystemContext(),
      this.getStaticContext(includeProjectDiscovery),
      this.getDynamicContext(),
      this.getTaskContext()
    ]);

    // 如果指定了模板，添加模板信息到任务上下文
    if (templateId) {
      const template = await this.templateService.getTemplate(templateId);
      if (template) {
        taskContext.workflow = template;
      }
    }

    return {
      system: systemContext,
      static: staticContext,
      dynamic: dynamicContext,
      task: taskContext
    };
  }

  /**
   * 将标准化上下文格式化为模型可读的字符串
   */
  formatStandardContextForModel(context: StandardContext, saveDebug: boolean = true): string {
    const sections: string[] = [];

    // 1. 系统上下文
    sections.push(this.formatSystemContext(context.system));

    // 2. 静态上下文
    sections.push(this.formatStaticContext(context.static));

    // 3. 动态上下文
    sections.push(this.formatDynamicContext(context.dynamic));

    // 4. 任务上下文
    sections.push(this.formatTaskContext(context.task));

    const formattedContext = sections.join('\n\n' + '▀'.repeat(120) + '\n\n');

    // Save memory context in debug mode only once per session
    if (saveDebug && this.config?.getDebugMode() && !this.debugRecordedForSession) {
      this.saveDebugMemoryContext(context).catch(error => {
        console.error('[StandardContextIntegrator] Failed to save debug memory context:', error);
      });
      this.debugRecordedForSession = true;
      
      if (this.config.getDebugMode()) {
        console.log('[StandardContextIntegrator] Debug memory context recorded for session (one-time)');
      }
    }

    return formattedContext;
  }

  /**
   * 格式化系统上下文
   */
  private formatSystemContext(context: SystemContext): string {
    const sections: string[] = [];

    sections.push(`# 🖥️ 系统上下文 (System Context)
*来源: 当前运行环境和系统状态*

**工作目录**: ${context.workingDirectory}
**会话时间**: ${context.timestamp}
**会话ID**: ${context.sessionId}`);

    // 添加对话历史
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      sections.push(`## 💬 对话历史 (最近${context.conversationHistory.length}条)
*过滤掉思考标签的对话记录*`);
      
      context.conversationHistory.forEach((msg, index) => {
        const role = msg.role === 'user' ? '👤 用户' : 
                    msg.role === 'assistant' ? '🤖 助手' : '⚙️ 系统';
        const content = msg.content.length > 200 ? 
                       msg.content.substring(0, 200) + '...' : 
                       msg.content;
        sections.push(`${index + 1}. ${role}: ${content}`);
      });
    }

    return sections.join('\n\n');
  }

  /**
   * 格式化静态上下文
   */
  private formatStaticContext(context: StaticContext): string {
    const sections: string[] = [];

    sections.push(`# 📋 静态上下文 (Static Context)
*来源: 项目文件、配置和规则*`);

    if (context.globalRules && context.globalRules.length > 0) {
      sections.push(`## 🌍 全局规则 (${context.globalRules.length}个)
*适用于所有项目的通用规则*

${context.globalRules.join('\n\n')}`);
    }

    if (context.projectRules && context.projectRules.length > 0) {
      sections.push(`## 🏠 项目规则 (${context.projectRules.length}个)
*当前项目特定规则*

${context.projectRules.join('\n\n')}`);
    }

    if (context.globalMemories && context.globalMemories.length > 0) {
      sections.push(`## 🧠 全局记忆 (${context.globalMemories.length}个)
*适用于所有项目的知识和经验*

${context.globalMemories.join('\n\n')}`);
    }

    if (context.projectMemories && context.projectMemories.length > 0) {
      sections.push(`## 💡 项目记忆 (${context.projectMemories.length}个)
*当前项目特定的知识和经验*

${context.projectMemories.join('\n\n')}`);
    }

    if (context.projectStructure) {
      sections.push(`## 📁 项目结构
\`\`\`
${context.projectStructure}
\`\`\``);
    }

    if (context.dependencies && context.dependencies.length > 0) {
      sections.push(`## 📦 依赖配置
${context.dependencies.join('\n\n')}`);
    }

    if (context.documentation && context.documentation.length > 0) {
      sections.push(`## 📖 项目文档
${context.documentation.join('\n\n')}`);
    }

    if (context.gitStatus) {
      sections.push(`## 🔗 Git状态
\`\`\`
${context.gitStatus}
\`\`\``);
    }

    if (sections.length === 1) {
      sections.push('*暂无静态上下文信息*');
    }

    return sections.join('\n\n');
  }

  /**
   * 格式化动态上下文
   */
  private formatDynamicContext(context: DynamicContext): string {
    const sections: string[] = [];

    sections.push(`# 🔄 动态上下文 (Dynamic Context)
*来源: 运行时状态和操作历史*`);

    // RuntimeInfo section removed

    if (context.recentOperations.length > 0) {
      sections.push(`## 📝 最近操作
${context.recentOperations.join('\n')}`);
    }

    if (context.errorHistory.length > 0) {
      sections.push(`## ❌ 错误历史
${context.errorHistory.join('\n')}`);
    }

    if (context.userInstructions.length > 0) {
      sections.push(`## 👤 用户指令
${context.userInstructions.join('\n')}`);
    }

    if (sections.length === 1) {
      sections.push('*暂无动态上下文信息*');
    }

    return sections.join('\n\n');
  }

  /**
   * 格式化任务上下文
   */
  private formatTaskContext(context: TaskContext): string {
    const sections: string[] = [];

    sections.push(`# 🎯 任务上下文 (Task Context)
*来源: 当前任务管理状态*`);

    if (context.maintenanceMode) {
      sections.push('**状态**: 任务维护模式已激活');

      if (context.workflow) {
        sections.push(`## 📋 工作流模板
**名称**: ${context.workflow.name}
**描述**: ${context.workflow.description}
**类别**: ${context.workflow.category}`);
      }

      if (context.currentTask) {
        sections.push(`## 🔄 当前任务
**任务**: ${context.currentTask}
**进度**: ${context.progress || '未知'}`);
      }

      if (context.taskList && context.taskList.length > 0) {
        sections.push(`## 📝 任务列表`);
        context.taskList.forEach((task, index) => {
          const statusIcon = task.status === 'completed' ? '✅' : 
                            task.status === 'in_progress' ? '🔄' : '⏳';
          sections.push(`${index + 1}. ${statusIcon} ${task.description} (${task.status})`);
        });
      }

      if (context.currentTask) {
        sections.push(`## 🚨 重要提示
- 当前专注于: "${context.currentTask}"
- 完成后请使用任务工具更新状态
- 使用 finish_current_task 工具完成当前任务`);
      }
    } else {
      sections.push('**状态**: 非任务模式，可自由执行操作');
    }

    return sections.join('\n\n');
  }

  /**
   * 创建带有完整上下文的任务
   */
  async createTasksWithContext(
    tasks: string[], 
    templateId?: string,
    autoContext: boolean = true
  ): Promise<{
    tasks: Array<{ id: string; description: string; status: string }>;
    context: StandardContext;
    contextSummary: string;
  }> {
    // 收集完整上下文
    const context = await this.getStandardContext({
      includeProjectDiscovery: autoContext,
      templateId
    });

    // 如果使用模板，从模板创建任务
    let finalTasks = tasks;
    if (templateId) {
      const template = await this.templateService.getTemplate(templateId);
      if (template) {
        finalTasks = this.templateService.createTasksFromTemplate(template);
      }
    }

    // 创建任务对象
    const todoService = new (await import('../context/todoService.js')).TodoService(this.projectDir);
    const taskObjects = finalTasks.map(description => 
      todoService.createTask(description.trim())
    );

    // 保存任务
    await todoService.saveTasks(taskObjects);
    await todoService.saveProjectMeta();

    // 设置第一个任务为当前任务
    if (taskObjects.length > 0) {
      await todoService.setCurrentTask(taskObjects[0].id);
      
      // 直接修改任务状态而不是重新加载文件
      taskObjects[0].status = 'in_progress';
      await todoService.saveTasks(taskObjects);
    }

    // 更新上下文管理器
    await this.contextManager.createTaskList(taskObjects);

    // 生成上下文摘要
    const contextSummary = this.generateContextSummary(context);

    return {
      tasks: taskObjects.map(task => ({
        id: task.id,
        description: task.description,
        status: task.status
      })),
      context,
      contextSummary
    };
  }

  /**
   * 生成上下文摘要
   */
  private generateContextSummary(context: StandardContext): string {
    const parts: string[] = [];

    // 系统信息
    parts.push(`🖥️ 工作目录: ${context.system.workingDirectory}`);
    
    // 项目信息
    if (context.static.projectStructure) {
      parts.push(`📁 项目结构已分析`);
    }
    
    if (context.static.dependencies && context.static.dependencies.length > 0) {
      parts.push(`📦 发现 ${context.static.dependencies.length} 个依赖配置文件`);
    }
    
    if (context.static.documentation && context.static.documentation.length > 0) {
      parts.push(`📖 发现 ${context.static.documentation.length} 个文档文件`);
    }

    if (context.static.gitStatus) {
      parts.push(`🔗 Git仓库状态已获取`);
    }

    if (context.static.globalRules && context.static.globalRules.length > 0) {
      parts.push(`🌍 加载 ${context.static.globalRules.length} 个全局规则`);
    }

    if (context.static.projectRules && context.static.projectRules.length > 0) {
      parts.push(`🏠 加载 ${context.static.projectRules.length} 个项目规则`);
    }

    if (context.static.globalMemories && context.static.globalMemories.length > 0) {
      parts.push(`🧠 加载 ${context.static.globalMemories.length} 个全局记忆`);
    }

    if (context.static.projectMemories && context.static.projectMemories.length > 0) {
      parts.push(`💡 加载 ${context.static.projectMemories.length} 个项目记忆`);
    }

    // 任务信息
    if (context.task.maintenanceMode) {
      if (context.task.workflow) {
        parts.push(`📋 使用工作流模板: ${context.task.workflow.name}`);
      }
      if (context.task.taskList) {
        parts.push(`🎯 已创建 ${context.task.taskList.length} 个任务`);
      }
    }

    return parts.join('\n');
  }

  /**
   * 在调试模式下保存记忆部分的上下文到文件
   */
  private async saveDebugMemoryContext(context: StandardContext): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // 创建调试目录 - 使用项目目录而不是用户主目录
      const debugDir = path.join(this.projectDir, '.gemini', 'debug', 'memory-contexts');
      await fs.mkdir(debugDir, { recursive: true });

      // 生成文件名（包含时间戳）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionId = context.system.sessionId.substring(0, 8);
      const filename = `memory-context-${sessionId}-${timestamp}.md`;
      const filepath = path.join(debugDir, filename);

      // 提取记忆部分的上下文
      const memoryContext = this.extractMemoryContext(context);

      // 保存到文件
      await fs.writeFile(filepath, memoryContext, 'utf-8');

      console.log(`[Debug] Memory context saved: ${filepath}`);
    } catch (error) {
      console.error('[Debug] Failed to save memory context:', error);
    }
  }

  /**
   * 提取记忆相关的上下文内容
   */
  private extractMemoryContext(context: StandardContext): string {
    const sections: string[] = [];

    // 会话信息
    sections.push(`# Debug Memory Context Export
**Session ID**: ${context.system.sessionId}
**Timestamp**: ${context.system.timestamp}
**Working Directory**: ${context.system.workingDirectory}

---`);

    // 全局记忆
    if (context.static.globalMemories && context.static.globalMemories.length > 0) {
      sections.push(`## 🌍 全局记忆 (${context.static.globalMemories.length}个)

${context.static.globalMemories.join('\n\n')}`);
    }

    // 项目记忆
    if (context.static.projectMemories && context.static.projectMemories.length > 0) {
      sections.push(`## 🏠 项目记忆 (${context.static.projectMemories.length}个)

${context.static.projectMemories.join('\n\n')}`);
    }

    // 全局规则
    if (context.static.globalRules && context.static.globalRules.length > 0) {
      sections.push(`## 🌍 全局规则 (${context.static.globalRules.length}个)

${context.static.globalRules.join('\n\n')}`);
    }

    // 项目规则
    if (context.static.projectRules && context.static.projectRules.length > 0) {
      sections.push(`## 🏠 项目规则 (${context.static.projectRules.length}个)

${context.static.projectRules.join('\n\n')}`);
    }

    // 如果没有记忆内容
    if (!context.static.globalMemories?.length && 
        !context.static.projectMemories?.length && 
        !context.static.globalRules?.length && 
        !context.static.projectRules?.length) {
      sections.push('## 📝 记忆内容\n\n*暂无记忆内容*');
    }

    return sections.join('\n\n');
  }

  /**
   * Filter out <think> tags and their content from text
   * @param content The text to filter
   * @returns Text with <think> tags and their content removed
   */
  private filterThinkingContent(content: string): string {
    // Remove content between <think> and </think> tags (case insensitive, multiline)
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
}
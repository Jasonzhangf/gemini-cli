/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../config/config.js';
import { ContextAgent } from '../context/contextAgent.js';
import { UnifiedToolSystem } from '../tools/UnifiedToolSystem.js';
import { TaskManager } from '../tasks/TaskManager.js';

/**
 * 模块配置接口
 */
export interface ModuleConfig {
  enabled: boolean;
  priority: number;
  dependencies: string[];
  configuration: Record<string, any>;
}

/**
 * 系统模块枚举
 */
export enum SystemModule {
  // 核心模块
  GEMINI_LEGACY = 'gemini_legacy',           // 原Gemini继承相关内容
  SYSTEM_PROMPTS = 'system_prompts',         // 系统提示词组合部分
  STATIC_CONTEXT = 'static_context',         // 静态上下文（全局规则、本地规则等）
  DYNAMIC_CONTEXT = 'dynamic_context',       // 动态上下文（RAG、语义分析等）
  CONVERSATION_HISTORY = 'conversation_history', // 用户对话历史
  TOOL_GUIDANCE = 'tool_guidance',           // 工具引导
  TASK_MANAGEMENT = 'task_management',       // 任务管理
  
  // 扩展模块
  DEBUG_CONTEXT = 'debug_context',           // 调试上下文
  MEMORY_SYSTEM = 'memory_system',           // 记忆系统
  PROJECT_DISCOVERY = 'project_discovery'    // 项目发现
}

/**
 * 系统配置
 */
export interface SystemConfiguration {
  modules: Record<SystemModule, ModuleConfig>;
  globalSettings: {
    debugMode: boolean;
    performanceMode: boolean;
    safeMode: boolean;
  };
}

/**
 * 模块执行结果
 */
export interface ModuleExecutionResult {
  module: SystemModule;
  success: boolean;
  content: string;
  metadata: Record<string, any>;
  executionTime: number;
  error?: string;
}

/**
 * 统一系统编排器
 * 
 * 作为整个系统的唯一入口，负责管理和协调所有子系统：
 * - 原Gemini继承相关内容
 * - 系统提示词组合部分  
 * - 静态上下文
 * - 动态上下文
 * - 用户对话历史
 * - 工具引导
 * - 任务管理
 * 
 * 特点：
 * - 模块化设计，每个模块可独立开启/关闭
 * - 可配置的优先级和依赖关系
 * - 统一的接口和事件系统
 * - 支持热插拔模块替换
 */
export class UnifiedSystemOrchestrator extends EventEmitter {
  private config: Config;
  private systemConfig: SystemConfiguration;
  private moduleExecutors: Map<SystemModule, Function>;
  private moduleCache: Map<SystemModule, { content: string; timestamp: number }>;
  
  // 子系统实例
  private contextAgent: ContextAgent | null = null;
  private toolSystem: UnifiedToolSystem | null = null;
  private taskManager: TaskManager | null = null;
  
  // 执行状态
  private isInitialized: boolean = false;
  private executionInProgress: boolean = false;
  
  constructor(config: Config) {
    super();
    this.config = config;
    this.moduleExecutors = new Map();
    this.moduleCache = new Map();
    
    // 初始化默认系统配置
    this.systemConfig = this.createDefaultConfiguration();
    
    // 注册模块执行器
    this.registerModuleExecutors();
  }

  /**
   * 创建默认系统配置
   */
  private createDefaultConfiguration(): SystemConfiguration {
    const defaultModuleConfig: ModuleConfig = {
      enabled: true,
      priority: 50,
      dependencies: [],
      configuration: {}
    };

    return {
      modules: {
        [SystemModule.GEMINI_LEGACY]: { 
          ...defaultModuleConfig, 
          priority: 10,
          dependencies: []
        },
        [SystemModule.SYSTEM_PROMPTS]: { 
          ...defaultModuleConfig, 
          priority: 20,
          dependencies: [SystemModule.GEMINI_LEGACY]
        },
        [SystemModule.STATIC_CONTEXT]: { 
          ...defaultModuleConfig, 
          priority: 30,
          dependencies: []
        },
        [SystemModule.DYNAMIC_CONTEXT]: { 
          ...defaultModuleConfig, 
          priority: 40,
          dependencies: [SystemModule.STATIC_CONTEXT]
        },
        [SystemModule.CONVERSATION_HISTORY]: { 
          ...defaultModuleConfig, 
          priority: 35,
          dependencies: []
        },
        [SystemModule.TOOL_GUIDANCE]: { 
          ...defaultModuleConfig, 
          priority: 60,
          dependencies: [SystemModule.TASK_MANAGEMENT]
        },
        [SystemModule.TASK_MANAGEMENT]: { 
          ...defaultModuleConfig, 
          priority: 50,
          dependencies: []
        },
        [SystemModule.DEBUG_CONTEXT]: { 
          ...defaultModuleConfig, 
          enabled: false,
          priority: 70,
          dependencies: []
        },
        [SystemModule.MEMORY_SYSTEM]: { 
          ...defaultModuleConfig, 
          priority: 25,
          dependencies: []
        },
        [SystemModule.PROJECT_DISCOVERY]: { 
          ...defaultModuleConfig, 
          priority: 15,
          dependencies: []
        }
      },
      globalSettings: {
        debugMode: this.config.getDebugMode(),
        performanceMode: false,
        safeMode: true
      }
    };
  }

  /**
   * 注册模块执行器
   */
  private registerModuleExecutors(): void {
    this.moduleExecutors.set(SystemModule.GEMINI_LEGACY, this.executeGeminiLegacyModule.bind(this));
    this.moduleExecutors.set(SystemModule.SYSTEM_PROMPTS, this.executeSystemPromptsModule.bind(this));
    this.moduleExecutors.set(SystemModule.STATIC_CONTEXT, this.executeStaticContextModule.bind(this));
    this.moduleExecutors.set(SystemModule.DYNAMIC_CONTEXT, this.executeDynamicContextModule.bind(this));
    this.moduleExecutors.set(SystemModule.CONVERSATION_HISTORY, this.executeConversationHistoryModule.bind(this));
    this.moduleExecutors.set(SystemModule.TOOL_GUIDANCE, this.executeToolGuidanceModule.bind(this));
    this.moduleExecutors.set(SystemModule.TASK_MANAGEMENT, this.executeTaskManagementModule.bind(this));
    this.moduleExecutors.set(SystemModule.DEBUG_CONTEXT, this.executeDebugContextModule.bind(this));
    this.moduleExecutors.set(SystemModule.MEMORY_SYSTEM, this.executeMemorySystemModule.bind(this));
    this.moduleExecutors.set(SystemModule.PROJECT_DISCOVERY, this.executeProjectDiscoveryModule.bind(this));
  }

  /**
   * 初始化系统
   */
  async initialize(projectDir: string, sessionId: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (this.systemConfig.globalSettings.debugMode) {
        console.log('[UnifiedSystemOrchestrator] 开始初始化统一系统编排器...');
      }

      // 初始化子系统
      await this.initializeSubSystems(projectDir, sessionId);
      
      // 验证模块依赖关系
      this.validateModuleDependencies();
      
      this.isInitialized = true;
      
      if (this.systemConfig.globalSettings.debugMode) {
        console.log('[UnifiedSystemOrchestrator] 统一系统编排器初始化完成');
        this.logModuleStatus();
      }
      
      this.emit('initialized', { projectDir, sessionId });
      
    } catch (error) {
      console.error('[UnifiedSystemOrchestrator] 初始化失败:', error);
      this.emit('initializationFailed', { error });
      throw error;
    }
  }

  /**
   * 初始化子系统
   */
  private async initializeSubSystems(projectDir: string, sessionId: string): Promise<void> {
    // 初始化ContextAgent（动态上下文）
    if (this.isModuleEnabled(SystemModule.DYNAMIC_CONTEXT)) {
      this.contextAgent = new ContextAgent({
        config: this.config,
        projectDir,
        sessionId
      });
      await this.contextAgent.initialize();
    }

    // 初始化工具系统
    if (this.isModuleEnabled(SystemModule.TOOL_GUIDANCE) || this.isModuleEnabled(SystemModule.TASK_MANAGEMENT)) {
      this.toolSystem = new UnifiedToolSystem(sessionId);
      this.taskManager = this.toolSystem.getTaskManager();
    }
  }

  /**
   * 验证模块依赖关系
   */
  private validateModuleDependencies(): void {
    for (const [module, config] of Object.entries(this.systemConfig.modules)) {
      if (!config.enabled) continue;
      
      for (const dependency of config.dependencies) {
        const depConfig = this.systemConfig.modules[dependency as SystemModule];
        if (!depConfig || !depConfig.enabled) {
          if (this.systemConfig.globalSettings.safeMode) {
            console.warn(`[UnifiedSystemOrchestrator] 模块 ${module} 的依赖 ${dependency} 未启用，将禁用该模块`);
            config.enabled = false;
          } else {
            console.warn(`[UnifiedSystemOrchestrator] 模块 ${module} 的依赖 ${dependency} 未启用，但系统将继续运行`);
          }
        }
      }
    }
  }

  /**
   * 生成完整系统上下文
   * 
   * @param userInput 用户输入
   * @param conversationHistory 对话历史
   * @returns 完整的系统上下文字符串
   */
  async generateSystemContext(
    userInput?: string, 
    conversationHistory?: any[]
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('UnifiedSystemOrchestrator 尚未初始化');
    }

    if (this.executionInProgress) {
      console.warn('[UnifiedSystemOrchestrator] 已有执行进程在运行，等待完成...');
      await this.waitForExecution();
    }

    this.executionInProgress = true;
    
    try {
      const startTime = Date.now();
      const results: ModuleExecutionResult[] = [];
      
      // 获取启用的模块并按优先级排序
      const enabledModules = this.getEnabledModulesSorted();
      
      if (this.systemConfig.globalSettings.debugMode) {
        console.log(`[UnifiedSystemOrchestrator] 开始执行 ${enabledModules.length} 个模块`);
      }

      // 并行执行独立模块，串行执行有依赖的模块
      const executionGroups = this.groupModulesByDependencies(enabledModules);
      
      for (const group of executionGroups) {
        const groupResults = await Promise.all(
          group.map(module => this.executeModule(module, userInput, conversationHistory))
        );
        results.push(...groupResults);
      }

      // 组合最终上下文
      const finalContext = this.combineModuleResults(results);
      
      const totalTime = Date.now() - startTime;
      
      if (this.systemConfig.globalSettings.debugMode) {
        console.log(`[UnifiedSystemOrchestrator] 系统上下文生成完成，耗时 ${totalTime}ms`);
      }
      
      this.emit('contextGenerated', { 
        results, 
        finalContext, 
        executionTime: totalTime,
        userInput 
      });
      
      return finalContext;
      
    } finally {
      this.executionInProgress = false;
    }
  }

  /**
   * 执行单个模块
   */
  private async executeModule(
    module: SystemModule, 
    userInput?: string, 
    conversationHistory?: any[]
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    
    try {
      const executor = this.moduleExecutors.get(module);
      if (!executor) {
        throw new Error(`模块执行器不存在: ${module}`);
      }

      const content = await executor(userInput, conversationHistory);
      const executionTime = Date.now() - startTime;
      
      const result: ModuleExecutionResult = {
        module,
        success: true,
        content: content || '',
        metadata: {
          cacheHit: false,
          executionTime
        },
        executionTime
      };

      // 缓存结果（如果启用缓存）
      if (this.shouldCacheModule(module)) {
        this.moduleCache.set(module, {
          content: result.content,
          timestamp: Date.now()
        });
      }

      if (this.systemConfig.globalSettings.debugMode) {
        console.log(`[UnifiedSystemOrchestrator] 模块 ${module} 执行成功，耗时 ${executionTime}ms`);
      }

      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[UnifiedSystemOrchestrator] 模块 ${module} 执行失败:`, error);
      
      return {
        module,
        success: false,
        content: '',
        metadata: { executionTime },
        executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * 执行Gemini遗留模块
   */
  private async executeGeminiLegacyModule(userInput?: string): Promise<string> {
    // 处理原有Gemini相关的配置和设置
    const sections = [];
    
    sections.push('# 🚀 Gemini CLI System');
    sections.push('*Advanced AI-powered development assistant*');
    
    if (this.config.getModel()) {
      sections.push(`**Model**: ${this.config.getModel()}`);
    }
    
    return sections.join('\n');
  }

  /**
   * 执行系统提示词模块
   */
  private async executeSystemPromptsModule(userInput?: string): Promise<string> {
    try {
      // 使用现有的UnifiedPromptManager或类似系统
      const promptManager = this.config.getUnifiedPromptManager?.();
      if (promptManager) {
        return await promptManager.generateSystemPrompt();
      }
      
      // 后备基础提示词
      return '# 🤖 AI Assistant\n您是一个智能编程助手，专注于帮助用户完成开发任务。';
      
    } catch (error) {
      console.warn('[UnifiedSystemOrchestrator] 系统提示词模块执行失败，使用默认提示词');
      return '# 🤖 AI Assistant\n您是一个智能编程助手。';
    }
  }

  /**
   * 执行静态上下文模块
   */
  private async executeStaticContextModule(userInput?: string): Promise<string> {
    try {
      const contextManager = this.config.getContextManager();
      const staticContext = contextManager.getStaticContext();
      
      const sections = [];
      
      if (staticContext.globalrules) {
        sections.push('## 📋 全局规则');
        sections.push(staticContext.globalrules);
      }
      
      if (staticContext.localrules) {
        sections.push('## 📂 项目规则');
        sections.push(staticContext.localrules);
      }
      
      if (staticContext.memories?.length > 0) {
        sections.push('## 🧠 记忆片段');
        sections.push(staticContext.memories.slice(0, 3).join('\n'));
      }
      
      return sections.length > 0 ? sections.join('\n\n') : '';
      
    } catch (error) {
      console.warn('[UnifiedSystemOrchestrator] 静态上下文模块执行失败:', error);
      return '';
    }
  }

  /**
   * 执行动态上下文模块
   */
  private async executeDynamicContextModule(userInput?: string): Promise<string> {
    if (!this.contextAgent) {
      return '';
    }
    
    try {
      // ContextAgent作为动态上下文的唯一入口
      const dynamicContext = await this.contextAgent.getContextForPrompt(userInput);
      return dynamicContext;
      
    } catch (error) {
      console.warn('[UnifiedSystemOrchestrator] 动态上下文模块执行失败:', error);
      return '';
    }
  }

  /**
   * 执行对话历史模块
   */
  private async executeConversationHistoryModule(
    userInput?: string, 
    conversationHistory?: any[]
  ): Promise<string> {
    if (!conversationHistory || conversationHistory.length === 0) {
      return '';
    }
    
    const sections = ['## 💬 对话历史'];
    const recentHistory = conversationHistory.slice(-3); // 最近3条
    
    for (const item of recentHistory) {
      if (item.type === 'user') {
        sections.push(`**用户**: ${item.content.substring(0, 100)}...`);
      } else if (item.type === 'assistant') {
        sections.push(`**助手**: ${item.content.substring(0, 100)}...`);
      }
    }
    
    return sections.join('\n');
  }

  /**
   * 执行工具引导模块
   */
  private async executeToolGuidanceModule(userInput?: string): Promise<string> {
    if (!this.toolSystem) {
      return '';
    }
    
    try {
      const toolDefinitions = this.toolSystem.getToolDefinitions();
      
      if (toolDefinitions.length === 0) {
        return '';
      }
      
      const sections = ['## 🛠️ 可用工具'];
      
      for (const tool of toolDefinitions.slice(0, 5)) { // 最多显示5个
        sections.push(`- **${tool.name}**: ${tool.description || '无描述'}`);
      }
      
      return sections.join('\n');
      
    } catch (error) {
      console.warn('[UnifiedSystemOrchestrator] 工具引导模块执行失败:', error);
      return '';
    }
  }

  /**
   * 执行任务管理模块
   */
  private async executeTaskManagementModule(userInput?: string): Promise<string> {
    if (!this.taskManager) {
      return '';
    }
    
    try {
      const currentTask = this.taskManager.getCurrentTask();
      const taskList = this.taskManager.getTaskList();
      
      const sections = [];
      
      if (currentTask) {
        sections.push('## 📋 当前任务');
        sections.push(`**${currentTask.title}**: ${currentTask.description}`);
        sections.push(`状态: ${currentTask.status}, 优先级: ${currentTask.priority}`);
      }
      
      if (taskList.length > 1) {
        sections.push('## 📝 任务列表');
        const pendingTasks = taskList.filter(t => t.status === 'pending').slice(0, 3);
        for (const task of pendingTasks) {
          sections.push(`- ${task.title} (${task.priority})`);
        }
      }
      
      return sections.join('\n');
      
    } catch (error) {
      console.warn('[UnifiedSystemOrchestrator] 任务管理模块执行失败:', error);
      return '';
    }
  }

  /**
   * 执行调试上下文模块
   */
  private async executeDebugContextModule(userInput?: string): Promise<string> {
    if (!this.systemConfig.globalSettings.debugMode) {
      return '';
    }
    
    const sections = ['## 🐛 调试信息'];
    
    sections.push(`**系统状态**: 已初始化`);
    sections.push(`**启用模块**: ${this.getEnabledModules().length}`);
    sections.push(`**缓存条目**: ${this.moduleCache.size}`);
    
    return sections.join('\n');
  }

  /**
   * 执行记忆系统模块
   */
  private async executeMemorySystemModule(userInput?: string): Promise<string> {
    // 集成现有的记忆系统
    return '';
  }

  /**
   * 执行项目发现模块
   */
  private async executeProjectDiscoveryModule(userInput?: string): Promise<string> {
    try {
      const projectInfo = this.config.getProjectInfo?.();
      if (projectInfo) {
        return `## 📂 项目信息\n**名称**: ${projectInfo.name}\n**类型**: ${projectInfo.type || '未知'}`;
      }
      return '';
    } catch (error) {
      return '';
    }
  }

  // === 工具方法 ===

  /**
   * 检查模块是否启用
   */
  isModuleEnabled(module: SystemModule): boolean {
    return this.systemConfig.modules[module]?.enabled || false;
  }

  /**
   * 启用/禁用模块
   */
  setModuleEnabled(module: SystemModule, enabled: boolean): void {
    if (this.systemConfig.modules[module]) {
      this.systemConfig.modules[module].enabled = enabled;
      this.emit('moduleStatusChanged', { module, enabled });
    }
  }

  /**
   * 获取启用的模块列表（按优先级排序）
   */
  private getEnabledModulesSorted(): SystemModule[] {
    return Object.entries(this.systemConfig.modules)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority)
      .map(([module, _]) => module as SystemModule);
  }

  /**
   * 获取启用的模块列表
   */
  getEnabledModules(): SystemModule[] {
    return Object.entries(this.systemConfig.modules)
      .filter(([_, config]) => config.enabled)
      .map(([module, _]) => module as SystemModule);
  }

  /**
   * 按依赖关系分组模块
   */
  private groupModulesByDependencies(modules: SystemModule[]): SystemModule[][] {
    const groups: SystemModule[][] = [];
    const processed = new Set<SystemModule>();
    
    // 简单实现：按优先级分组，后续可以实现更复杂的依赖解析
    for (const module of modules) {
      if (!processed.has(module)) {
        groups.push([module]);
        processed.add(module);
      }
    }
    
    return groups;
  }

  /**
   * 组合模块结果
   */
  private combineModuleResults(results: ModuleExecutionResult[]): string {
    const sections: string[] = [];
    
    // 按优先级顺序组合内容
    const successfulResults = results
      .filter(r => r.success && r.content.trim())
      .sort((a, b) => this.systemConfig.modules[a.module].priority - this.systemConfig.modules[b.module].priority);
    
    for (const result of successfulResults) {
      if (result.content.trim()) {
        sections.push(result.content);
      }
    }
    
    return sections.join('\n\n' + '═'.repeat(80) + '\n\n');
  }

  /**
   * 检查是否应该缓存模块结果
   */
  private shouldCacheModule(module: SystemModule): boolean {
    // 静态内容可以缓存，动态内容不缓存
    const staticModules = [
      SystemModule.GEMINI_LEGACY,
      SystemModule.SYSTEM_PROMPTS,
      SystemModule.STATIC_CONTEXT,
      SystemModule.TOOL_GUIDANCE
    ];
    
    return staticModules.includes(module);
  }

  /**
   * 等待执行完成
   */
  private async waitForExecution(): Promise<void> {
    while (this.executionInProgress) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * 记录模块状态
   */
  private logModuleStatus(): void {
    const enabled = this.getEnabledModules();
    const disabled = Object.keys(this.systemConfig.modules).filter(
      m => !this.isModuleEnabled(m as SystemModule)
    );
    
    console.log(`[UnifiedSystemOrchestrator] 启用模块 (${enabled.length}):`, enabled.join(', '));
    if (disabled.length > 0) {
      console.log(`[UnifiedSystemOrchestrator] 禁用模块 (${disabled.length}):`, disabled.join(', '));
    }
  }

  /**
   * 获取系统配置
   */
  getSystemConfiguration(): SystemConfiguration {
    return JSON.parse(JSON.stringify(this.systemConfig));
  }

  /**
   * 更新系统配置
   */
  updateSystemConfiguration(config: Partial<SystemConfiguration>): void {
    this.systemConfig = { ...this.systemConfig, ...config };
    this.emit('configurationUpdated', { config: this.systemConfig });
  }

  /**
   * 重置模块缓存
   */
  clearModuleCache(): void {
    this.moduleCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * 获取工具系统实例
   */
  getToolSystem(): UnifiedToolSystem | null {
    return this.toolSystem;
  }

  /**
   * 获取上下文代理实例
   */
  getContextAgent(): ContextAgent | null {
    return this.contextAgent;
  }

  /**
   * 获取任务管理器实例
   */
  getTaskManager(): TaskManager | null {
    return this.taskManager;
  }

  /**
   * 检查系统是否已初始化
   */
  isSystemInitialized(): boolean {
    return this.isInitialized;
  }
}
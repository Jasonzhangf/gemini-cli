/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextData, TaskListContext } from './contextManager.js';
import { Content } from '@google/genai';

export interface ContextSnapshot {
  timestamp: string;
  sessionId: string;
  turnNumber: number;
  contextData: ContextDebugInfo;
  modelPrompt?: string;
  userMessage?: string;
}

export interface ContextDebugInfo {
  // 原始内存工具数据
  memoryTool: {
    userMemory: string;
    geminiMdFileCount: number;
    sources: string[];
  };
  
  // 静态上下文数据
  staticContext: {
    projectRules: Array<{ file: string; content: string }>;
    globalRules: Array<{ file: string; content: string }>;
    totalSize: number;
  };
  
  // 动态上下文数据
  dynamicContext: {
    entries: string[];
    totalSize: number;
  };
  
  // 任务管理数据
  taskManagement: {
    isActive: boolean;
    taskList: TaskListContext | null;
    currentTask: any;
    completedCount: number;
    totalCount: number;
  };
  
  // 历史记录统计
  history: {
    recordCount: number;
    userTurns: number;
    modelTurns: number;
    totalTokensEstimate: number;
  };
  
  // 生成的上下文统计
  generated: {
    totalContextSize: number;
    memorySize: number;
    staticSize: number;
    dynamicSize: number;
    taskSize: number;
  };
}

/**
 * 上下文调试器 - 在debug模式下记录和分析上下文数据
 */
export class ContextDebugger {
  private debugDir: string;
  private sessionId: string;
  private turnCounter: number = 0;
  private isEnabled: boolean;

  constructor(sessionId: string, debugMode: boolean = false, projectRoot?: string) {
    this.sessionId = sessionId;
    this.isEnabled = debugMode;
    const baseDir = projectRoot || process.cwd();
    this.debugDir = path.join(baseDir, '.gemini', 'debug', sessionId);
  }

  /**
   * 初始化调试目录
   */
  async initialize(): Promise<void> {
    if (!this.isEnabled) return;
    
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      console.log(`[ContextDebugger] Debug directory initialized: ${this.debugDir}`);
    } catch (error) {
      console.warn('[ContextDebugger] Failed to initialize debug directory:', error);
    }
  }

  /**
   * 分析并保存上下文快照
   */
  async saveContextSnapshot(
    contextData: ContextData,
    userMemory: string,
    geminiMdFileCount: number,
    generatedContext?: string,
    userMessage?: string
  ): Promise<void> {
    if (!this.isEnabled) return;

    this.turnCounter++;
    
    try {
      const debugInfo = this.analyzeContext(contextData, userMemory, geminiMdFileCount, generatedContext);
      
      const snapshot: ContextSnapshot = {
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        turnNumber: this.turnCounter,
        contextData: debugInfo,
        modelPrompt: generatedContext,
        userMessage,
      };

      // 保存JSON格式的详细快照
      const snapshotFile = path.join(this.debugDir, `turn-${this.turnCounter.toString().padStart(3, '0')}.json`);
      await fs.writeFile(snapshotFile, JSON.stringify(snapshot, null, 2), 'utf-8');

      // 保存人类可读的摘要
      const summaryFile = path.join(this.debugDir, `turn-${this.turnCounter.toString().padStart(3, '0')}-summary.md`);
      const summary = this.generateHumanReadableSummary(debugInfo, this.turnCounter);
      await fs.writeFile(summaryFile, summary, 'utf-8');

      // 在控制台打印摘要
      this.printContextSummary(debugInfo, this.turnCounter);

    } catch (error) {
      console.warn('[ContextDebugger] Failed to save context snapshot:', error);
    }
  }

  /**
   * 分析上下文数据
   */
  private analyzeContext(
    contextData: ContextData,
    userMemory: string,
    geminiMdFileCount: number,
    generatedContext?: string
  ): ContextDebugInfo {
    // 分析静态上下文
    const staticContext = this.analyzeStaticContext(contextData.staticContext);
    
    // 分析动态上下文
    const dynamicContext = this.analyzeDynamicContext(contextData.dynamicContext);
    
    // 分析任务管理
    const taskManagement = this.analyzeTaskManagement(contextData.taskList);
    
    // 分析历史记录
    const history = this.analyzeHistory(contextData.historyRecords);
    
    // 计算生成的上下文大小
    const generated = this.analyzeGeneratedContext(
      userMemory,
      staticContext.totalSize,
      dynamicContext.totalSize,
      taskManagement,
      generatedContext
    );

    return {
      memoryTool: {
        userMemory: userMemory || '',
        geminiMdFileCount,
        sources: this.extractMemorySources(userMemory),
      },
      staticContext,
      dynamicContext,
      taskManagement,
      history,
      generated,
    };
  }

  /**
   * 分析静态上下文
   */
  private analyzeStaticContext(staticContext: { 
    globalRules: string[]; 
    projectRules: string[];
    globalMemories: string[];
    projectMemories: string[];
  }): ContextDebugInfo['staticContext'] {
    const projectRules: Array<{ file: string; content: string }> = [];
    const globalRules: Array<{ file: string; content: string }> = [];
    let totalSize = 0;

    // 处理全局规则
    staticContext.globalRules.forEach(context => {
      const lines = context.split('\n');
      const firstLine = lines[0] || '';
      const fileName = firstLine.match(/--- (.+) ---/)?.[1] || 'unknown';
      const content = lines.slice(1).join('\n');
      
      totalSize += context.length;
      globalRules.push({ file: fileName, content });
    });

    // 处理项目规则
    staticContext.projectRules.forEach(context => {
      const lines = context.split('\n');
      const firstLine = lines[0] || '';
      const fileName = firstLine.match(/--- (.+) ---/)?.[1] || 'unknown';
      const content = lines.slice(1).join('\n');
      
      totalSize += context.length;
      projectRules.push({ file: fileName, content });
    });

    // 处理全局记忆
    staticContext.globalMemories.forEach(context => {
      const lines = context.split('\n');
      const firstLine = lines[0] || '';
      const fileName = firstLine.match(/--- (.+) ---/)?.[1] || 'unknown';
      const content = lines.slice(1).join('\n');
      
      totalSize += context.length;
      globalRules.push({ file: fileName, content });
    });

    // 处理项目记忆
    staticContext.projectMemories.forEach(context => {
      const lines = context.split('\n');
      const firstLine = lines[0] || '';
      const fileName = firstLine.match(/--- (.+) ---/)?.[1] || 'unknown';
      const content = lines.slice(1).join('\n');
      
      totalSize += context.length;
      projectRules.push({ file: fileName, content });
    });

    return { projectRules, globalRules, totalSize };
  }

  /**
   * 分析动态上下文
   */
  private analyzeDynamicContext(dynamicContext: string[]): ContextDebugInfo['dynamicContext'] {
    const totalSize = dynamicContext.reduce((sum, entry) => sum + entry.length, 0);
    return { entries: [...dynamicContext], totalSize };
  }

  /**
   * 分析任务管理
   */
  private analyzeTaskManagement(taskList: TaskListContext | null): ContextDebugInfo['taskManagement'] {
    if (!taskList) {
      return {
        isActive: false,
        taskList: null,
        currentTask: null,
        completedCount: 0,
        totalCount: 0,
      };
    }

    const completedCount = taskList.tasks.filter(t => t.status === 'completed').length;
    const currentTask = taskList.tasks.find(t => t.status !== 'completed') || null;

    return {
      isActive: taskList.isMaintenanceMode,
      taskList,
      currentTask,
      completedCount,
      totalCount: taskList.tasks.length,
    };
  }

  /**
   * 分析历史记录
   */
  private analyzeHistory(historyRecords: Content[]): ContextDebugInfo['history'] {
    let userTurns = 0;
    let modelTurns = 0;
    let totalTokensEstimate = 0;

    historyRecords.forEach(record => {
      if (record.role === 'user') {
        userTurns++;
      } else if (record.role === 'model') {
        modelTurns++;
      }
      
      // 估算token数量（粗略：每4个字符约1个token）
      const text = record.parts?.map(p => p.text || '').join('') || '';
      totalTokensEstimate += Math.ceil(text.length / 4);
    });

    return {
      recordCount: historyRecords.length,
      userTurns,
      modelTurns,
      totalTokensEstimate,
    };
  }

  /**
   * 分析生成的上下文
   */
  private analyzeGeneratedContext(
    userMemory: string,
    staticSize: number,
    dynamicSize: number,
    taskManagement: ContextDebugInfo['taskManagement'],
    generatedContext?: string
  ): ContextDebugInfo['generated'] {
    const memorySize = userMemory?.length || 0;
    const taskSize = taskManagement.isActive ? 
      JSON.stringify(taskManagement.taskList).length + 500 : 0; // 估算任务相关文本大小
    
    const totalContextSize = generatedContext?.length || 
      (memorySize + staticSize + dynamicSize + taskSize);

    return {
      totalContextSize,
      memorySize,
      staticSize,
      dynamicSize,
      taskSize,
    };
  }

  /**
   * 提取内存来源信息
   */
  private extractMemorySources(userMemory: string): string[] {
    if (!userMemory) return [];
    
    const sources: string[] = [];
    const lines = userMemory.split('\n');
    
    lines.forEach(line => {
      if (line.startsWith('---') && line.includes('Context from:')) {
        const source = line.match(/Context from: (.+) ---/)?.[1];
        if (source) sources.push(source);
      }
    });

    return sources;
  }

  /**
   * 生成人类可读的摘要
   */
  private generateHumanReadableSummary(debugInfo: ContextDebugInfo, turnNumber: number): string {
    const { memoryTool, staticContext, dynamicContext, taskManagement, history, generated } = debugInfo;

    return `# 上下文调试报告 - 第 ${turnNumber} 轮

## 📊 总体统计
- **总上下文大小**: ${generated.totalContextSize.toLocaleString()} 字符
- **估算Token数**: ${Math.ceil(generated.totalContextSize / 4).toLocaleString()}
- **历史记录**: ${history.recordCount} 条 (用户: ${history.userTurns}, 模型: ${history.modelTurns})

## 🧠 内存工具 (Memory Tool)
- **用户内存大小**: ${generated.memorySize.toLocaleString()} 字符
- **GEMINI.md文件数**: ${memoryTool.geminiMdFileCount}
- **内存来源**: ${memoryTool.sources.length > 0 ? memoryTool.sources.join(', ') : '无特定来源'}

## 📋 静态上下文 (Static Context)
- **总大小**: ${generated.staticSize.toLocaleString()} 字符
- **项目规则**: ${staticContext.projectRules.length} 个文件
  ${staticContext.projectRules.map(r => `  - ${r.file} (${r.content.length} 字符)`).join('\n')}
- **全局规则**: ${staticContext.globalRules.length} 个文件
  ${staticContext.globalRules.map(r => `  - ${r.file} (${r.content.length} 字符)`).join('\n')}

## 🔄 动态上下文 (Dynamic Context)
- **总大小**: ${generated.dynamicSize.toLocaleString()} 字符
- **条目数**: ${dynamicContext.entries.length}
${dynamicContext.entries.map((entry, i) => `  ${i + 1}. ${entry.substring(0, 100)}${entry.length > 100 ? '...' : ''}`).join('\n')}

## 🎯 任务管理 (Task Management)
- **状态**: ${taskManagement.isActive ? '✅ 激活' : '❌ 未激活'}
${taskManagement.isActive ? `- **当前任务**: ${taskManagement.currentTask?.description || '无'}
- **进度**: ${taskManagement.completedCount}/${taskManagement.totalCount} 已完成
- **任务列表**:
${taskManagement.taskList?.tasks.map(t => `  ${t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳'} ${t.description}`).join('\n') || '  无任务'}` : ''}

## 📈 上下文组成比例
- **内存工具**: ${((generated.memorySize / generated.totalContextSize) * 100).toFixed(1)}%
- **静态上下文**: ${((generated.staticSize / generated.totalContextSize) * 100).toFixed(1)}%
- **动态上下文**: ${((generated.dynamicSize / generated.totalContextSize) * 100).toFixed(1)}%
- **任务管理**: ${((generated.taskSize / generated.totalContextSize) * 100).toFixed(1)}%

---
*生成时间: ${new Date().toLocaleString()}*
`;
  }

  /**
   * 在控制台打印上下文摘要
   */
  private printContextSummary(debugInfo: ContextDebugInfo, turnNumber: number): void {
    const { generated, taskManagement, staticContext, dynamicContext } = debugInfo;
    
    console.log(`\n🔍 [Context Debug] Turn ${turnNumber} Summary:`);
    console.log(`   📊 Total: ${generated.totalContextSize.toLocaleString()} chars (~${Math.ceil(generated.totalContextSize / 4).toLocaleString()} tokens)`);
    console.log(`   🧠 Memory: ${generated.memorySize.toLocaleString()} chars (${((generated.memorySize / generated.totalContextSize) * 100).toFixed(1)}%)`);
    console.log(`   📋 Static: ${generated.staticSize.toLocaleString()} chars (${((generated.staticSize / generated.totalContextSize) * 100).toFixed(1)}%) - ${staticContext.projectRules.length} project + ${staticContext.globalRules.length} global rules`);
    console.log(`   🔄 Dynamic: ${generated.dynamicSize.toLocaleString()} chars (${((generated.dynamicSize / generated.totalContextSize) * 100).toFixed(1)}%) - ${dynamicContext.entries.length} entries`);
    console.log(`   🎯 Tasks: ${generated.taskSize.toLocaleString()} chars (${((generated.taskSize / generated.totalContextSize) * 100).toFixed(1)}%) - ${taskManagement.isActive ? `${taskManagement.completedCount}/${taskManagement.totalCount} done` : 'inactive'}`);
  }

  /**
   * 获取当前轮次
   */
  getCurrentTurn(): number {
    return this.turnCounter;
  }

  /**
   * 检查是否启用调试
   */
  isDebugEnabled(): boolean {
    return this.isEnabled;
  }
}
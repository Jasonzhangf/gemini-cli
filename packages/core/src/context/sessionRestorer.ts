/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionHistoryManager, SessionSnapshot } from './sessionHistory.js';
import { ContextManager, TaskItem } from './contextManager.js';
import { Config } from '../config/config.js';

export interface SessionRestorationResult {
  restored: boolean;
  sessionId?: string;
  tasksRestored?: number;
  currentTask?: string;
  message?: string;
}

export class SessionRestorer {
  private historyManager: SessionHistoryManager;
  private config: Config;
  
  constructor(config: Config) {
    this.config = config;
    this.historyManager = new SessionHistoryManager();
  }
  
  /**
   * 初始化会话恢复系统
   */
  async initialize(): Promise<void> {
    await this.historyManager.initialize();
  }
  
  /**
   * 检查是否有未完成的会话需要恢复
   */
  async checkForUnfinishedSession(): Promise<SessionSnapshot | null> {
    const projectPath = this.config.getTargetDir();
    return await this.historyManager.getActiveSession(projectPath);
  }
  
  /**
   * 恢复会话状态
   */
  async restoreSession(snapshot: SessionSnapshot): Promise<SessionRestorationResult> {
    try {
      const contextManager = this.config.getContextManager();
      
      // 1. 恢复任务状态
      if (snapshot.tasks.length > 0) {
        await contextManager.createTaskList(snapshot.tasks);
        
        // 恢复当前任务状态
        if (snapshot.currentTaskId) {
          const currentTask = snapshot.tasks.find(t => t.id === snapshot.currentTaskId);
          if (currentTask) {
            await contextManager.updateTaskStatus(snapshot.currentTaskId, 'in_progress');
          }
        }
      }
      
      // 2. 恢复维护模式状态
      if (snapshot.isInMaintenanceMode) {
        // 维护模式通常在创建任务列表时自动设置
        // 这里可能不需要额外操作
      }
      
      // 3. 恢复上下文（如果有的话）
      if (snapshot.staticContext) {
        // 静态上下文通常在启动时重新加载，这里可以选择性恢复
      }
      
      // 4. 恢复对话历史到当前会话
      // 注意：这里不直接恢复对话历史到模型，而是准备在需要时提供上下文
      
      // 5. 更新会话为活跃状态
      snapshot.isActive = true;
      snapshot.lastActiveTime = new Date().toISOString();
      await this.historyManager.saveSession(snapshot);
      
      const unfinishedTasks = snapshot.tasks.filter(t => t.status !== 'completed');
      const currentTask = snapshot.tasks.find(t => t.id === snapshot.currentTaskId);
      
      return {
        restored: true,
        sessionId: snapshot.sessionId,
        tasksRestored: snapshot.tasks.length,
        currentTask: currentTask?.description,
        message: `已恢复会话 ${snapshot.sessionId.slice(0, 8)}...，包含 ${snapshot.tasks.length} 个任务（${unfinishedTasks.length} 个未完成）`
      };
      
    } catch (error) {
      console.warn('[SessionRestorer] Failed to restore session:', error);
      return {
        restored: false,
        message: `会话恢复失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * 保存当前会话状态
   */
  async saveCurrentSession(
    conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>,
    totalMessages?: number,
    totalToolCalls?: number,
    lastUserMessage?: string,
    startTime?: string
  ): Promise<void> {
    try {
      const contextManager = this.config.getContextManager();
      const projectPath = this.config.getTargetDir();
      const sessionId = this.config.getSessionId();
      
      // 收集当前状态
      const context = contextManager.getContext();
      const taskList = context.taskList;
      const tasks: TaskItem[] = Array.isArray(taskList) ? taskList : [];
      const currentTask = contextManager.getCurrentTask();
      const isInMaintenanceMode = contextManager.isInMaintenanceMode();
      
      // 构建会话快照
      const snapshot: Omit<SessionSnapshot, 'projectPathKey'> = {
        sessionId,
        projectPath,
        startTime: startTime || new Date().toISOString(),
        lastActiveTime: new Date().toISOString(),
        isActive: true,
        hasUnfinishedTasks: tasks.some(t => t.status !== 'completed'),
        
        tasks,
        currentTaskId: currentTask?.id,
        isInMaintenanceMode,
        
        conversationHistory: conversationHistory || [],
        staticContext: context.staticContext,
        dynamicContext: context.dynamicContext,
        
        totalMessages: totalMessages || 0,
        totalToolCalls: totalToolCalls || 0,
        lastUserMessage,
        
        openaiMode: false, // 可以从配置中检测
        debugMode: this.config.getDebugMode(),
        model: this.config.getModel()
      };
      
      await this.historyManager.saveSession(snapshot);
      
    } catch (error) {
      console.warn('[SessionRestorer] Failed to save current session:', error);
    }
  }
  
  /**
   * 设置会话开始时间（在会话第一次创建时调用）
   */
  async setSessionStartTime(startTime: string): Promise<void> {
    this.sessionStartTime = startTime;
  }
  
  private sessionStartTime?: string;
  
  /**
   * 获取项目的会话历史列表
   */
  async getSessionHistory(): Promise<SessionSnapshot[]> {
    const projectPath = this.config.getTargetDir();
    return await this.historyManager.getProjectSessions(projectPath);
  }
  
  /**
   * 结束当前会话
   */
  async endCurrentSession(): Promise<void> {
    try {
      const projectPath = this.config.getTargetDir();
      const sessionId = this.config.getSessionId();
      
      await this.historyManager.deactivateSession(projectPath, sessionId);
      
    } catch (error) {
      console.warn('[SessionRestorer] Failed to end current session:', error);
    }
  }
  
  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const projectPath = this.config.getTargetDir();
      await this.historyManager.deleteSession(projectPath, sessionId);
    } catch (error) {
      console.warn('[SessionRestorer] Failed to delete session:', error);
    }
  }
  
  /**
   * 生成会话恢复的上下文提示
   */
  generateRestorationContext(snapshot: SessionSnapshot): string {
    const parts: string[] = [];
    
    parts.push('📋 **会话恢复**: 正在继续之前的工作会话');
    parts.push(`🕐 **上次活动**: ${new Date(snapshot.lastActiveTime).toLocaleString()}`);
    
    if (snapshot.hasUnfinishedTasks) {
      const unfinishedTasks = snapshot.tasks.filter(t => t.status !== 'completed');
      const currentTask = snapshot.tasks.find(t => t.id === snapshot.currentTaskId);
      
      parts.push(`📌 **任务状态**: ${snapshot.tasks.length} 个任务，${unfinishedTasks.length} 个未完成`);
      
      if (currentTask) {
        parts.push(`🎯 **当前任务**: ${currentTask.description} (${currentTask.status})`);
      }
      
      parts.push('📝 **任务列表**:');
      snapshot.tasks.forEach((task, index) => {
        const statusIcon = task.status === 'completed' ? '✅' : 
                          task.status === 'in_progress' ? '🔄' : '⏳';
        const isCurrent = task.id === snapshot.currentTaskId ? ' ← 当前' : '';
        parts.push(`   ${index + 1}. ${statusIcon} ${task.description}${isCurrent}`);
      });
    }
    
    if (snapshot.lastUserMessage) {
      parts.push(`💬 **最后消息**: ${snapshot.lastUserMessage.substring(0, 100)}...`);
    }
    
    parts.push('');
    parts.push('💡 **提示**: 您可以继续之前的工作，或者输入新的指令开始新的任务。');
    
    return parts.join('\\n');
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskItem } from './contextManager.js';

export interface SessionSnapshot {
  sessionId: string;
  projectPath: string;
  projectPathKey: string; // 用于文件名的路径键（/替换为-）
  startTime: string;
  lastActiveTime: string;
  isActive: boolean;
  hasUnfinishedTasks: boolean;
  
  // 任务状态
  tasks: TaskItem[];
  currentTaskId?: string;
  isInMaintenanceMode: boolean;
  
  // 上下文状态
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>;
  staticContext?: any;
  dynamicContext?: any;
  
  // 会话元数据
  totalMessages: number;
  totalToolCalls: number;
  lastUserMessage?: string;
  
  // 配置快照
  openaiMode: boolean;
  debugMode: boolean;
  model?: string;
}

export interface SessionHistoryIndex {
  sessions: Array<{
    sessionId: string;
    projectPathKey: string;
    startTime: string;
    lastActiveTime: string;
    isActive: boolean;
    hasUnfinishedTasks: boolean;
    totalMessages: number;
    lastUserMessage?: string;
  }>;
  lastCleanup: string;
}

export class SessionHistoryManager {
  private historyDir: string;
  private indexFile: string;
  private maxSessionsPerProject = 5;
  
  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    this.historyDir = path.join(homeDir, '.gemini', 'history');
    this.indexFile = path.join(this.historyDir, 'index.json');
  }
  
  /**
   * 初始化历史记录目录
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      
      // 确保索引文件存在
      try {
        await fs.access(this.indexFile);
      } catch {
        const emptyIndex: SessionHistoryIndex = {
          sessions: [],
          lastCleanup: new Date().toISOString()
        };
        await this.saveIndex(emptyIndex);
      }
    } catch (error) {
      console.warn('[SessionHistory] Failed to initialize history directory:', error);
    }
  }
  
  /**
   * 将绝对路径转换为文件名安全的键
   */
  private getProjectPathKey(projectPath: string): string {
    return projectPath.replace(/\//g, '-').replace(/\\/g, '-').replace(/:/g, '');
  }
  
  /**
   * 获取会话文件路径
   */
  private getSessionFilePath(projectPathKey: string, sessionId: string): string {
    return path.join(this.historyDir, `${projectPathKey}_${sessionId}.json`);
  }
  
  /**
   * 保存会话快照
   */
  async saveSession(snapshot: Omit<SessionSnapshot, 'projectPathKey'>): Promise<void> {
    try {
      const projectPathKey = this.getProjectPathKey(snapshot.projectPath);
      const fullSnapshot: SessionSnapshot = {
        ...snapshot,
        projectPathKey,
        lastActiveTime: new Date().toISOString()
      };
      
      const sessionFile = this.getSessionFilePath(projectPathKey, snapshot.sessionId);
      await fs.writeFile(sessionFile, JSON.stringify(fullSnapshot, null, 2), 'utf-8');
      
      // 更新索引
      await this.updateIndex(fullSnapshot);
      
      // 清理旧会话
      await this.cleanupOldSessions(projectPathKey);
      
    } catch (error) {
      console.warn('[SessionHistory] Failed to save session:', error);
    }
  }
  
  /**
   * 加载会话快照
   */
  async loadSession(projectPath: string, sessionId: string): Promise<SessionSnapshot | null> {
    try {
      const projectPathKey = this.getProjectPathKey(projectPath);
      const sessionFile = this.getSessionFilePath(projectPathKey, sessionId);
      
      const content = await fs.readFile(sessionFile, 'utf-8');
      return JSON.parse(content) as SessionSnapshot;
    } catch (error) {
      console.warn('[SessionHistory] Failed to load session:', error);
      return null;
    }
  }
  
  /**
   * 获取项目的活跃会话（如果有未完成任务）
   */
  async getActiveSession(projectPath: string): Promise<SessionSnapshot | null> {
    try {
      const projectPathKey = this.getProjectPathKey(projectPath);
      const index = await this.loadIndex();
      
      const activeSessionInfo = index.sessions.find(s => 
        s.projectPathKey === projectPathKey && s.isActive && s.hasUnfinishedTasks
      );
      
      if (activeSessionInfo) {
        return await this.loadSession(projectPath, activeSessionInfo.sessionId);
      }
      
      return null;
    } catch (error) {
      console.warn('[SessionHistory] Failed to get active session:', error);
      return null;
    }
  }
  
  /**
   * 获取项目的所有会话历史
   */
  async getProjectSessions(projectPath: string): Promise<SessionSnapshot[]> {
    try {
      const projectPathKey = this.getProjectPathKey(projectPath);
      const index = await this.loadIndex();
      
      const projectSessions = index.sessions
        .filter(s => s.projectPathKey === projectPathKey)
        .sort((a, b) => new Date(b.lastActiveTime).getTime() - new Date(a.lastActiveTime).getTime());
      
      const sessions: SessionSnapshot[] = [];
      for (const sessionInfo of projectSessions) {
        const session = await this.loadSession(projectPath, sessionInfo.sessionId);
        if (session) {
          sessions.push(session);
        }
      }
      
      return sessions;
    } catch (error) {
      console.warn('[SessionHistory] Failed to get project sessions:', error);
      return [];
    }
  }
  
  /**
   * 标记会话为非活跃状态
   */
  async deactivateSession(projectPath: string, sessionId: string): Promise<void> {
    try {
      const session = await this.loadSession(projectPath, sessionId);
      if (session) {
        session.isActive = false;
        session.lastActiveTime = new Date().toISOString();
        await this.saveSession(session);
      }
    } catch (error) {
      console.warn('[SessionHistory] Failed to deactivate session:', error);
    }
  }
  
  /**
   * 删除会话
   */
  async deleteSession(projectPath: string, sessionId: string): Promise<void> {
    try {
      const projectPathKey = this.getProjectPathKey(projectPath);
      const sessionFile = this.getSessionFilePath(projectPathKey, sessionId);
      
      await fs.unlink(sessionFile);
      
      // 从索引中移除
      const index = await this.loadIndex();
      index.sessions = index.sessions.filter(s => 
        !(s.projectPathKey === projectPathKey && s.sessionId === sessionId)
      );
      await this.saveIndex(index);
      
    } catch (error) {
      console.warn('[SessionHistory] Failed to delete session:', error);
    }
  }
  
  /**
   * 清理项目的旧会话，只保留最近的N个
   */
  private async cleanupOldSessions(projectPathKey: string): Promise<void> {
    try {
      const index = await this.loadIndex();
      
      const projectSessions = index.sessions
        .filter(s => s.projectPathKey === projectPathKey)
        .sort((a, b) => new Date(b.lastActiveTime).getTime() - new Date(a.lastActiveTime).getTime());
      
      // 保留最近的 maxSessionsPerProject 个会话
      const sessionsToDelete = projectSessions.slice(this.maxSessionsPerProject);
      
      for (const session of sessionsToDelete) {
        try {
          const sessionFile = this.getSessionFilePath(projectPathKey, session.sessionId);
          await fs.unlink(sessionFile);
        } catch (error) {
          console.warn(`[SessionHistory] Failed to delete old session file: ${session.sessionId}`, error);
        }
      }
      
      // 更新索引
      index.sessions = index.sessions.filter(s => 
        s.projectPathKey !== projectPathKey || 
        projectSessions.slice(0, this.maxSessionsPerProject).some(keep => keep.sessionId === s.sessionId)
      );
      
      await this.saveIndex(index);
      
    } catch (error) {
      console.warn('[SessionHistory] Failed to cleanup old sessions:', error);
    }
  }
  
  /**
   * 加载索引文件
   */
  private async loadIndex(): Promise<SessionHistoryIndex> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(content) as SessionHistoryIndex;
    } catch (error) {
      return {
        sessions: [],
        lastCleanup: new Date().toISOString()
      };
    }
  }
  
  /**
   * 保存索引文件
   */
  private async saveIndex(index: SessionHistoryIndex): Promise<void> {
    try {
      await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[SessionHistory] Failed to save index:', error);
    }
  }
  
  /**
   * 更新索引
   */
  private async updateIndex(snapshot: SessionSnapshot): Promise<void> {
    try {
      const index = await this.loadIndex();
      
      // 移除现有的会话记录
      index.sessions = index.sessions.filter(s => s.sessionId !== snapshot.sessionId);
      
      // 添加新的会话记录
      index.sessions.push({
        sessionId: snapshot.sessionId,
        projectPathKey: snapshot.projectPathKey,
        startTime: snapshot.startTime,
        lastActiveTime: snapshot.lastActiveTime,
        isActive: snapshot.isActive,
        hasUnfinishedTasks: snapshot.hasUnfinishedTasks,
        totalMessages: snapshot.totalMessages,
        lastUserMessage: snapshot.lastUserMessage
      });
      
      await this.saveIndex(index);
    } catch (error) {
      console.warn('[SessionHistory] Failed to update index:', error);
    }
  }
}
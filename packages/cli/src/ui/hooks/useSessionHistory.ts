/**
 * @license
 * Copyright 2025 Jason Zhang  
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Config, SessionRestorer } from '@google/gemini-cli-core';

// 导入类型定义（需要从core包导出）
interface SessionSnapshot {
  sessionId: string;
  projectPath: string;
  projectPathKey: string;
  startTime: string;
  lastActiveTime: string;
  isActive: boolean;
  hasUnfinishedTasks: boolean;
  tasks: any[];
  currentTaskId?: string;
  isInMaintenanceMode: boolean;
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>;
  staticContext?: any;
  dynamicContext?: any;
  totalMessages: number;
  totalToolCalls: number;
  lastUserMessage?: string;
  openaiMode: boolean;
  debugMode: boolean;
  model?: string;
}

interface UnfinishedTaskInfo {
  taskCount: number;
  unfinishedCount: number;
  currentTask?: string;
  lastActivity: string;
  sessionId: string;
}

interface SessionInfo {
  sessionId: string;
  startTime: string;
  lastActiveTime: string;
  isActive: boolean;
  hasUnfinishedTasks: boolean;
  totalMessages: number;
  lastUserMessage?: string;
  tasksCount?: number;
  unfinishedTasksCount?: number;
}

export const useSessionHistory = (config: Config) => {
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [unfinishedTaskInfo, setUnfinishedTaskInfo] = useState<UnfinishedTaskInfo | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionInfo[]>([]);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [escapeCount, setEscapeCount] = useState(0);
  const [lastEscapeTime, setLastEscapeTime] = useState(0);
  
  // 会话恢复器
  const [sessionRestorer, setSessionRestorer] = useState<SessionRestorer | null>(null);
  
  useEffect(() => {
    const initializeSessionRestorer = async () => {
      try {
        const restorer = new SessionRestorer(config);
        await restorer.initialize();
        setSessionRestorer(restorer);
        
        // 检查未完成的会话
        await checkForUnfinishedSession(restorer);
      } catch (error) {
        console.warn('[SessionHistory] Failed to initialize session restorer:', error);
        setIsCheckingSession(false);
      }
    };
    
    initializeSessionRestorer();
  }, [config]);
  
  // 检查未完成的会话
  const checkForUnfinishedSession = useCallback(async (restorer: SessionRestorer) => {
    try {
      setIsCheckingSession(true);
      const unfinishedSession = await restorer.checkForUnfinishedSession();
      
      if (unfinishedSession && unfinishedSession.hasUnfinishedTasks) {
        const unfinishedTasks = unfinishedSession.tasks.filter((t: any) => t.status !== 'completed');
        const currentTask = unfinishedSession.tasks.find((t: any) => t.id === unfinishedSession.currentTaskId);
        
        setUnfinishedTaskInfo({
          taskCount: unfinishedSession.tasks.length,
          unfinishedCount: unfinishedTasks.length,
          currentTask: currentTask?.description,
          lastActivity: unfinishedSession.lastActiveTime,
          sessionId: unfinishedSession.sessionId
        });
        
        setShowRestorePrompt(true);
      }
    } catch (error) {
      console.warn('[SessionHistory] Failed to check for unfinished session:', error);
    } finally {
      setIsCheckingSession(false);
    }
  }, []);
  
  // 继续会话
  const continueSession = useCallback(async () => {
    if (!sessionRestorer || !unfinishedTaskInfo) return;
    
    try {
      const unfinishedSession = await sessionRestorer.checkForUnfinishedSession();
      if (unfinishedSession) {
        const result = await sessionRestorer.restoreSession(unfinishedSession);
        if (result.restored) {
          console.log('[SessionHistory] Session restored successfully:', result.message);
          // 可以在这里添加成功恢复的通知逻辑
        }
      }
    } catch (error) {
      console.warn('[SessionHistory] Failed to continue session:', error);
    } finally {
      setShowRestorePrompt(false);
      setUnfinishedTaskInfo(null);
    }
  }, [sessionRestorer, unfinishedTaskInfo]);
  
  // 开始新会话
  const startNewSession = useCallback(async () => {
    if (!sessionRestorer) return;
    
    try {
      // 结束当前会话
      await sessionRestorer.endCurrentSession();
      
      // 清除任务状态（如果需要的话）
      const contextManager = config.getContextManager();
      if (contextManager.isInMaintenanceMode()) {
        await contextManager.endMaintenanceMode();
      }
      
    } catch (error) {
      console.warn('[SessionHistory] Failed to start new session:', error);
    } finally {
      setShowRestorePrompt(false);
      setUnfinishedTaskInfo(null);
    }
  }, [sessionRestorer, config]);
  
  // 获取会话历史
  const loadSessionHistory = useCallback(async () => {
    if (!sessionRestorer) return;
    
    try {
      const sessions = await sessionRestorer.getSessionHistory();
      const sessionInfos: SessionInfo[] = sessions.map(session => ({
        sessionId: session.sessionId,
        startTime: session.startTime,
        lastActiveTime: session.lastActiveTime,
        isActive: session.isActive,
        hasUnfinishedTasks: session.hasUnfinishedTasks,
        totalMessages: session.totalMessages,
        lastUserMessage: session.lastUserMessage,
        tasksCount: session.tasks.length,
        unfinishedTasksCount: session.tasks.filter(t => t.status !== 'completed').length
      }));
      
      setSessionHistory(sessionInfos);
    } catch (error) {
      console.warn('[SessionHistory] Failed to load session history:', error);
    }
  }, [sessionRestorer]);
  
  // 选择会话
  const selectSession = useCallback(async (sessionId: string | null) => {
    if (!sessionRestorer) return;
    
    try {
      if (sessionId) {
        // 恢复选定的会话
        const sessions = await sessionRestorer.getSessionHistory();
        const selectedSession = sessions.find((s: any) => s.sessionId === sessionId);
        
        if (selectedSession) {
          const result = await sessionRestorer.restoreSession(selectedSession);
          if (result.restored) {
            console.log('[SessionHistory] Session restored:', result.message);
          }
        }
      } else {
        // 开始新会话
        await startNewSession();
      }
    } catch (error) {
      console.warn('[SessionHistory] Failed to select session:', error);
    } finally {
      setShowSessionSelector(false);
    }
  }, [sessionRestorer, startNewSession]);
  
  // 处理ESC键
  const handleEscapeKey = useCallback(() => {
    const now = Date.now();
    
    if (now - lastEscapeTime < 500) { // 500ms内的连续ESC
      setEscapeCount(prev => prev + 1);
      if (escapeCount + 1 >= 2) {
        // 双ESC激活会话选择
        loadSessionHistory().then(() => {
          setShowSessionSelector(true);
        });
        setEscapeCount(0);
      }
    } else {
      setEscapeCount(1);
    }
    
    setLastEscapeTime(now);
  }, [escapeCount, lastEscapeTime, loadSessionHistory]);
  
  // 保存当前会话
  const saveCurrentSession = useCallback(async (
    conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>, 
    totalMessages: number, 
    totalToolCalls: number, 
    lastUserMessage?: string,
    startTime?: string
  ) => {
    if (!sessionRestorer) return;
    
    try {
      await sessionRestorer.saveCurrentSession(
        conversationHistory,
        totalMessages,
        totalToolCalls,
        lastUserMessage,
        startTime
      );
    } catch (error) {
      console.warn('[SessionHistory] Failed to save current session:', error);
    }
  }, [sessionRestorer]);
  
  return {
    // 状态
    showRestorePrompt,
    showSessionSelector,
    unfinishedTaskInfo,
    sessionHistory,
    isCheckingSession,
    
    // 操作
    continueSession,
    startNewSession,
    selectSession,
    handleEscapeKey,
    saveCurrentSession,
    
    // 控制显示
    hideRestorePrompt: () => setShowRestorePrompt(false),
    hideSessionSelector: () => setShowSessionSelector(false),
  };
};
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Config } from '@google/gemini-cli-core';
import { TodoTask } from '../components/TodoDisplay.js';

interface TodoState {
  tasks: TodoTask[];
  isMaintenanceMode: boolean;
  currentTaskId?: string;
  isLoading: boolean;
  error?: string;
}

export const useTodoState = (config: Config) => {
  const [todoState, setTodoState] = useState<TodoState>({
    tasks: [],
    isMaintenanceMode: false,
    isLoading: false,
  });

  const refreshTodoState = useCallback(async () => {
    try {
      setTodoState(prev => ({ ...prev, isLoading: true, error: undefined }));
      
      // Check if context enhancement is enabled
      let contextManager;
      try {
        contextManager = config.getContextManager();
      } catch (error) {
        // Context manager not available (context enhancement disabled)
        setTodoState({
          tasks: [],
          isMaintenanceMode: false,
          isLoading: false,
        });
        return;
      }
      
      if (!contextManager) {
        setTodoState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Get current context data
      const contextData = contextManager.getContext();
      const isMaintenanceMode = contextManager.isInMaintenanceMode();
      
      if (!contextData.taskList || !isMaintenanceMode) {
        setTodoState({
          tasks: [],
          isMaintenanceMode: false,
          isLoading: false,
        });
        return;
      }

      // Convert context tasks to display format
      const tasks: TodoTask[] = contextData.taskList.tasks.map(task => ({
        id: task.id,
        description: task.description,
        status: task.status,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      }));

      // Find current task (first non-completed task)
      const currentTask = tasks.find(t => t.status !== 'completed');
      
      setTodoState({
        tasks,
        isMaintenanceMode,
        currentTaskId: currentTask?.id,
        isLoading: false,
      });

    } catch (error) {
      console.warn('[useTodoState] Failed to refresh todo state:', error);
      setTodoState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [config]);

  // Refresh todo state periodically and on mount
  useEffect(() => {
    refreshTodoState();
    
    // Refresh every 2 seconds while maintenance mode might be active
    const interval = setInterval(refreshTodoState, 2000);
    
    return () => clearInterval(interval);
  }, [refreshTodoState]);

  return {
    ...todoState,
    refresh: refreshTodoState,
  };
};
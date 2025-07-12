/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export interface TodoTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
}

interface TodoDisplayProps {
  tasks: TodoTask[];
  isMaintenanceMode: boolean;
  currentTaskId?: string;
  visible?: boolean;
}

export const TodoDisplay: React.FC<TodoDisplayProps> = ({
  tasks,
  isMaintenanceMode,
  currentTaskId,
  visible = true,
}) => {
  if (!visible || !isMaintenanceMode || tasks.length === 0) {
    return null;
  }

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const statusIcon = (status: TodoTask['status'], isCurrent: boolean) => {
    if (isCurrent && status !== 'completed') {
      return '🔄'; // Current task indicator
    }
    switch (status) {
      case 'completed':
        return '✅';
      case 'in_progress':
        return '🔄';
      case 'pending':
        return '⏳';
      default:
        return '⏳';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      {/* Header */}
      <Box>
        <Text color={Colors.AccentGreen}>
          🎯 任务管理 ({completedCount}/{totalCount}) {progress}%
        </Text>
      </Box>
      
      {/* Task List */}
      <Box flexDirection="column" marginLeft={2}>
        {tasks.slice(0, 5).map((task, index) => {
          const isCurrent = task.id === currentTaskId;
          const displayText = task.description.length > 18 
            ? task.description.substring(0, 15) + '...' 
            : task.description;
          
          return (
            <Box key={task.id}>
              <Text color={task.status === 'completed' ? Colors.Gray : Colors.Foreground}>
                {statusIcon(task.status, isCurrent)} {displayText}
                {isCurrent && task.status !== 'completed' && (
                  <Text color={Colors.AccentYellow}> ← 当前</Text>
                )}
              </Text>
            </Box>
          );
        })}
        
        {tasks.length > 5 && (
          <Box>
            <Text color={Colors.Gray}>... 还有 {tasks.length - 5} 个任务</Text>
          </Box>
        )}
      </Box>
      
      {/* Progress Bar */}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          进度: {'█'.repeat(Math.floor(progress / 10))}{'░'.repeat(10 - Math.floor(progress / 10))} {progress}%
        </Text>
      </Box>
    </Box>
  );
};
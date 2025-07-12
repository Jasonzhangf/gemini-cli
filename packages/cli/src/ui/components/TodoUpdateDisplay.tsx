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

interface TodoUpdateDisplayProps {
  tasks: TodoTask[];
  lastUpdate?: string;
  visible?: boolean;
}

export const TodoUpdateDisplay: React.FC<TodoUpdateDisplayProps> = ({
  tasks,
  lastUpdate,
  visible = true,
}) => {
  if (!visible || tasks.length === 0) {
    return null;
  }

  const statusIcon = (status: TodoTask['status']) => {
    switch (status) {
      case 'completed':
        return '☒';
      case 'in_progress':
        return '☐'; // Current task shows as pending in this format
      case 'pending':
        return '☐';
      default:
        return '☐';
    }
  };

  const getStatusColor = (status: TodoTask['status']) => {
    switch (status) {
      case 'completed':
        return Colors.Gray;
      case 'in_progress':
        return Colors.AccentYellow;
      case 'pending':
        return Colors.Foreground;
      default:
        return Colors.Foreground;
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box>
        <Text color={Colors.AccentGreen}>Update Todos</Text>
      </Box>
      
      {/* Task List with tree-like structure */}
      <Box flexDirection="column">
        <Box>
          <Text color={Colors.Gray}>  ⎿  </Text>
        </Box>
        {tasks.map((task, index) => {
          const isLast = index === tasks.length - 1;
          const prefix = index === 0 ? '     ' : '     ';
          
          return (
            <Box key={task.id}>
              <Text color={Colors.Gray}>{prefix}</Text>
              <Text color={getStatusColor(task.status)}>
                {statusIcon(task.status)} {task.description}
                {task.status === 'completed' && (
                  <Text color={Colors.Gray}>     </Text>
                )}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
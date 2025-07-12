/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

export interface TodoTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
}

interface TodoMessageProps {
  tasks: TodoTask[];
  terminalWidth: number;
}

const TodoStatusIndicator: React.FC<{ status: TodoTask['status'] }> = ({ status }) => (
  <Box minWidth={3}>
    {status === 'completed' && <Text color={Colors.AccentGreen}>☒</Text>}
    {status === 'in_progress' && <Text color={Colors.AccentYellow}>☐</Text>}
    {status === 'pending' && <Text color={Colors.Gray}>☐</Text>}
  </Box>
);

export const TodoMessage: React.FC<TodoMessageProps> = ({
  tasks,
  terminalWidth,
}) => {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      width="100%"
      marginLeft={1}
      borderColor={Colors.AccentGreen}
      marginBottom={1}
    >
      <Box paddingX={1} paddingY={0} flexDirection="column">
        {/* Header */}
        <Box minHeight={1}>
          <Box minWidth={3}>
            <Text color={Colors.AccentGreen}>⏺</Text>
          </Box>
          <Text color={Colors.AccentGreen} bold>
            Update Todos
          </Text>
        </Box>

        {/* Todo List */}
        <Box paddingLeft={3} flexDirection="column" marginTop={1}>
          <Box>
            <Text color={Colors.Gray}>  ⎿  </Text>
          </Box>
          {tasks.map((task, index) => {
            const isCompleted = task.status === 'completed';
            const textColor = isCompleted ? Colors.Gray : Colors.Foreground;
            
            return (
              <Box key={task.id} minHeight={1}>
                <Text color={Colors.Gray}>     </Text>
                <TodoStatusIndicator status={task.status} />
                <Text color={textColor}>
                  {task.description}
                  {isCompleted && (
                    <Text color={Colors.Gray}>     </Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
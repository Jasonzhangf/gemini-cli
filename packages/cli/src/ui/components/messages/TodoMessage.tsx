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
  currentTaskId?: string;
}

const TodoStatusIndicator: React.FC<{ status: TodoTask['status']; isCurrent: boolean }> = ({ status, isCurrent }) => (
  <Box minWidth={3}>
    {isCurrent && status !== 'completed' && <Text color={Colors.AccentBlue}>🔄</Text>}
    {(!isCurrent || status === 'completed') && status === 'completed' && <Text color={Colors.AccentGreen}>☒</Text>}
    {(!isCurrent || status === 'completed') && status === 'in_progress' && <Text color={Colors.AccentBlue}>☐</Text>}
    {(!isCurrent || status === 'completed') && status === 'pending' && <Text color={Colors.Foreground}>☐</Text>}
  </Box>
);

export const TodoMessage: React.FC<TodoMessageProps> = ({
  tasks,
  terminalWidth,
  currentTaskId,
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
            const isCurrent = task.id === currentTaskId;
            
            // 状态颜色：完成=绿色，正在执行=蓝色，未执行=黑色
            let textColor = Colors.Foreground; // 默认黑色（未执行）
            if (isCompleted) {
              textColor = Colors.AccentGreen; // 绿色（完成）
            } else if (isCurrent || task.status === 'in_progress') {
              textColor = Colors.AccentBlue; // 蓝色（正在执行）
            }
            
            return (
              <Box key={task.id} minHeight={1}>
                <Text color={Colors.Gray}>     </Text>
                <TodoStatusIndicator status={task.status} isCurrent={isCurrent} />
                <Text color={textColor}>
                  {task.description}
                  {isCurrent && !isCompleted && (
                    <Text color={Colors.AccentBlue}> ← 当前</Text>
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
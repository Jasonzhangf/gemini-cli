/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

export interface UnfinishedTaskInfo {
  taskCount: number;
  unfinishedCount: number;
  currentTask?: string;
  lastActivity: string;
  sessionId: string;
}

interface SessionRestorePromptProps {
  taskInfo: UnfinishedTaskInfo;
  onContinue: () => void;
  onNewSession: () => void;
  visible: boolean;
}

export const SessionRestorePrompt: React.FC<SessionRestorePromptProps> = ({
  taskInfo,
  onContinue,
  onNewSession,
  visible,
}) => {
  const [selectedOption, setSelectedOption] = useState<'continue' | 'new'>('continue');
  
  useInput((input, key) => {
    if (!visible) return;
    
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
      setSelectedOption(prev => prev === 'continue' ? 'new' : 'continue');
    } else if (key.return) {
      if (selectedOption === 'continue') {
        onContinue();
      } else {
        onNewSession();
      }
    } else if (input === 'y' || input === 'Y') {
      onContinue();
    } else if (input === 'n' || input === 'N') {
      onNewSession();
    }
  }, { isActive: visible });
  
  if (!visible) {
    return null;
  }
  
  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}天前`;
    } else if (diffHours > 0) {
      return `${diffHours}小时前`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分钟前`;
    } else {
      return '刚刚';
    }
  };
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.AccentYellow} padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          🔄 发现未完成的工作会话
        </Text>
      </Box>
      
      {/* 会话信息 */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={Colors.Foreground}>
            📋 任务状态: {taskInfo.unfinishedCount}/{taskInfo.taskCount} 个任务未完成
          </Text>
        </Box>
        
        {taskInfo.currentTask && (
          <Box>
            <Text color={Colors.AccentBlue}>
              🎯 当前任务: {taskInfo.currentTask}
            </Text>
          </Box>
        )}
        
        <Box>
          <Text color={Colors.Gray}>
            🕐 最后活动: {formatTime(taskInfo.lastActivity)}
          </Text>
        </Box>
        
        <Box>
          <Text color={Colors.Gray}>
            🆔 会话ID: {taskInfo.sessionId.substring(0, 12)}...
          </Text>
        </Box>
      </Box>
      
      {/* 选项 */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={Colors.Foreground}>
            是否要继续上次的工作？
          </Text>
        </Box>
        
        <Box marginTop={1}>
          {/* 继续选项 */}
          <Box marginRight={2}>
            <Text 
              color={selectedOption === 'continue' ? Colors.AccentGreen : Colors.Gray}
            >
              {selectedOption === 'continue' ? '▶ ' : '  '}[Y] 继续工作
            </Text>
          </Box>
          
          {/* 新建选项 */}
          <Box>
            <Text 
              color={selectedOption === 'new' ? Colors.AccentRed : Colors.Gray}
            >
              {selectedOption === 'new' ? '▶ ' : '  '}[N] 开始新会话
            </Text>
          </Box>
        </Box>
      </Box>
      
      {/* 说明 */}
      <Box flexDirection="column">
        <Text color={Colors.Gray}>
          💡 选择"继续工作"将恢复任务状态和上下文
        </Text>
        <Text color={Colors.Gray}>
          💡 选择"开始新会话"将清除当前任务状态
        </Text>
        <Text color={Colors.Gray}>
          ⌨️  使用 Y/N 或 ←→ 选择，Enter 确认
        </Text>
      </Box>
    </Box>
  );
};
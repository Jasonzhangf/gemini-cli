/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

export interface SessionInfo {
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

interface SessionSelectorProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string | null) => void;
  onCancel: () => void;
  visible: boolean;
}

export const SessionSelector: React.FC<SessionSelectorProps> = ({
  sessions,
  onSelect,
  onCancel,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  useInput((input, key) => {
    if (!visible) return;
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(sessions.length, prev + 1)); // +1 for "新建会话" option
    } else if (key.return) {
      if (selectedIndex === sessions.length) {
        onSelect(null); // 新建会话
      } else {
        onSelect(sessions[selectedIndex]?.sessionId || null);
      }
    } else if (key.escape) {
      onCancel();
    }
  }, { isActive: visible });
  
  if (!visible) {
    return null;
  }
  
  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}天前`;
    } else if (diffHours > 0) {
      return `${diffHours}小时前`;
    } else {
      return '刚刚';
    }
  };
  
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.AccentBlue} padding={1}>
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          📚 选择会话历史 (↑↓选择, Enter确认, Esc取消)
        </Text>
      </Box>
      
      {/* 会话列表 */}
      <Box flexDirection="column">
        {sessions.map((session, index) => {
          const isSelected = index === selectedIndex;
          const textColor = isSelected ? Colors.AccentBlue : Colors.Foreground;
          
          return (
            <Box key={session.sessionId} paddingX={1}>
              <Box width="100%">
                <Box minWidth={3}>
                  <Text color={textColor}>
                    {session.hasUnfinishedTasks ? '🔄' : '✅'}
                  </Text>
                </Box>
                
                <Box flexGrow={1} flexDirection="column">
                  <Box>
                    <Text color={textColor} bold>
                      {session.sessionId.substring(0, 8)}...
                    </Text>
                    <Text color={Colors.Gray}> - {formatTime(session.lastActiveTime)}</Text>
                    {session.hasUnfinishedTasks && (
                      <Text color={Colors.AccentYellow}> [未完成任务]</Text>
                    )}
                  </Box>
                  
                  {session.lastUserMessage && (
                    <Box>
                      <Text color={Colors.Gray}>
                        💬 {truncateText(session.lastUserMessage, 50)}
                      </Text>
                    </Box>
                  )}
                  
                  <Box>
                    <Text color={Colors.Gray}>
                      📊 {session.totalMessages}条消息
                      {session.tasksCount !== undefined && (
                        <> • {session.unfinishedTasksCount}/{session.tasksCount}任务</>
                      )}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
        
        {/* 新建会话选项 */}
        <Box paddingX={1}>
          <Box minWidth={3}>
            <Text color={selectedIndex === sessions.length ? Colors.AccentBlue : Colors.Foreground}>
              ✨
            </Text>
          </Box>
          <Text 
            color={selectedIndex === sessions.length ? Colors.AccentBlue : Colors.AccentGreen}
            bold
          >
            开始新会话
          </Text>
        </Box>
      </Box>
      
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          提示: 选择会话将恢复任务状态和上下文，开始新会话将清除当前状态
        </Text>
      </Box>
    </Box>
  );
};
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  altName: '#',
  description: '激发存储 - 保存和管理项目记忆与全局记忆',
  subCommands: [
    {
      name: 'save',
      description: '保存新的记忆 (用法: /memory save <global|project> <内容>)',
      action: (context, args): SlashCommandActionReturn | void => {
        const parts = args.trim().split(' ');
        if (parts.length < 2) {
          return {
            type: 'message',
            messageType: 'error',
            content: '❌ 用法: /memory save <global|project> <内容>'
          };
        }

        const [type, ...contentParts] = parts;
        const content = contentParts.join(' ');

        if (!['global', 'project'].includes(type)) {
          return {
            type: 'message',
            messageType: 'error',
            content: '❌ 记忆类型必须是 global 或 project'
          };
        }

        if (!content) {
          return {
            type: 'message',
            messageType: 'error',
            content: '❌ 记忆内容不能为空'
          };
        }

        return {
          type: 'tool',
          toolName: 'save_memory',
          toolArgs: {
            content,
            type,
            title: `CLI快速保存 - ${new Date().toLocaleString()}`
          }
        };
      }
    },
    {
      name: 'view',
      description: '查看记忆统计信息',
      action: (context, args): SlashCommandActionReturn => {
        const type = args.trim() || 'both';
        
        return {
          type: 'tool',
          toolName: 'view_memories',
          toolArgs: {
            type: ['global', 'project', 'both'].includes(type) ? type : 'both',
            action: 'stats'
          }
        };
      }
    },
    {
      name: 'list',
      description: '查看记忆内容',
      action: (context, args): SlashCommandActionReturn => {
        const type = args.trim() || 'both';
        
        return {
          type: 'tool',
          toolName: 'view_memories',
          toolArgs: {
            type: ['global', 'project', 'both'].includes(type) ? type : 'both',
            action: 'view'
          }
        };
      }
    },
    {
      name: 'cleanup',
      description: '清理旧记忆 (用法: /memory cleanup [保留数量])',
      action: (context, args): SlashCommandActionReturn => {
        const parts = args.trim().split(' ');
        const keepCount = parts[0] ? parseInt(parts[0], 10) : 50;
        
        if (isNaN(keepCount) || keepCount < 1) {
          return {
            type: 'message',
            messageType: 'error',
            content: '❌ 保留数量必须是正整数'
          };
        }
        
        return {
          type: 'tool',
          toolName: 'view_memories',
          toolArgs: {
            type: 'both',
            action: 'cleanup',
            cleanup_keep_count: keepCount
          }
        };
      }
    },
    {
      name: 'show',
      description: '显示传统内存内容 (向后兼容)',
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const fileCount = context.services.config?.getGeminiMdFileCount() || 0;

        const messageContent =
          memoryContent.length > 0
            ? `传统内存内容 (来自 ${fileCount} 个文件):\n\n---\n${memoryContent}\n---\n\n💡 提示：使用新的激发存储功能：/memory view`
            : '传统内存为空。\n\n💡 提示：使用新的激发存储功能：/memory view';

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'refresh',
      description: 'Refresh the memory from the source.',
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Refreshing memory from source files...',
          },
          Date.now(),
        );

        try {
          const result = await context.services.config?.refreshMemory();

          if (result) {
            const { memoryContent, fileCount } = result;
            const successMessage =
              memoryContent.length > 0
                ? `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
                : 'Memory refreshed successfully. No memory content found.';

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error refreshing memory: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
  action: (context, args): SlashCommandActionReturn | void => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'info',
        content: `# 🧠 激发存储功能

## 💡 快速使用
- \`#save global <内容>\` - 保存全局记忆
- \`#save project <内容>\` - 保存项目记忆
- \`#view\` - 查看记忆统计
- \`#list\` - 查看记忆内容
- \`#cleanup [数量]\` - 清理旧记忆

## 📖 详细命令
- \`/memory save <type> <content>\` - 保存记忆
- \`/memory view [type]\` - 查看统计 (type: global|project|both)
- \`/memory list [type]\` - 查看内容
- \`/memory cleanup [count]\` - 清理记忆 (默认保留50条)

## 💭 记忆类型
- **全局记忆**: 适用于所有项目的通用知识和经验
- **项目记忆**: 当前项目特定的知识和经验

使用 \`#\` 前缀可快速访问记忆功能！`
      };
    }

    // Parse args to handle direct commands
    const trimmed = args.trim();
    
    // Handle shortcuts for #save
    if (trimmed.startsWith('save ')) {
      const saveArgs = trimmed.substring(5);
      const result = memoryCommand.subCommands![0].action!(context, saveArgs);
      return result instanceof Promise ? undefined : result;
    }
    
    // Handle other shortcuts
    if (trimmed === 'view' || trimmed === 'stats') {
      const result = memoryCommand.subCommands![1].action!(context, '');
      return result instanceof Promise ? undefined : result;
    }
    
    if (trimmed === 'list' || trimmed === 'show') {
      const result = memoryCommand.subCommands![2].action!(context, '');
      return result instanceof Promise ? undefined : result;
    }
    
    if (trimmed.startsWith('cleanup')) {
      const cleanupArgs = trimmed.substring(7).trim();
      const result = memoryCommand.subCommands![3].action!(context, cleanupArgs);
      return result instanceof Promise ? undefined : result;
    }

    // Default to help
    return {
      type: 'message',
      messageType: 'info',
      content: '❌ 未知的记忆命令。使用 `/memory` 或 `#` 查看帮助。'
    };
  }
};

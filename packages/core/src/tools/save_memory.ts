/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import type { Config } from '../config/config.js';
import { MemoryStorageService, MemoryType } from '../context/memoryStorageService.js';

export interface SaveMemoryInput {
  content: string;
  type: 'project' | 'global';
  title?: string;
  tags?: string[];
}

/**
 * 激发存储工具 - 保存重要信息为项目记忆或全局记忆
 */
export class SaveMemoryTool extends BaseTool<SaveMemoryInput> {
  static Name = 'save_memory';
  
  private memoryService: MemoryStorageService;

  constructor(private config: Config) {
    super(
      'save_memory',
      '激发存储',
      '保存重要信息、经验或知识为项目记忆或全局记忆。内容将保存到对应目录的Memory.md文件中。',
      {
        type: Type.OBJECT,
        properties: {
          content: {
            type: Type.STRING,
            description: '要保存的记忆内容，可以是重要信息、经验总结、学习笔记等'
          },
          type: {
            type: Type.STRING,
            enum: ['project', 'global'],
            description: '记忆类型：project（项目特定记忆，保存到 ./gemini/memories/Memory.md）或 global（全局记忆，保存到 ~/.gemini/memories/Memory.md）'
          },
          title: {
            type: Type.STRING,
            description: '记忆标题（可选），用于标识这条记忆的主题'
          },
          tags: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING
            },
            description: '标签列表（可选），用于分类和检索记忆'
          }
        },
        required: ['content', 'type']
      }
    );
    this.memoryService = new MemoryStorageService(
      config.getProjectRoot(),
      config.getDebugMode()
    );
  }

  async execute(input: SaveMemoryInput): Promise<ToolResult> {
    try {
      const { content, type, title, tags } = input;
      
      // 验证输入
      if (!content.trim()) {
        return {
          llmContent: '记忆保存失败：内容不能为空',
          returnDisplay: '❌ 错误：记忆内容不能为空'
        };
      }

      if (!['project', 'global'].includes(type)) {
        return {
          llmContent: '记忆保存失败：记忆类型无效',
          returnDisplay: '❌ 错误：记忆类型必须是 "project" 或 "global"'
        };
      }

      // 转换类型
      const memoryType = type === 'global' ? MemoryType.GLOBAL : MemoryType.PROJECT;
      
      // 保存记忆
      const result = await this.memoryService.saveMemory(
        content,
        memoryType,
        title,
        tags
      );

      // 获取记忆统计
      const stats = await this.memoryService.getMemoryStats();
      
      const typeLabel = type === 'global' ? '全局记忆' : '项目记忆';

      // 刷新ContextManager的记忆内容，确保新保存的记忆立即在上下文中生效
      try {
        const contextManager = this.config.getContextManager();
        await contextManager.refreshMemories();
        if (this.config.getDebugMode()) {
          console.log(`[SaveMemoryTool] Refreshed ${typeLabel} in ContextManager`);
        }
      } catch (error) {
        console.warn(`[SaveMemoryTool] Failed to refresh memory context:`, error);
      }
      const currentCount = type === 'global' ? stats.global.entries : stats.project.entries;
      
      let response = `✅ 成功保存${typeLabel}\n\n`;
      response += `**记忆ID**: \`${result.id}\`\n`;
      response += `**保存位置**: \`${result.filePath}\`\n`;
      response += `**当前${typeLabel}数量**: ${currentCount || 0} 条\n\n`;
      
      if (title) {
        response += `**标题**: ${title}\n`;
      }
      
      if (tags && tags.length > 0) {
        response += `**标签**: ${tags.map(tag => `\`${tag}\``).join(', ')}\n`;
      }
      
      response += `\n**保存的内容**:\n${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n`;
      
      // 提供相关提示
      if (type === 'global') {
        response += `💡 **提示**: 全局记忆适用于所有项目，保存的是通用知识和经验。`;
      } else {
        response += `💡 **提示**: 项目记忆仅适用于当前项目，保存的是项目特定的知识和经验。`;
      }

      return {
        llmContent: JSON.stringify({
          success: true,
          memoryId: result.id,
          type: type,
          title: title,
          filePath: result.filePath,
          currentCount: currentCount
        }),
        returnDisplay: response
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        llmContent: `记忆保存失败: ${errorMessage}`,
        returnDisplay: `❌ 保存记忆失败: ${errorMessage}`
      };
    }
  }

  async validate(input: SaveMemoryInput): Promise<boolean> {
    return !!(input.content && input.type && ['project', 'global'].includes(input.type));
  }
}
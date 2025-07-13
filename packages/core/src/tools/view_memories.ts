/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import type { Config } from '../config/config.js';
import { MemoryStorageService, MemoryType } from '../context/memoryStorageService.js';

export interface ViewMemoriesInput {
  type?: 'project' | 'global' | 'both';
  action?: 'view' | 'stats' | 'cleanup';
  cleanup_keep_count?: number;
}

/**
 * 查看记忆工具 - 查看、统计和管理项目记忆或全局记忆
 */
export class ViewMemoriesTool extends BaseTool<ViewMemoriesInput> {
  static Name = 'view_memories';
  
  private memoryService: MemoryStorageService;

  constructor(private config: Config) {
    super(
      'view_memories',
      '查看记忆',
      '查看和管理记忆存储 - 可以查看项目记忆、全局记忆，获取统计信息，或清理旧记忆。',
      {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['project', 'global', 'both'],
            description: '要查看的记忆类型：project（项目记忆）、global（全局记忆）或 both（两者都显示）。默认为 both'
          },
          action: {
            type: Type.STRING,
            enum: ['view', 'stats', 'cleanup'],
            description: '执行的操作：view（查看内容）、stats（显示统计）或 cleanup（清理旧记忆）。默认为 stats'
          },
          cleanup_keep_count: {
            type: Type.NUMBER,
            description: '清理时保留的记忆数量，默认为50。仅在 action 为 cleanup 时使用'
          }
        },
        required: []
      }
    );
    this.memoryService = new MemoryStorageService(
      config.getProjectRoot(),
      config.getDebugMode()
    );
  }

  async execute(input: ViewMemoriesInput): Promise<ToolResult> {
    try {
      const { 
        type = 'both', 
        action = 'stats',
        cleanup_keep_count = 50 
      } = input;

      switch (action) {
        case 'view':
          return await this.viewMemories(type);
        case 'cleanup':
          return await this.cleanupMemories(type, cleanup_keep_count);
        case 'stats':
        default:
          return await this.showMemoryStats(type);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        llmContent: `记忆操作失败: ${errorMessage}`,
        returnDisplay: `❌ 操作失败: ${errorMessage}`
      };
    }
  }

  /**
   * 显示记忆统计信息
   */
  private async showMemoryStats(type: string): Promise<ToolResult> {
    const stats = await this.memoryService.getMemoryStats();
    
    let response = '# 📚 记忆存储统计\n\n';
    
    if (type === 'global' || type === 'both') {
      response += '## 🌍 全局记忆\n';
      if (stats.global.exists) {
        response += `- **状态**: ✅ 已存在\n`;
        response += `- **位置**: \`${stats.global.path}\`\n`;
        response += `- **记忆条目**: ${stats.global.entries || 0} 条\n`;
      } else {
        response += `- **状态**: ❌ 不存在\n`;
        response += `- **位置**: \`${stats.global.path}\`\n`;
        response += `- **记忆条目**: 0 条\n`;
      }
      response += '\n';
    }
    
    if (type === 'project' || type === 'both') {
      response += '## 🏠 项目记忆\n';
      if (stats.project.exists) {
        response += `- **状态**: ✅ 已存在\n`;
        response += `- **位置**: \`${stats.project.path}\`\n`;
        response += `- **记忆条目**: ${stats.project.entries || 0} 条\n`;
      } else {
        response += `- **状态**: ❌ 不存在\n`;
        response += `- **位置**: \`${stats.project.path}\`\n`;
        response += `- **记忆条目**: 0 条\n`;
      }
      response += '\n';
    }
    
    response += '## 💡 使用提示\n\n';
    response += '- 使用 `save_memory` 工具来保存新的记忆\n';
    response += '- 使用 `view_memories` 工具的 `view` 操作来查看记忆内容\n';
    response += '- 使用 `cleanup` 操作来清理旧的记忆条目\n';
    
    return {
      llmContent: JSON.stringify({
        action: 'stats',
        global: stats.global,
        project: stats.project
      }),
      returnDisplay: response
    };
  }

  /**
   * 查看记忆内容
   */
  private async viewMemories(type: string): Promise<ToolResult> {
    let response = '# 📖 记忆内容\n\n';
    
    if (type === 'global' || type === 'both') {
      const globalMemories = await this.memoryService.getMemories(MemoryType.GLOBAL);
      if (globalMemories) {
        response += '## 🌍 全局记忆\n\n';
        // 限制显示长度，避免输出过长
        const truncated = this.truncateContent(globalMemories, 2000);
        response += truncated + '\n\n';
      } else {
        response += '## 🌍 全局记忆\n\n*暂无全局记忆*\n\n';
      }
    }
    
    if (type === 'project' || type === 'both') {
      const projectMemories = await this.memoryService.getMemories(MemoryType.PROJECT);
      if (projectMemories) {
        response += '## 🏠 项目记忆\n\n';
        // 限制显示长度，避免输出过长
        const truncated = this.truncateContent(projectMemories, 2000);
        response += truncated + '\n\n';
      } else {
        response += '## 🏠 项目记忆\n\n*暂无项目记忆*\n\n';
      }
    }
    
    if (response === '# 📖 记忆内容\n\n') {
      response += '*暂无任何记忆*\n\n';
    }
    
    response += '💡 **提示**: 如果内容被截断，可以直接查看 Memory.md 文件获取完整内容。\n';
    
    return {
      llmContent: JSON.stringify({
        action: 'view',
        type: type,
        hasContent: response !== '# 📖 记忆内容\n\n*暂无任何记忆*\n\n💡 **提示**: 如果内容被截断，可以直接查看 Memory.md 文件获取完整内容。\n'
      }),
      returnDisplay: response
    };
  }

  /**
   * 清理旧记忆
   */
  private async cleanupMemories(type: string, keepCount: number): Promise<ToolResult> {
    let response = '# 🧹 记忆清理结果\n\n';
    let totalCleaned = 0;
    
    if (type === 'global' || type === 'both') {
      const globalCleaned = await this.memoryService.cleanupOldMemories(MemoryType.GLOBAL, keepCount);
      response += `## 🌍 全局记忆清理\n`;
      response += `- **清理的条目**: ${globalCleaned} 条\n`;
      response += `- **保留的条目**: ${keepCount} 条\n\n`;
      totalCleaned += globalCleaned;
    }
    
    if (type === 'project' || type === 'both') {
      const projectCleaned = await this.memoryService.cleanupOldMemories(MemoryType.PROJECT, keepCount);
      response += `## 🏠 项目记忆清理\n`;
      response += `- **清理的条目**: ${projectCleaned} 条\n`;
      response += `- **保留的条目**: ${keepCount} 条\n\n`;
      totalCleaned += projectCleaned;
    }
    
    response += `## 📊 总计\n`;
    response += `- **总共清理**: ${totalCleaned} 条记忆\n`;
    response += `- **清理策略**: 保留最新的 ${keepCount} 条记忆\n\n`;
    
    if (totalCleaned === 0) {
      response += '✨ 记忆存储很干净，无需清理！\n';
    } else {
      response += '✅ 清理完成！旧的记忆已被移除，保留了最新的记忆条目。\n';
    }
    
    return {
      llmContent: JSON.stringify({
        action: 'cleanup',
        type: type,
        totalCleaned: totalCleaned,
        keepCount: keepCount
      }),
      returnDisplay: response
    };
  }

  /**
   * 截断内容以避免输出过长
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    const truncated = content.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');
    
    if (lastNewline > maxLength * 0.8) {
      return truncated.substring(0, lastNewline) + '\n\n*[内容已截断，查看完整内容请直接打开 Memory.md 文件]*';
    } else {
      return truncated + '\n\n*[内容已截断，查看完整内容请直接打开 Memory.md 文件]*';
    }
  }

  async validate(input: ViewMemoriesInput): Promise<boolean> {
    const { type = 'both', action = 'stats' } = input;
    
    const validTypes = ['project', 'global', 'both'];
    const validActions = ['view', 'stats', 'cleanup'];
    
    return validTypes.includes(type) && validActions.includes(action);
  }
}
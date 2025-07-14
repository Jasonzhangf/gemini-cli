/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export enum MemoryType {
  PROJECT = 'project',
  GLOBAL = 'global'
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  type: MemoryType;
  title?: string;
  tags?: string[];
}

/**
 * 激发存储服务 - 管理项目记忆和全局记忆
 */
export class MemoryStorageService {
  private projectRoot: string;
  private debugMode: boolean;

  constructor(projectRoot: string, debugMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.debugMode = debugMode;
  }

  /**
   * 保存记忆到指定类型的存储
   */
  async saveMemory(
    content: string,
    type: MemoryType,
    title?: string,
    tags?: string[]
  ): Promise<{ id: string; filePath: string }> {
    const id = this.generateMemoryId();
    const timestamp = new Date().toISOString();
    
    const entry: MemoryEntry = {
      id,
      content: content.trim(),
      timestamp,
      type,
      title,
      tags
    };

    const filePath = await this.writeMemoryEntry(entry);
    
    if (this.debugMode) {
      console.log(`[MemoryStorage] Saved ${type} memory: ${filePath}`);
    }

    return { id, filePath };
  }

  /**
   * 获取记忆存储目录
   */
  private getMemoryDir(type: MemoryType): string {
    if (type === MemoryType.GLOBAL) {
      return path.join(homedir(), '.gemini', 'memories');
    } else {
      return path.join(this.projectRoot, '.gemini', 'memories');
    }
  }

  /**
   * 获取Memory.md文件路径
   */
  private getMemoryFilePath(type: MemoryType): string {
    return path.join(this.getMemoryDir(type), 'Memory.md');
  }

  /**
   * 写入记忆条目到Memory.md
   */
  private async writeMemoryEntry(entry: MemoryEntry): Promise<string> {
    const memoryDir = this.getMemoryDir(entry.type);
    const memoryFilePath = this.getMemoryFilePath(entry.type);

    // 确保目录存在
    await fs.mkdir(memoryDir, { recursive: true });

    // 格式化记忆条目
    const formattedEntry = this.formatMemoryEntry(entry);

    // 读取现有内容（如果文件存在）
    let existingContent = '';
    try {
      existingContent = await fs.readFile(memoryFilePath, 'utf-8');
    } catch (error) {
      // 文件不存在，创建新文件头部
      existingContent = this.createMemoryFileHeader(entry.type);
    }

    // 将新条目添加到文件开头（最新的在前面）
    const updatedContent = this.insertMemoryEntry(existingContent, formattedEntry);

    // 写入更新的内容
    await fs.writeFile(memoryFilePath, updatedContent, 'utf-8');

    return memoryFilePath;
  }

  /**
   * 格式化记忆条目
   */
  private formatMemoryEntry(entry: MemoryEntry): string {
    const date = new Date(entry.timestamp).toLocaleString('zh-CN');
    const typeLabel = entry.type === MemoryType.GLOBAL ? '全局记忆' : '项目记忆';
    
    let formatted = `\n## ${entry.title || '记忆条目'}\n\n`;
    formatted += `**类型**: ${typeLabel}  \n`;
    formatted += `**时间**: ${date}  \n`;
    formatted += `**ID**: \`${entry.id}\`  \n`;
    
    if (entry.tags && entry.tags.length > 0) {
      formatted += `**标签**: ${entry.tags.map(tag => `\`${tag}\``).join(', ')}  \n`;
    }
    
    formatted += `\n### 内容\n\n`;
    formatted += `${entry.content}\n\n`;
    formatted += `---\n`;

    return formatted;
  }

  /**
   * 创建Memory.md文件头部
   */
  private createMemoryFileHeader(type: MemoryType): string {
    const typeLabel = type === MemoryType.GLOBAL ? '全局记忆' : '项目记忆';
    const description = type === MemoryType.GLOBAL 
      ? '适用于所有项目的通用知识和经验'
      : '当前项目的特定知识和经验';

    return `# ${typeLabel}存储\n\n*${description}*\n\n> 此文件由激发存储功能自动维护，记录了重要的知识和经验。\n> 最新的记忆条目显示在前面。\n\n`;
  }

  /**
   * 将新记忆条目插入到现有内容中
   */
  private insertMemoryEntry(existingContent: string, newEntry: string): string {
    const lines = existingContent.split('\n');
    
    // 找到头部结束的位置（找到第一个以 "## " 开头的行或文件末尾）
    let insertIndex = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        insertIndex = i;
        break;
      }
    }

    // 插入新条目
    const beforeLines = lines.slice(0, insertIndex);
    const afterLines = lines.slice(insertIndex);
    
    return [...beforeLines, ...newEntry.split('\n'), ...afterLines].join('\n');
  }

  /**
   * 生成唯一的记忆ID
   */
  private generateMemoryId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `memory_${timestamp}_${random}`;
  }

  /**
   * 读取指定类型的所有记忆
   */
  async getMemories(type: MemoryType): Promise<string | null> {
    const memoryFilePath = this.getMemoryFilePath(type);
    
    try {
      const content = await fs.readFile(memoryFilePath, 'utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查指定类型的记忆文件是否存在
   */
  async hasMemories(type: MemoryType): Promise<boolean> {
    const memoryFilePath = this.getMemoryFilePath(type);
    
    try {
      await fs.access(memoryFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取记忆统计信息
   */
  async getMemoryStats(): Promise<{
    global: { exists: boolean; path: string; entries?: number };
    project: { exists: boolean; path: string; entries?: number };
  }> {
    const globalPath = this.getMemoryFilePath(MemoryType.GLOBAL);
    const projectPath = this.getMemoryFilePath(MemoryType.PROJECT);
    
    const [globalExists, projectExists] = await Promise.all([
      this.hasMemories(MemoryType.GLOBAL),
      this.hasMemories(MemoryType.PROJECT)
    ]);

    const result = {
      global: { exists: globalExists, path: globalPath } as any,
      project: { exists: projectExists, path: projectPath } as any
    };

    // 计算条目数量
    if (globalExists) {
      const globalContent = await this.getMemories(MemoryType.GLOBAL);
      result.global.entries = this.countMemoryEntries(globalContent || '');
    }

    if (projectExists) {
      const projectContent = await this.getMemories(MemoryType.PROJECT);
      result.project.entries = this.countMemoryEntries(projectContent || '');
    }

    return result;
  }

  /**
   * 计算记忆条目数量
   */
  private countMemoryEntries(content: string): number {
    // 计算以 "## " 开头的行数（这些都是实际的记忆条目）
    // 文件标题使用 "# " 开头，所以 "## " 都是记忆条目
    const lines = content.split('\n');
    let count = 0;
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * 清理旧的记忆条目（保留最近的N个）
   */
  async cleanupOldMemories(type: MemoryType, keepCount: number = 50): Promise<number> {
    const content = await this.getMemories(type);
    if (!content) return 0;

    const entries = this.parseMemoryEntries(content);
    if (entries.length <= keepCount) return 0;

    // 保留最新的记忆条目
    const entriesToKeep = entries.slice(0, keepCount);
    const removedCount = entries.length - keepCount;

    // 重建文件内容
    const header = this.createMemoryFileHeader(type);
    const newContent = header + entriesToKeep.join('\n');

    const memoryFilePath = this.getMemoryFilePath(type);
    await fs.writeFile(memoryFilePath, newContent, 'utf-8');

    if (this.debugMode) {
      console.log(`[MemoryStorage] Cleaned up ${removedCount} old ${type} memories`);
    }

    return removedCount;
  }

  /**
   * 解析记忆条目
   */
  private parseMemoryEntries(content: string): string[] {
    const sections = content.split(/^## /m);
    return sections.slice(1).map(section => '## ' + section);
  }
}
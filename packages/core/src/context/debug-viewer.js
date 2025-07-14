#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { ContextSnapshot } from './contextDebugger.js';

/**
 * 上下文调试查看器 - 用于查看和分析保存的上下文快照
 */
export class ContextDebugViewer {
  private debugBaseDir: string;

  constructor(projectRoot?: string) {
    const baseDir = projectRoot || process.cwd();
    this.debugBaseDir = path.join(baseDir, '.gemini', 'debug');
  }

  /**
   * 列出所有可用的调试会话
   */
  async listSessions(): Promise<string[]> {
    try {
      const sessions = await fs.readdir(this.debugBaseDir);
      return sessions.filter(async (session) => {
        const sessionPath = path.join(this.debugBaseDir, session);
        const stat = await fs.stat(sessionPath);
        return stat.isDirectory();
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取指定会话的所有轮次
   */
  async getSessionTurns(sessionId: string): Promise<number[]> {
    try {
      const sessionDir = path.join(this.debugBaseDir, sessionId);
      const files = await fs.readdir(sessionDir);
      
      const turns: number[] = [];
      for (const file of files) {
        if (file.startsWith('turn-') && file.endsWith('.json')) {
          const turnMatch = file.match(/turn-(\d+)\.json/);
          if (turnMatch) {
            turns.push(parseInt(turnMatch[1], 10));
          }
        }
      }
      
      return turns.sort((a, b) => a - b);
    } catch (error) {
      return [];
    }
  }

  /**
   * 读取指定轮次的上下文快照
   */
  async getSnapshot(sessionId: string, turnNumber: number): Promise<ContextSnapshot | null> {
    try {
      const snapshotFile = path.join(
        this.debugBaseDir, 
        sessionId, 
        `turn-${turnNumber.toString().padStart(3, '0')}.json`
      );
      const content = await fs.readFile(snapshotFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * 读取指定轮次的人类可读摘要
   */
  async getSummary(sessionId: string, turnNumber: number): Promise<string | null> {
    try {
      const summaryFile = path.join(
        this.debugBaseDir,
        sessionId,
        `turn-${turnNumber.toString().padStart(3, '0')}-summary.md`
      );
      return await fs.readFile(summaryFile, 'utf-8');
    } catch (error) {
      return null;
    }
  }

  /**
   * 比较两个轮次的上下文差异
   */
  async compareSnapshots(
    sessionId: string, 
    turn1: number, 
    turn2: number
  ): Promise<string> {
    const snapshot1 = await this.getSnapshot(sessionId, turn1);
    const snapshot2 = await this.getSnapshot(sessionId, turn2);

    if (!snapshot1 || !snapshot2) {
      return 'Unable to load one or both snapshots for comparison.';
    }

    const data1 = snapshot1.contextData;
    const data2 = snapshot2.contextData;

    let report = `# Context Comparison: Turn ${turn1} vs Turn ${turn2}\n\n`;

    // 比较总体统计
    report += `## 总体变化\n`;
    report += `- **总大小**: ${data1.generated.totalContextSize.toLocaleString()} → ${data2.generated.totalContextSize.toLocaleString()} (${data2.generated.totalContextSize - data1.generated.totalContextSize > 0 ? '+' : ''}${data2.generated.totalContextSize - data1.generated.totalContextSize})\n`;
    report += `- **内存工具**: ${data1.generated.memorySize.toLocaleString()} → ${data2.generated.memorySize.toLocaleString()}\n`;
    report += `- **静态上下文**: ${data1.generated.staticSize.toLocaleString()} → ${data2.generated.staticSize.toLocaleString()}\n`;
    report += `- **动态上下文**: ${data1.generated.dynamicSize.toLocaleString()} → ${data2.generated.dynamicSize.toLocaleString()}\n`;
    report += `- **任务管理**: ${data1.generated.taskSize.toLocaleString()} → ${data2.generated.taskSize.toLocaleString()}\n\n`;

    // 比较任务状态
    report += `## 任务变化\n`;
    if (data1.taskManagement.isActive !== data2.taskManagement.isActive) {
      report += `- **状态**: ${data1.taskManagement.isActive ? '激活' : '未激活'} → ${data2.taskManagement.isActive ? '激活' : '未激活'}\n`;
    }
    if (data1.taskManagement.completedCount !== data2.taskManagement.completedCount) {
      report += `- **完成任务**: ${data1.taskManagement.completedCount}/${data1.taskManagement.totalCount} → ${data2.taskManagement.completedCount}/${data2.taskManagement.totalCount}\n`;
    }

    // 比较历史记录
    report += `## 历史记录变化\n`;
    report += `- **记录数**: ${data1.history.recordCount} → ${data2.history.recordCount}\n`;
    report += `- **用户轮次**: ${data1.history.userTurns} → ${data2.history.userTurns}\n`;
    report += `- **模型轮次**: ${data1.history.modelTurns} → ${data2.history.modelTurns}\n`;

    return report;
  }

  /**
   * 生成会话的完整报告
   */
  async generateSessionReport(sessionId: string): Promise<string> {
    const turns = await this.getSessionTurns(sessionId);
    if (turns.length === 0) {
      return `No turns found for session ${sessionId}`;
    }

    let report = `# Session Report: ${sessionId}\n\n`;
    report += `**Total Turns**: ${turns.length}\n`;
    report += `**Generated**: ${new Date().toLocaleString()}\n\n`;

    // 获取第一个和最后一个快照用于对比
    const firstSnapshot = await this.getSnapshot(sessionId, turns[0]);
    const lastSnapshot = await this.getSnapshot(sessionId, turns[turns.length - 1]);

    if (firstSnapshot && lastSnapshot) {
      const firstData = firstSnapshot.contextData;
      const lastData = lastSnapshot.contextData;

      report += `## Session Overview\n`;
      report += `- **Duration**: Turn ${turns[0]} to ${turns[turns.length - 1]}\n`;
      report += `- **Context Growth**: ${firstData.generated.totalContextSize.toLocaleString()} → ${lastData.generated.totalContextSize.toLocaleString()} characters\n`;
      report += `- **Task Activity**: ${lastData.taskManagement.isActive ? 'Active' : 'Inactive'}\n`;
      if (lastData.taskManagement.isActive) {
        report += `- **Task Progress**: ${lastData.taskManagement.completedCount}/${lastData.taskManagement.totalCount} completed\n`;
      }
      report += `\n`;
    }

    // 每轮的简要信息
    report += `## Turn Summary\n`;
    for (const turn of turns) {
      const snapshot = await this.getSnapshot(sessionId, turn);
      if (snapshot) {
        const data = snapshot.contextData;
        report += `- **Turn ${turn}**: ${data.generated.totalContextSize.toLocaleString()} chars`;
        if (data.taskManagement.isActive) {
          report += `, Tasks: ${data.taskManagement.completedCount}/${data.taskManagement.totalCount}`;
        }
        report += `\n`;
      }
    }

    return report;
  }
}

// CLI界面（如果直接运行此脚本）
if (import.meta.url === `file://${process.argv[1]}`) {
  const viewer = new ContextDebugViewer();
  
  async function main() {
    const command = process.argv[2];
    
    switch (command) {
      case 'sessions':
        const sessions = await viewer.listSessions();
        console.log('Available debug sessions:');
        sessions.forEach(session => console.log(`  ${session}`));
        break;
        
      case 'turns':
        const sessionId = process.argv[3];
        if (!sessionId) {
          console.error('Usage: debug-viewer turns <session-id>');
          process.exit(1);
        }
        const turns = await viewer.getSessionTurns(sessionId);
        console.log(`Turns in session ${sessionId}:`, turns);
        break;
        
      case 'show':
        const showSessionId = process.argv[3];
        const turnNumber = parseInt(process.argv[4], 10);
        if (!showSessionId || isNaN(turnNumber)) {
          console.error('Usage: debug-viewer show <session-id> <turn-number>');
          process.exit(1);
        }
        const summary = await viewer.getSummary(showSessionId, turnNumber);
        if (summary) {
          console.log(summary);
        } else {
          console.log('Summary not found');
        }
        break;
        
      case 'compare':
        const compareSessionId = process.argv[3];
        const turn1 = parseInt(process.argv[4], 10);
        const turn2 = parseInt(process.argv[5], 10);
        if (!compareSessionId || isNaN(turn1) || isNaN(turn2)) {
          console.error('Usage: debug-viewer compare <session-id> <turn1> <turn2>');
          process.exit(1);
        }
        const comparison = await viewer.compareSnapshots(compareSessionId, turn1, turn2);
        console.log(comparison);
        break;
        
      case 'report':
        const reportSessionId = process.argv[3];
        if (!reportSessionId) {
          console.error('Usage: debug-viewer report <session-id>');
          process.exit(1);
        }
        const report = await viewer.generateSessionReport(reportSessionId);
        console.log(report);
        break;
        
      default:
        console.log('Context Debug Viewer');
        console.log('Usage:');
        console.log('  debug-viewer sessions                     - List all debug sessions');
        console.log('  debug-viewer turns <session-id>          - List turns in a session');
        console.log('  debug-viewer show <session-id> <turn>    - Show turn summary');
        console.log('  debug-viewer compare <session> <t1> <t2> - Compare two turns');
        console.log('  debug-viewer report <session-id>         - Generate session report');
    }
  }
  
  main().catch(console.error);
}
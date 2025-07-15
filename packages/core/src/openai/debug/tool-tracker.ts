/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolTracker } from '../types/interfaces.js';

/**
 * 工具调用追踪器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ToolCallTracker {
  private readonly trackers: Map<string, ToolTracker> = new Map();
  private readonly debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  /**
   * 更新工具调用统计
   */
  updateTracker(toolName: string, action: 'discovered' | 'attempted' | 'succeeded' | 'failed'): void {
    if (!this.trackers.has(toolName)) {
      this.trackers.set(toolName, {
        discovered: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        callIds: []
      });
    }
    
    const tracker = this.trackers.get(toolName)!;
    tracker[action]++;
    
    if (this.debugMode) {
      console.log(`[ToolTracker] ${toolName} - ${action}: ${tracker[action]}`);
    }
  }

  /**
   * 添加调用ID
   */
  addCallId(toolName: string, callId: string): void {
    if (!this.trackers.has(toolName)) {
      this.updateTracker(toolName, 'discovered');
    }
    
    const tracker = this.trackers.get(toolName)!;
    if (!tracker.callIds.includes(callId)) {
      tracker.callIds.push(callId);
    }
  }

  /**
   * 获取工具统计
   */
  getTracker(toolName: string): ToolTracker | undefined {
    return this.trackers.get(toolName);
  }

  /**
   * 获取所有统计
   */
  getAllTrackers(): Map<string, ToolTracker> {
    return new Map(this.trackers);
  }

  /**
   * 获取统计字符串
   */
  getStatsString(): string {
    const stats: string[] = [];
    for (const [toolName, tracker] of this.trackers.entries()) {
      stats.push(`${toolName}: discovered=${tracker.discovered}, attempted=${tracker.attempted}, succeeded=${tracker.succeeded}, failed=${tracker.failed}`);
    }
    return stats.join('; ');
  }

  /**
   * 获取摘要统计
   */
  getSummaryStats(): {
    totalTools: number;
    totalDiscovered: number;
    totalAttempted: number;
    totalSucceeded: number;
    totalFailed: number;
    successRate: number;
  } {
    let totalDiscovered = 0;
    let totalAttempted = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (const tracker of this.trackers.values()) {
      totalDiscovered += tracker.discovered;
      totalAttempted += tracker.attempted;
      totalSucceeded += tracker.succeeded;
      totalFailed += tracker.failed;
    }

    const successRate = totalAttempted > 0 ? totalSucceeded / totalAttempted : 0;

    return {
      totalTools: this.trackers.size,
      totalDiscovered,
      totalAttempted,
      totalSucceeded,
      totalFailed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.trackers.clear();
  }

  /**
   * 获取失败的工具
   */
  getFailedTools(): string[] {
    const failedTools: string[] = [];
    for (const [toolName, tracker] of this.trackers.entries()) {
      if (tracker.failed > 0) {
        failedTools.push(toolName);
      }
    }
    return failedTools;
  }

  /**
   * 获取成功的工具
   */
  getSuccessfulTools(): string[] {
    const successfulTools: string[] = [];
    for (const [toolName, tracker] of this.trackers.entries()) {
      if (tracker.succeeded > 0) {
        successfulTools.push(toolName);
      }
    }
    return successfulTools;
  }

  /**
   * 获取从未使用的工具
   */
  getUnusedTools(availableTools: string[]): string[] {
    return availableTools.filter(tool => !this.trackers.has(tool));
  }

  /**
   * 检查是否有统计数据
   */
  hasStats(): boolean {
    return this.trackers.size > 0;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugLogger } from '../../context/debugLogger.js';
import { ToolCall, ToolTracker } from '../types/interfaces.js';

/**
 * 调试日志适配器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class DebugLoggerAdapter {
  private debugLogger: DebugLogger | null = null;
  private readonly debugMode: boolean;
  private readonly sessionId: string;
  private readonly projectDir: string;
  private currentTurnId: string = '';
  private initializationPromise: Promise<void> | null = null;

  constructor(sessionId: string, projectDir: string, debugMode: boolean = false) {
    this.sessionId = sessionId;
    this.projectDir = projectDir;
    this.debugMode = debugMode;
  }

  /**
   * 初始化调试日志器
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  /**
   * 执行初始化
   */
  private async doInitialize(): Promise<void> {
    if (!this.debugMode) {
      return;
    }

    try {
      console.log('[DebugLoggerAdapter] Initializing debug logger for session:', this.sessionId);
      this.debugLogger = await DebugLogger.create(this.sessionId, this.projectDir, true);
      console.log('[DebugLoggerAdapter] ✅ Debug logger initialized successfully');
    } catch (error) {
      console.warn('[DebugLoggerAdapter] ❌ Failed to initialize debug logger:', error);
    }
  }

  /**
   * 确保日志器已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.debugLogger && this.debugMode) {
      await this.initialize();
    }
  }

  /**
   * 开始新的轮次
   */
  async startTurn(turnId: string, userMessage: string): Promise<void> {
    await this.ensureInitialized();
    
    this.currentTurnId = turnId;
    if (this.debugLogger) {
      this.debugLogger.startTurn(turnId, userMessage);
      if (this.debugMode) {
        console.log('[DebugLoggerAdapter] Started turn:', turnId);
      }
    }
  }

  /**
   * 记录系统上下文
   */
  async logSystemContext(context: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logSystemContext(context);
    }
  }

  /**
   * 记录静态上下文
   */
  async logStaticContext(context: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logStaticContext(context);
    }
  }

  /**
   * 记录动态上下文
   */
  async logDynamicContext(context: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logDynamicContext(context);
    }
  }

  /**
   * 记录任务上下文
   */
  async logTaskContext(context: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logTaskContext(context);
    }
  }

  /**
   * 记录发送给模型的内容
   */
  async logSentToModel(request: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logSentToModel(request);
    }
  }

  /**
   * 记录模型响应
   */
  async logModelResponse(response: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logModelResponse(response);
    }
  }

  /**
   * 记录原始模型响应
   */
  async logRawModelResponse(response: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logRawModelResponse(response);
    }
  }

  /**
   * 记录工具调用
   */
  async logToolCall(name: string, args: any, result?: any, error?: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logToolCall(name, args, result, error);
    }
  }

  /**
   * 记录错误
   */
  async logError(error: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logError(error);
    }
  }

  /**
   * 记录元数据
   */
  async logMetadata(metadata: any): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger) {
      this.debugLogger.logMetadata(metadata);
    }
  }

  /**
   * 完成轮次
   */
  async finalizeTurn(): Promise<void> {
    await this.ensureInitialized();
    
    if (this.debugLogger && this.currentTurnId) {
      try {
        await this.debugLogger.finalizeTurn();
        if (this.debugMode) {
          console.log('[DebugLoggerAdapter] ✅ Turn finalized:', this.currentTurnId);
        }
      } catch (error) {
        if (this.debugMode) {
          console.warn('[DebugLoggerAdapter] Turn finalization failed:', error);
        }
      }
    }
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.debugMode && this.debugLogger !== null;
  }

  /**
   * 获取当前轮次ID
   */
  getCurrentTurnId(): string {
    return this.currentTurnId;
  }

  /**
   * 生成轮次ID
   */
  generateTurnId(): string {
    return `turn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }
}
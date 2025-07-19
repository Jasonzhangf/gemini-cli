/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config } from '../config/config.js';
import { 
  IntentRecognitionRequest, 
  IntentRecognitionResponse, 
  IntentRecognitionError 
} from './contextAgentLLMProcess.js';

export interface ProcessManagerOptions {
  maxConcurrentRequests?: number;
  requestTimeout?: number;
  restartOnFailure?: boolean;
  debugMode?: boolean;
}

/**
 * 管理独立的ContextAgent LLM进程
 */
export class ContextAgentProcessManager extends EventEmitter {
  private config: Config;
  private options: ProcessManagerOptions;
  private llmProcess: ChildProcess | null = null;
  private isInitialized = false;
  private pendingRequests = new Map<string, {
    resolve: (value: IntentRecognitionResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestCounter = 0;

  constructor(config: Config, options: ProcessManagerOptions = {}) {
    super();
    this.config = config;
    this.options = {
      maxConcurrentRequests: 10,
      requestTimeout: 30000, // 30秒超时
      restartOnFailure: true,
      debugMode: false,
      ...options
    };
  }

  /**
   * 初始化进程管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.startLLMProcess();
      this.isInitialized = true;
      
      if (this.options.debugMode) {
        console.log('[ContextAgentProcessManager] Initialized successfully');
      }
    } catch (error) {
      console.error('[ContextAgentProcessManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 启动LLM进程
   */
  private async startLLMProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 创建子进程来运行LLM处理
        this.llmProcess = spawn('node', [
          '-e',
          `
          const { ContextAgentLLMWorker } = require('./contextAgentLLMWorker.js');
          const worker = new ContextAgentLLMWorker();
          worker.start();
          `
        ], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          cwd: process.cwd(),
          env: {
            ...process.env,
            CONTEXTAGENT_PROVIDER: process.env.CONTEXTAGENT_PROVIDER || 'gemini',
            CONTEXTAGENT_MODEL: process.env.CONTEXTAGENT_MODEL || 'gemini-1.5-flash'
          }
        });

        // 处理进程消息
        this.llmProcess.on('message', (message: any) => {
          this.handleProcessMessage(message);
        });

        // 处理进程错误
        this.llmProcess.on('error', (error) => {
          console.error('[ContextAgentProcessManager] Process error:', error);
          this.emit('error', error);
          if (this.options.restartOnFailure) {
            this.restartProcess();
          }
        });

        // 处理进程退出
        this.llmProcess.on('exit', (code, signal) => {
          if (this.options.debugMode) {
            console.log(`[ContextAgentProcessManager] Process exited with code ${code}, signal ${signal}`);
          }
          this.llmProcess = null;
          
          if (this.options.restartOnFailure && this.isInitialized) {
            this.restartProcess();
          }
        });

        // 等待进程准备就绪
        const readyTimeout = setTimeout(() => {
          reject(new Error('LLM process failed to start within timeout'));
        }, 10000);

        this.llmProcess.once('message', (message: any) => {
          if (message.type === 'ready') {
            clearTimeout(readyTimeout);
            resolve();
          }
        });

        if (this.options.debugMode) {
          console.log('[ContextAgentProcessManager] LLM process started');
        }

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理进程消息
   */
  private handleProcessMessage(message: any): void {
    if (message.type === 'response') {
      const response = message.data as IntentRecognitionResponse;
      this.resolveRequest(response.requestId, response);
    } else if (message.type === 'error') {
      const error = message.data as IntentRecognitionError;
      this.rejectRequest(error.requestId, new Error(error.error));
    }
  }

  /**
   * 发送意图识别请求
   */
  async requestIntentRecognition(userInput: string): Promise<IntentRecognitionResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.llmProcess) {
      throw new Error('LLM process is not available');
    }

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    const request: IntentRecognitionRequest = {
      userInput,
      requestId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      // 检查并发请求限制
      if (this.pendingRequests.size >= this.options.maxConcurrentRequests!) {
        reject(new Error('Maximum concurrent requests exceeded'));
        return;
      }

      // 设置请求超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out`));
      }, this.options.requestTimeout!);

      // 存储请求回调
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout
      });

      // 发送请求到子进程
      this.llmProcess!.send({
        type: 'request',
        data: request
      });

      if (this.options.debugMode) {
        console.log(`[ContextAgentProcessManager] Sent request ${requestId}`);
      }
    });
  }

  /**
   * 解析请求
   */
  private resolveRequest(requestId: string, response: IntentRecognitionResponse): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
      
      if (this.options.debugMode) {
        console.log(`[ContextAgentProcessManager] Resolved request ${requestId}`);
      }
    }
  }

  /**
   * 拒绝请求
   */
  private rejectRequest(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.reject(error);
      
      if (this.options.debugMode) {
        console.log(`[ContextAgentProcessManager] Rejected request ${requestId}:`, error.message);
      }
    }
  }

  /**
   * 重启进程
   */
  private async restartProcess(): Promise<void> {
    if (this.options.debugMode) {
      console.log('[ContextAgentProcessManager] Restarting LLM process...');
    }

    // 清理现有进程
    if (this.llmProcess) {
      this.llmProcess.kill('SIGTERM');
      this.llmProcess = null;
    }

    // 拒绝所有待处理的请求
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Process restarted'));
    }
    this.pendingRequests.clear();

    // 重新启动进程
    try {
      await this.startLLMProcess();
      if (this.options.debugMode) {
        console.log('[ContextAgentProcessManager] Process restarted successfully');
      }
    } catch (error) {
      console.error('[ContextAgentProcessManager] Failed to restart process:', error);
      this.emit('error', error);
    }
  }

  /**
   * 获取进程状态
   */
  getStatus(): {
    isInitialized: boolean;
    isProcessRunning: boolean;
    pendingRequests: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isProcessRunning: this.llmProcess !== null,
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.isInitialized = false;

    // 拒绝所有待处理的请求
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Process manager disposed'));
    }
    this.pendingRequests.clear();

    // 终止子进程
    if (this.llmProcess) {
      this.llmProcess.kill('SIGTERM');
      this.llmProcess = null;
    }

    if (this.options.debugMode) {
      console.log('[ContextAgentProcessManager] Disposed');
    }
  }
}
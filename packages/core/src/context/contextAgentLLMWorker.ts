/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IntentRecognitionRequest, 
  IntentRecognitionResponse, 
  IntentRecognitionError,
  ContextAgentLLMProcess 
} from './contextAgentLLMProcess.js';
import { Config } from '../config/config.js';

/**
 * 独立进程中的LLM Worker
 * 负责处理意图识别请求
 */
export class ContextAgentLLMWorker {
  private llmProcess: ContextAgentLLMProcess | null = null;
  private isInitialized = false;

  constructor() {
    // 在独立进程中创建配置
    this.setupProcessHandlers();
  }

  /**
   * 设置进程处理器
   */
  private setupProcessHandlers(): void {
    // 处理父进程消息
    process.on('message', async (message: any) => {
      if (message.type === 'request') {
        await this.handleRequest(message.data as IntentRecognitionRequest);
      }
    });

    // 处理进程退出
    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('[ContextAgentLLMWorker] Uncaught exception:', error);
      this.cleanup();
      process.exit(1);
    });
  }

  /**
   * 启动Worker
   */
  async start(): Promise<void> {
    try {
      // 创建简化的配置用于LLM处理
      const config = await this.createWorkerConfig();
      
      // 初始化LLM处理器
      this.llmProcess = new ContextAgentLLMProcess(config);
      await this.llmProcess.initialize();
      
      this.isInitialized = true;
      
      // 通知父进程准备就绪
      this.sendToParent({
        type: 'ready',
        data: { timestamp: Date.now() }
      });

      console.log('[ContextAgentLLMWorker] Worker started and ready');

    } catch (error) {
      console.error('[ContextAgentLLMWorker] Failed to start:', error);
      this.sendToParent({
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error), timestamp: Date.now() }
      });
      process.exit(1);
    }
  }

  /**
   * 处理意图识别请求
   */
  private async handleRequest(request: IntentRecognitionRequest): Promise<void> {
    try {
      if (!this.isInitialized || !this.llmProcess) {
        throw new Error('Worker not initialized');
      }

      console.log(`[ContextAgentLLMWorker] Processing request: ${request.requestId}`);

      // 处理意图识别
      const response = await this.llmProcess.processIntentRecognition(request);

      // 发送响应到父进程
      this.sendToParent({
        type: 'response',
        data: response
      });

      console.log(`[ContextAgentLLMWorker] Completed request: ${request.requestId}`);

    } catch (error) {
      console.error(`[ContextAgentLLMWorker] Failed to process request ${request.requestId}:`, error);
      
      // 发送错误到父进程
      const errorResponse: IntentRecognitionError = {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };

      this.sendToParent({
        type: 'error',
        data: errorResponse
      });
    }
  }

  /**
   * 创建Worker配置
   */
  private async createWorkerConfig(): Promise<Config> {
    // 创建一个简化的配置对象用于LLM处理
    // 这里我们需要模拟Config类的基本功能
    const mockConfig = {
      getDebugMode: () => process.env.DEBUG === '1' || process.env.CONTEXTAGENT_DEBUG === '1',
      getGeminiClient: () => {
        // 在实际实现中，这里需要创建一个真实的GeminiClient
        // 为了简化，我们使用一个模拟的实现
        throw new Error('GeminiClient needs to be properly initialized in worker process');
      }
    };

    return mockConfig as unknown as Config;
  }

  /**
   * 发送消息到父进程
   */
  private sendToParent(message: any): void {
    if (process.send) {
      process.send(message);
    } else {
      console.error('[ContextAgentLLMWorker] No IPC channel available');
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.llmProcess) {
      this.llmProcess.dispose();
      this.llmProcess = null;
    }
    this.isInitialized = false;
  }
}

// 如果直接运行此文件，启动Worker
if (require.main === module) {
  const worker = new ContextAgentLLMWorker();
  worker.start().catch(error => {
    console.error('[ContextAgentLLMWorker] Failed to start worker:', error);
    process.exit(1);
  });
}
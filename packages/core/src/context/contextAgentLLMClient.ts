/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import { 
  IntentRecognitionRequest, 
  IntentRecognitionResponse 
} from './contextAgentLLMProcess.js';

/**
 * ContextAgent LLM客户端
 * 管理独立的LLM服务器进程并与之通信
 */
export class ContextAgentLLMClient {
  private serverProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private isInitialized = false;
  private debugMode: boolean;
  private requestTimeout: number;

  constructor(options: { debugMode?: boolean; requestTimeout?: number } = {}) {
    this.debugMode = options.debugMode || false;
    this.requestTimeout = options.requestTimeout || 30000;
  }

  /**
   * 初始化客户端和服务器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.startServer();
      await this.waitForServerReady();
      this.isInitialized = true;
      
      if (this.debugMode) {
        console.log('[ContextAgentLLMClient] Client initialized successfully');
      }
    } catch (error) {
      console.error('[ContextAgentLLMClient] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 启动独立的LLM服务器进程
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 创建独立的Node.js进程来运行LLM服务器
        this.serverProcess = spawn('node', [
          '-e', `
            const { ContextAgentLLMServer } = require('@google/gemini-cli-core/dist/src/context/contextAgentLLMServer.js');
            const server = new ContextAgentLLMServer();
            server.start().then(port => {
              console.log('SERVER_READY:' + port);
            }).catch(error => {
              console.error('SERVER_ERROR:', error);
              process.exit(1);
            });
          `
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CONTEXTAGENT_PROVIDER: process.env.CONTEXTAGENT_PROVIDER || 'gemini',
            CONTEXTAGENT_MODEL: process.env.CONTEXTAGENT_MODEL || 'gemini-1.5-flash',
            CONTEXTAGENT_DEBUG: this.debugMode ? '1' : '0'
          }
        });

        // 处理stdout以获取端口信息
        this.serverProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          if (this.debugMode) {
            console.log('[ContextAgentLLMClient] Server output:', output);
          }
          
          const match = output.match(/SERVER_READY:(\d+)/);
          if (match) {
            this.serverPort = parseInt(match[1]);
            resolve();
          }
        });

        // 处理stderr
        this.serverProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          console.error('[ContextAgentLLMClient] Server error:', error);
          
          if (error.includes('SERVER_ERROR:')) {
            reject(new Error(error));
          }
        });

        // 处理进程错误
        this.serverProcess.on('error', (error) => {
          console.error('[ContextAgentLLMClient] Process error:', error);
          reject(error);
        });

        // 处理进程退出
        this.serverProcess.on('exit', (code, signal) => {
          if (this.debugMode) {
            console.log(`[ContextAgentLLMClient] Server process exited with code ${code}, signal ${signal}`);
          }
          this.serverProcess = null;
          this.serverPort = null;
        });

        // 设置启动超时
        setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 60000); // 增加到60秒以允许RAG索引

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 等待服务器准备就绪
   */
  private async waitForServerReady(): Promise<void> {
    if (!this.serverPort) {
      throw new Error('Server port not available');
    }

    const maxAttempts = 60; // 增加到60次尝试
    const attemptInterval = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.makeHttpRequest('GET', '/health');
        if (response.status === 'healthy') {
          return;
        }
      } catch (error) {
        // 忽略连接错误，继续尝试
      }

      await new Promise(resolve => setTimeout(resolve, attemptInterval));
    }

    throw new Error('Server failed to become ready within timeout');
  }

  /**
   * 发送意图识别请求
   */
  async requestIntentRecognition(userInput: string): Promise<IntentRecognitionResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const request: IntentRecognitionRequest = {
      userInput,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    // 打印LLM输入信息
    if (this.debugMode || process.env.CONTEXTAGENT_DEBUG === '1') {
      console.log('=== [🤖 LLM] LLM意图识别输入调试信息 ===');
      console.log('[🤖 LLM] 用户输入内容:', userInput);
      console.log('[🤖 LLM] 请求ID:', request.requestId);
      console.log('[🤖 LLM] 时间戳:', new Date(request.timestamp).toISOString());
      console.log('============================================');
    }

    try {
      const response = await this.makeHttpRequest('POST', '/intent-recognition', request);
      
      // 打印LLM语义分析结果
      if (this.debugMode || process.env.CONTEXTAGENT_DEBUG === '1') {
        console.log('=== [🤖 LLM] LLM意图识别输出结果 ===');
        console.log('[🤖 LLM] 意图识别:', response.intent);
        console.log('[🤖 LLM] 提取的关键字:', response.keywords);
        console.log('[🤖 LLM] 置信度:', response.confidence);
        console.log('[🤖 LLM] 处理时间:', response.processingTime + 'ms');
        console.log('[🤖 LLM] 响应时间戳:', new Date(response.timestamp).toISOString());
        console.log('==========================================');
      }
      
      return response as IntentRecognitionResponse;
    } catch (error) {
      console.error('[ContextAgentLLMClient] Intent recognition request failed:', error);
      throw error;
    }
  }

  /**
   * 发送HTTP请求
   */
  private async makeHttpRequest(method: string, path: string, data?: any): Promise<any> {
    if (!this.serverPort) {
      throw new Error('Server not available');
    }

    const url = `http://127.0.0.1:${this.serverPort}${path}`;
    
    return new Promise((resolve, reject) => {
      const http = require('http');
      const postData = data ? JSON.stringify(data) : undefined;
      
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
      };

      const req = http.request(url, options, (res: any) => {
        let responseData = '';
        
        res.on('data', (chunk: any) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${responseData}`));
          }
        });
      });

      req.on('error', (error: any) => {
        reject(error);
      });

      // 设置请求超时
      req.setTimeout(this.requestTimeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }

  /**
   * 检查服务器健康状态
   */
  async checkHealth(): Promise<{ status: string; timestamp: number; isLLMReady: boolean }> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    return await this.makeHttpRequest('GET', '/health');
  }

  /**
   * 获取客户端状态
   */
  getStatus(): { isInitialized: boolean; serverPort: number | null; isServerRunning: boolean } {
    return {
      isInitialized: this.isInitialized,
      serverPort: this.serverPort,
      isServerRunning: this.serverProcess !== null
    };
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.isInitialized = false;

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      
      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (this.serverProcess) {
          this.serverProcess.on('exit', () => {
            resolve();
          });
          
          // 强制终止超时
          setTimeout(() => {
            if (this.serverProcess) {
              this.serverProcess.kill('SIGKILL');
            }
            resolve();
          }, 5000);
        } else {
          resolve();
        }
      });
      
      this.serverProcess = null;
    }
    
    this.serverPort = null;
    
    if (this.debugMode) {
      console.log('[ContextAgentLLMClient] Client disposed');
    }
  }
}
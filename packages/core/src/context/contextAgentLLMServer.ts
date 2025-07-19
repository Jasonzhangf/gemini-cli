/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { createServer, Server } from 'http';
import { URL } from 'url';
import { 
  IntentRecognitionRequest, 
  IntentRecognitionResponse, 
  ContextAgentLLMProcess 
} from './contextAgentLLMProcess.js';
import { Config } from '../config/config.js';

/**
 * 独立的ContextAgent LLM HTTP服务器
 * 作为单独进程运行，提供意图识别服务
 */
export class ContextAgentLLMServer {
  private server: Server;
  private llmProcess: ContextAgentLLMProcess | null = null;
  private port: number;
  private isRunning = false;

  constructor(port: number = 0) {
    this.port = port;
    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * 启动服务器
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.server.listen(this.port, '127.0.0.1', async () => {
          const address = this.server.address();
          if (address && typeof address === 'object') {
            this.port = address.port;
          }
          
          try {
            // 初始化LLM处理器
            await this.initializeLLMProcess();
            this.isRunning = true;
            
            console.log(`[ContextAgentLLMServer] Server started on port ${this.port}`);
            resolve(this.port);
          } catch (error) {
            reject(error);
          }
        });

        this.server.on('error', (error) => {
          console.error('[ContextAgentLLMServer] Server error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 初始化LLM处理器
   */
  private async initializeLLMProcess(): Promise<void> {
    try {
      // 创建简化的配置
      const config = await this.createServerConfig();
      
      this.llmProcess = new ContextAgentLLMProcess(config);
      await this.llmProcess.initialize();
      
    } catch (error) {
      console.error('[ContextAgentLLMServer] Failed to initialize LLM process:', error);
      throw error;
    }
  }

  /**
   * 处理HTTP请求
   */
  private async handleRequest(req: any, res: any): Promise<void> {
    // 设置CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const url = new URL(req.url!, `http://localhost:${this.port}`);
    
    if (url.pathname === '/health') {
      this.handleHealthCheck(res);
      return;
    }

    if (url.pathname === '/intent-recognition') {
      await this.handleIntentRecognition(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * 处理健康检查
   */
  private handleHealthCheck(res: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: Date.now(),
      isLLMReady: this.llmProcess !== null
    }));
  }

  /**
   * 处理意图识别请求
   */
  private async handleIntentRecognition(req: any, res: any): Promise<void> {
    try {
      if (!this.llmProcess) {
        throw new Error('LLM process not initialized');
      }

      // 读取请求体
      const body = await this.readRequestBody(req);
      const request: IntentRecognitionRequest = JSON.parse(body);

      // 验证请求
      if (!request.userInput || !request.requestId) {
        throw new Error('Invalid request: missing userInput or requestId');
      }

      // 处理意图识别
      const response = await this.llmProcess.processIntentRecognition(request);

      // 发送响应
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

    } catch (error) {
      console.error('[ContextAgentLLMServer] Request processing error:', error);
      
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 读取请求体
   */
  private readRequestBody(req: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk: any) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        resolve(body);
      });

      req.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  /**
   * 创建服务器配置
   */
  private async createServerConfig(): Promise<Config> {
    // 创建真实的Config实例来正确初始化GeminiClient
    const { Config } = await import('../config/config.js');
    
    // 使用实际的Config实例，这样可以正确初始化GeminiClient
    const config = new Config({
      sessionId: 'llm-server-session',
      model: process.env.CONTEXTAGENT_MODEL || 'gemini-1.5-flash',
      cwd: process.cwd(),
      targetDir: process.cwd(),
      debugMode: process.env.DEBUG === '1' || process.env.CONTEXTAGENT_DEBUG === '1'
    });
    
    // 初始化配置
    await config.initialize();
    
    // 刷新认证以确保GeminiClient可用
    try {
      const { AuthType } = await import('../core/contentGenerator.js');
      await config.refreshAuth(AuthType.USE_GEMINI);
    } catch (error) {
      console.warn('[ContextAgentLLMServer] Auth refresh failed, will rely on environment variables:', error);
    }
    
    return config;
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.llmProcess) {
        this.llmProcess.dispose();
        this.llmProcess = null;
      }

      this.server.close(() => {
        this.isRunning = false;
        console.log('[ContextAgentLLMServer] Server stopped');
        resolve();
      });
    });
  }

  /**
   * 获取服务器状态
   */
  getStatus(): { isRunning: boolean; port: number; isLLMReady: boolean } {
    return {
      isRunning: this.isRunning,
      port: this.port,
      isLLMReady: this.llmProcess !== null
    };
  }
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  const server = new ContextAgentLLMServer(parseInt(process.env.CONTEXTAGENT_PORT || '0'));
  
  server.start().then(port => {
    console.log(`[ContextAgentLLMServer] Server started on port ${port}`);
    
    // 优雅关闭
    process.on('SIGTERM', async () => {
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
    
  }).catch(error => {
    console.error('[ContextAgentLLMServer] Failed to start server:', error);
    process.exit(1);
  });
}
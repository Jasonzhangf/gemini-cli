/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { RAGContextExtractor } from '../context/providers/extractor/ragContextExtractor.js';
import { ContextAgent } from '../context/contextAgent.js';

const InitRagSchema = z.object({
  force: z.boolean().optional().describe('Force rebuild even if index exists'),
  projectRoot: z.string().optional().describe('Project root directory to index'),
  verbose: z.boolean().optional().describe('Enable verbose logging during rebuild')
});

export type InitRagRequest = z.infer<typeof InitRagSchema>;

/**
 * /init命令工具 - 触发RAG系统完整重建
 * 
 * 这个工具处理用户的/init命令，触发RAG系统的完整重建索引过程。
 * 支持以下触发机制：
 * - 强制重建现有索引
 * - 指定项目根目录
 * - 详细日志输出
 */
export async function initRag(
  request: InitRagRequest,
  context: { contextAgent?: ContextAgent }
): Promise<{
  success: boolean;
  message: string;
  statistics?: {
    filesProcessed: number;
    indexingTime: number;
    errorCount: number;
  };
}> {
  const { force = false, projectRoot, verbose = false } = request;
  const startTime = Date.now();
  let filesProcessed = 0;
  let errorCount = 0;

  try {
    // 获取contextAgent中的RAG提取器
    const contextAgent = context.contextAgent;
    if (!contextAgent) {
      return {
        success: false,
        message: 'Context agent not available'
      };
    }

    // 获取RAG提取器实例
    const ragExtractor = await getRagExtractor(contextAgent);
    if (!ragExtractor) {
      return {
        success: false,
        message: 'RAG extractor not available in context agent'
      };
    }

    if (verbose) {
      console.log('[InitRag] Starting RAG system rebuild...');
      console.log(`[InitRag] Project root: ${projectRoot || process.cwd()}`);
      console.log(`[InitRag] Force rebuild: ${force}`);
    }

    // 检查索引状态
    const indexingStatus = ragExtractor.getIndexingStatus();
    if (indexingStatus.isIndexing) {
      return {
        success: false,
        message: 'RAG system is already indexing. Please wait for completion.'
      };
    }

    // 设置事件监听器跟踪进度
    const originalConsoleLog = console.log;
    let progressMessages: string[] = [];
    
    if (verbose) {
      // 临时重定向console.log来捕获进度信息
      console.log = (message: string) => {
        progressMessages.push(message);
        originalConsoleLog(message);
      };
    }

    // 执行/init命令
    await ragExtractor.handleInitCommand();

    // 恢复console.log
    if (verbose) {
      console.log = originalConsoleLog;
    }

    const endTime = Date.now();
    const indexingTime = endTime - startTime;

    // 获取最终状态
    const finalStatus = ragExtractor.getIndexingStatus();
    
    if (verbose) {
      console.log(`[InitRag] RAG rebuild completed in ${indexingTime}ms`);
      console.log(`[InitRag] Watched directories: ${finalStatus.watchedDirectories.join(', ')}`);
      console.log(`[InitRag] Queue size: ${finalStatus.queueSize}`);
    }

    return {
      success: true,
      message: `RAG system rebuild completed successfully in ${indexingTime}ms`,
      statistics: {
        filesProcessed: Object.keys(finalStatus.lastIndexTime).length,
        indexingTime,
        errorCount
      }
    };

  } catch (error) {
    const endTime = Date.now();
    const indexingTime = endTime - startTime;

    if (verbose) {
      console.error('[InitRag] RAG rebuild failed:', error);
    }

    return {
      success: false,
      message: `RAG rebuild failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      statistics: {
        filesProcessed,
        indexingTime,
        errorCount: errorCount + 1
      }
    };
  }
}

/**
 * 从ContextAgent中获取RAG提取器
 */
async function getRagExtractor(contextAgent: ContextAgent): Promise<RAGContextExtractor | null> {
  try {
    // 通过contextAgent的内部API获取RAG提取器
    // 这里需要根据实际的contextAgent实现来调整
    const contextManager = (contextAgent as any).contextManager;
    if (!contextManager) return null;
    
    // 获取当前的上下文提取器
    const extractor = (contextManager as any).extractor;
    if (!extractor) return null;
    
    // 检查是否是RAG提取器或混合提取器
    if (extractor instanceof RAGContextExtractor) {
      return extractor;
    }
    
    // 如果是混合提取器，尝试获取其中的RAG提取器
    const ragExtractor = (extractor as any).ragExtractor;
    if (ragExtractor instanceof RAGContextExtractor) {
      return ragExtractor;
    }
    
    return null;
  } catch (error) {
    console.error('[InitRag] Failed to get RAG extractor:', error);
    return null;
  }
}

/**
 * 工具定义
 */
export const initRagTool = {
  name: 'init_rag',
  description: 'Initialize and rebuild RAG (Retrieval-Augmented Generation) system index. Triggers complete rebuilding of the knowledge graph and vector search index.',
  schema: InitRagSchema,
  handler: initRag
};

/**
 * 检查是否是/init命令
 */
export function isInitCommand(userInput: string): boolean {
  const trimmed = userInput.trim().toLowerCase();
  return trimmed === '/init' || trimmed.startsWith('/init ');
}

/**
 * 解析/init命令参数
 */
export function parseInitCommand(userInput: string): InitRagRequest {
  const trimmed = userInput.trim();
  const parts = trimmed.split(/\s+/);
  
  const request: InitRagRequest = {};
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    switch (part) {
      case '--force':
      case '-f':
        request.force = true;
        break;
      case '--verbose':
      case '-v':
        request.verbose = true;
        break;
      case '--project-root':
      case '-p':
        if (i + 1 < parts.length) {
          request.projectRoot = parts[i + 1];
          i++; // Skip next part as it's the value
        }
        break;
    }
  }
  
  return request;
}
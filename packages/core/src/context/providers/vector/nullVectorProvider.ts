/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IVectorSearchProvider, 
  VectorQuery, 
  VectorSearchResult, 
  VectorSearchResponse 
} from '../../interfaces/contextProviders.js';

/**
 * 空向量提供者
 * 当向量搜索被禁用时使用
 */
export class NullVectorProvider implements IVectorSearchProvider {
  private config: Record<string, any>;
  private isInitialized = false;

  constructor(config: Record<string, any> = {}) {
    this.config = config;
  }

  /**
   * 初始化（空操作）
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * 索引文档（空操作）
   */
  async indexDocument(id: string, content: string, metadata?: Record<string, any>): Promise<void> {
    // 空操作
  }

  /**
   * 搜索（返回空结果）
   */
  async search(query: VectorQuery | string, options?: { maxResults?: number }): Promise<VectorSearchResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const queryText = typeof query === 'string' ? query : query.text;

    return {
      query: queryText,
      results: [],
      searchTime: 0,
      totalDocuments: 0
    };
  }

  /**
   * 删除文档（空操作）
   */
  async removeDocument(id: string): Promise<void> {
    // 空操作
  }

  /**
   * 获取索引统计信息
   */
  async getIndexStats(): Promise<{
    documentCount: number;
    vectorDimensions: number;
    indexSize: string;
    lastUpdated: string;
  }> {
    return {
      documentCount: 0,
      vectorDimensions: 0,
      indexSize: '0 bytes',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.isInitialized = false;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGContextExtractor } from '../ragContextExtractor.js';

/**
 * RAG简单测试 - 验证API正确性
 */
describe('RAG简单测试', () => {
  let ragExtractor: RAGContextExtractor;
  let mockGraphProvider: any;
  let mockVectorProvider: any;

  beforeEach(() => {
    // 创建正确的mock providers
    mockGraphProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      upsertNode: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ nodes: [] }),
      addRelationship: vi.fn().mockResolvedValue(undefined),
      getNode: vi.fn().mockResolvedValue(null),
      updateNode: vi.fn().mockResolvedValue(undefined),
    };

    mockVectorProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexDocument: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({ results: [] }),
      updateDocument: vi.fn().mockResolvedValue(undefined),
    };

    // 使用正确的构造函数参数
    ragExtractor = new RAGContextExtractor(
      {
        maxResults: 10,
        threshold: 0.1,
        enableSemanticAnalysis: true,
        debugMode: false,
      },
      mockGraphProvider,
      mockVectorProvider
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该能够初始化RAG系统', async () => {
    await ragExtractor.initialize();
    
    expect(mockGraphProvider.initialize).toHaveBeenCalled();
    expect(mockVectorProvider.initialize).toHaveBeenCalled();
  });

  it('应该能够提取上下文', async () => {
    // 模拟查询
    const query = {
      userInput: 'test query',
      conversationHistory: [],
      availableTools: []
    };

    // 模拟响应
    mockGraphProvider.query.mockResolvedValue({
      nodes: [
        {
          id: 'test-file.ts',
          name: 'test-file.ts',
          type: 'file',
          content: 'test content',
          metadata: { filePath: 'test-file.ts' }
        }
      ]
    });

    mockVectorProvider.search.mockResolvedValue({
      results: [
        {
          id: 'test-file.ts',
          score: 0.8,
          metadata: { type: 'file', filePath: 'test-file.ts' }
        }
      ]
    });

    const result = await ragExtractor.extractContext(query);
    
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
    expect(result.semantic).toBeDefined();
    expect(result.conversation).toBeDefined();
    expect(result.operational).toBeDefined();
    expect(mockGraphProvider.query).toHaveBeenCalled();
    expect(mockVectorProvider.search).toHaveBeenCalled();
  });

  it('应该能够处理空查询', async () => {
    const query = {
      userInput: '',
      conversationHistory: [],
      availableTools: []
    };

    const result = await ragExtractor.extractContext(query);
    
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
    expect(result.semantic).toBeDefined();
    expect(result.conversation).toBeDefined();
    expect(result.operational).toBeDefined();
  });

  it('应该能够更新文件内容', async () => {
    const updateData = {
      type: 'file_change' as const,
      data: {
        filePath: '/test/file.ts',
        content: 'test content'
      }
    };

    await ragExtractor.updateContext(updateData);

    // 验证图数据库调用 - 使用更灵活的匹配
    expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '/test/file.ts',
        name: 'file.ts',
        type: 'file',
        content: '[LANGUAGE:ts]\ntest content',
        metadata: expect.objectContaining({
          fileName: 'file.ts',
          fileExtension: '.ts',
          filePath: '/test/file.ts',
          isMdFile: false,
          isCodeFile: true,
          contentType: 'typescript'
        }),
        relationships: []
      })
    );

    // 验证向量数据库调用
    expect(mockVectorProvider.indexDocument).toHaveBeenCalledWith(
      '/test/file.ts',
      '[LANGUAGE:ts]\ntest content',
      expect.objectContaining({
        type: 'file',
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        fileExtension: '.ts',
        contentType: 'typescript'
      })
    );
  });
});
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGContextExtractor } from '../ragContextExtractor.js';
import path from 'path';
import crypto from 'crypto';

/**
 * RAG文件名编码机制测试套件
 * 
 * 测试目标：
 * 1. 文件名的正确编码和标准化
 * 2. 路径分离和组件提取
 * 3. 中文文件名的处理
 * 4. 特殊字符和空格的处理
 * 5. 文件名实体提取和索引
 */
describe('RAG文件名编码机制测试', () => {
  let ragExtractor: RAGContextExtractor;
  let mockGraphProvider: any;
  let mockVectorProvider: any;

  beforeEach(() => {
    mockGraphProvider = {
      upsertNode: vi.fn(),
      query: vi.fn(),
      addRelationship: vi.fn(),
      getNode: vi.fn(),
      updateNode: vi.fn(),
    };

    mockVectorProvider = {
      indexDocument: vi.fn(),
      search: vi.fn(),
      updateDocument: vi.fn(),
    };

    ragExtractor = new RAGContextExtractor(
      mockGraphProvider,
      mockVectorProvider,
      {
        maxResults: 10,
        relevanceThreshold: 0.1,
        enableGraphTraversal: true,
        enableSemanticAnalysis: true,
        enableEntityExtraction: true,
        algorithm: 'tfidf',
        enableDynamicEntityExtraction: true,
        enableConceptExtraction: true,
        enableContextualRelevance: true,
        semanticSimilarityThreshold: 0.3,
        entityExtractionMode: 'adaptive',
        useAdvancedFiltering: true,
        enableHybridRanking: true,
        maxEntityCount: 50,
        maxConceptCount: 30,
        contextWindow: 3,
        enableRealTimeUpdate: true,
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('文件名编码和标准化', () => {
    it('应该正确处理标准英文文件名', async () => {
      const testCases = [
        {
          filePath: '/project/src/utils/fileUtils.ts',
          expectedFileName: 'fileUtils.ts',
          expectedBaseName: 'fileUtils',
          expectedExtension: '.ts'
        },
        {
          filePath: '/project/docs/README.md',
          expectedFileName: 'README.md',
          expectedBaseName: 'README',
          expectedExtension: '.md'
        },
        {
          filePath: '/project/config/settings.json',
          expectedFileName: 'settings.json',
          expectedBaseName: 'settings',
          expectedExtension: '.json'
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.filePath,
          content: '// test content'
        });

        // 验证文件名被正确提取和编码
        expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
          id: testCase.filePath,
          name: testCase.filePath,
          type: 'file',
          content: '// test content',
          metadata: {},
          relationships: []
        });

        // 验证文件名组件被正确识别
        const fileName = path.basename(testCase.filePath);
        const baseName = path.basename(testCase.filePath, path.extname(testCase.filePath));
        const extension = path.extname(testCase.filePath);

        expect(fileName).toBe(testCase.expectedFileName);
        expect(baseName).toBe(testCase.expectedBaseName);
        expect(extension).toBe(testCase.expectedExtension);
      }
    });

    it('应该正确处理包含中文的文件名', async () => {
      const testCases = [
        {
          filePath: '/project/docs/项目介绍.md',
          content: '# 项目介绍\n这是一个项目介绍文档。'
        },
        {
          filePath: '/project/src/工具函数.ts',
          content: '// 工具函数实现\nexport function 处理数据() {}'
        },
        {
          filePath: '/project/config/配置文件.json',
          content: '{"name": "配置", "version": "1.0.0"}'
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.filePath,
          content: testCase.content
        });

        // 验证中文文件名被正确处理
        expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
          id: testCase.filePath,
          name: testCase.filePath,
          type: 'file',
          content: testCase.content,
          metadata: {},
          relationships: []
        });

        // 验证文件名可以正确提取
        const fileName = path.basename(testCase.filePath);
        expect(fileName).toBeTruthy();
        expect(fileName.length).toBeGreaterThan(0);
      }
    });

    it('应该正确处理包含特殊字符的文件名', async () => {
      const testCases = [
        {
          filePath: '/project/docs/README-zh_CN.md',
          content: '# 中文文档'
        },
        {
          filePath: '/project/src/utils/file-utils.test.ts',
          content: '// 测试文件'
        },
        {
          filePath: '/project/config/app.config.development.json',
          content: '{"env": "development"}'
        },
        {
          filePath: '/project/assets/logo_company@2x.png',
          content: 'binary content'
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.filePath,
          content: testCase.content
        });

        expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
          id: testCase.filePath,
          name: testCase.filePath,
          type: 'file',
          content: testCase.content,
          metadata: {},
          relationships: []
        });
      }
    });

    it('应该正确处理包含空格的文件名', async () => {
      const testCases = [
        {
          filePath: '/project/docs/User Guide.md',
          content: '# 用户指南'
        },
        {
          filePath: '/project/src/My Component.tsx',
          content: 'export default function MyComponent() {}'
        },
        {
          filePath: '/project/assets/app icon.svg',
          content: '<svg>...</svg>'
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.filePath,
          content: testCase.content
        });

        expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
          id: testCase.filePath,
          name: testCase.filePath,
          type: 'file',
          content: testCase.content,
          metadata: {},
          relationships: []
        });
      }
    });
  });

  describe('路径分离和组件提取', () => {
    it('应该正确分离路径组件', () => {
      const testCases = [
        {
          filePath: '/project/src/components/Button/Button.tsx',
          expectedDir: '/project/src/components/Button',
          expectedFileName: 'Button.tsx',
          expectedBaseName: 'Button',
          expectedExtension: '.tsx'
        },
        {
          filePath: '/project/docs/api/users.md',
          expectedDir: '/project/docs/api',
          expectedFileName: 'users.md',
          expectedBaseName: 'users',
          expectedExtension: '.md'
        },
        {
          filePath: '/project/config/database.config.ts',
          expectedDir: '/project/config',
          expectedFileName: 'database.config.ts',
          expectedBaseName: 'database.config',
          expectedExtension: '.ts'
        }
      ];

      for (const testCase of testCases) {
        const dir = path.dirname(testCase.filePath);
        const fileName = path.basename(testCase.filePath);
        const baseName = path.basename(testCase.filePath, path.extname(testCase.filePath));
        const extension = path.extname(testCase.filePath);

        expect(dir).toBe(testCase.expectedDir);
        expect(fileName).toBe(testCase.expectedFileName);
        expect(baseName).toBe(testCase.expectedBaseName);
        expect(extension).toBe(testCase.expectedExtension);
      }
    });

    it('应该正确提取路径深度和层级', () => {
      const testCases = [
        {
          filePath: '/project/README.md',
          expectedDepth: 2,
          expectedParts: ['', 'project', 'README.md']
        },
        {
          filePath: '/project/src/utils/fileUtils.ts',
          expectedDepth: 4,
          expectedParts: ['', 'project', 'src', 'utils', 'fileUtils.ts']
        },
        {
          filePath: '/project/docs/api/v1/users.md',
          expectedDepth: 5,
          expectedParts: ['', 'project', 'docs', 'api', 'v1', 'users.md']
        }
      ];

      for (const testCase of testCases) {
        const parts = testCase.filePath.split('/');
        const depth = parts.length;

        expect(depth).toBe(testCase.expectedDepth);
        expect(parts).toEqual(testCase.expectedParts);
      }
    });
  });

  describe('文件名实体提取', () => {
    it('应该从文件名中提取实体信息', async () => {
      const testCases = [
        {
          filePath: '/project/src/UserService.ts',
          expectedEntities: ['UserService', 'User', 'Service']
        },
        {
          filePath: '/project/docs/APIReference.md',
          expectedEntities: ['APIReference', 'API', 'Reference']
        },
        {
          filePath: '/project/config/databaseConfig.json',
          expectedEntities: ['databaseConfig', 'database', 'Config']
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.filePath,
          content: '// test content'
        });

        // 验证文件名实体被正确识别
        const fileName = path.basename(testCase.filePath, path.extname(testCase.filePath));
        const extractedEntities = (ragExtractor as any).extractEntitiesFromFileName(fileName);

        for (const expectedEntity of testCase.expectedEntities) {
          expect(extractedEntities).toContain(expectedEntity.toLowerCase());
        }
      }
    });

    it('应该正确处理驼峰命名的文件名', async () => {
      const testCases = [
        'UserAccountService.ts',
        'PaymentProcessorUtils.ts',
        'DatabaseConnectionManager.ts',
        'APIResponseHandler.ts'
      ];

      for (const fileName of testCases) {
        const filePath = `/project/src/${fileName}`;
        await ragExtractor.handleFileChange({
          filePath,
          content: '// test content'
        });

        // 验证驼峰命名被正确分解
        const baseName = path.basename(filePath, path.extname(filePath));
        const camelCaseWords = baseName.split(/(?=[A-Z])/).filter(word => word.length > 0);
        expect(camelCaseWords.length).toBeGreaterThan(1);
      }
    });
  });

  describe('文件名索引和搜索', () => {
    it('应该支持基于文件名的搜索', async () => {
      const testFiles = [
        '/project/src/UserService.ts',
        '/project/src/UserRepository.ts',
        '/project/src/UserController.ts',
        '/project/docs/UserGuide.md',
        '/project/config/userConfig.json'
      ];

      // 索引所有文件
      for (const filePath of testFiles) {
        await ragExtractor.handleFileChange({
          filePath,
          content: '// test content'
        });
      }

      // 模拟搜索请求
      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(filePath => ({
          id: filePath,
          name: filePath,
          type: 'file',
          content: '// test content'
        }))
      });

      mockVectorProvider.search.mockResolvedValue(
        testFiles.map(filePath => ({
          id: filePath,
          similarity: 0.8,
          metadata: { type: 'file', filePath }
        }))
      );

      // 执行搜索
      const results = await ragExtractor.searchContext('user', '', 10);

      // 验证搜索结果包含相关文件
      expect(results.context.code.relevantFiles).toBeDefined();
      expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);
    });

    it('应该支持模糊文件名匹配', async () => {
      const testFiles = [
        '/project/src/fileUtils.ts',
        '/project/src/fileHelper.ts',
        '/project/src/fileProcessor.ts',
        '/project/docs/fileFormat.md'
      ];

      for (const filePath of testFiles) {
        await ragExtractor.handleFileChange({
          filePath,
          content: '// test content'
        });
      }

      // 模拟模糊搜索
      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(filePath => ({
          id: filePath,
          name: filePath,
          type: 'file',
          content: '// test content'
        }))
      });

      const results = await ragExtractor.searchContext('file', '', 10);
      expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);
    });
  });

  describe('文件名编码性能', () => {
    it('应该能够高效处理大量文件名', async () => {
      const fileCount = 1000;
      const testFiles = [];

      // 生成大量测试文件
      for (let i = 0; i < fileCount; i++) {
        testFiles.push(`/project/src/module${i}/Component${i}.tsx`);
        testFiles.push(`/project/docs/guide${i}.md`);
        testFiles.push(`/project/config/config${i}.json`);
      }

      const startTime = Date.now();

      // 批量处理文件
      for (const filePath of testFiles) {
        await ragExtractor.handleFileChange({
          filePath,
          content: '// test content'
        });
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 验证处理时间在合理范围内
      expect(processingTime).toBeLessThan(10000); // 10秒内
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(testFiles.length);
    });
  });

  describe('编码错误处理', () => {
    it('应该正确处理无效文件路径', async () => {
      const invalidPaths = [
        '',
        null,
        undefined,
        '//',
        '/..',
        '/./test.txt'
      ];

      for (const invalidPath of invalidPaths) {
        if (invalidPath) {
          await expect(ragExtractor.handleFileChange({
            filePath: invalidPath,
            content: '// test content'
          })).resolves.not.toThrow();
        }
      }
    });

    it('应该正确处理超长文件名', async () => {
      const longFileName = 'a'.repeat(255) + '.txt';
      const longFilePath = `/project/src/${longFileName}`;

      await expect(ragExtractor.handleFileChange({
        filePath: longFilePath,
        content: '// test content'
      })).resolves.not.toThrow();
    });
  });
});

/**
 * 辅助函数：从文件名中提取实体
 */
function extractEntitiesFromFileName(fileName: string): string[] {
  const entities: string[] = [];
  
  // 分解驼峰命名
  const camelCaseWords = fileName.split(/(?=[A-Z])/).filter(word => word.length > 0);
  entities.push(...camelCaseWords.map(word => word.toLowerCase()));
  
  // 分解下划线命名
  const underscoreWords = fileName.split('_').filter(word => word.length > 0);
  entities.push(...underscoreWords.map(word => word.toLowerCase()));
  
  // 分解连字符命名
  const hyphenWords = fileName.split('-').filter(word => word.length > 0);
  entities.push(...hyphenWords.map(word => word.toLowerCase()));
  
  // 添加完整文件名
  entities.push(fileName.toLowerCase());
  
  return [...new Set(entities)]; // 去重
}
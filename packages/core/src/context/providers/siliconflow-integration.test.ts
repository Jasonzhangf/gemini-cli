/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SiliconFlowEmbeddingProvider } from './vector/siliconFlowEmbeddingProvider.js';
import { RAGContextExtractor } from './extractor/ragContextExtractor.js';
import { MemoryKnowledgeGraphProvider } from './graph/memoryKnowledgeGraph.js';

describe('SiliconFlow Integration Test', () => {
  let vectorProvider: SiliconFlowEmbeddingProvider;
  let graphProvider: MemoryKnowledgeGraphProvider;
  let ragExtractor: RAGContextExtractor;

  beforeEach(async () => {
    vectorProvider = new SiliconFlowEmbeddingProvider();
    graphProvider = new MemoryKnowledgeGraphProvider();
    ragExtractor = new RAGContextExtractor({
      maxResults: 5,
      threshold: 0.1,
      debugMode: true
    }, graphProvider, vectorProvider);
    
    await ragExtractor.initialize();
  });

  afterEach(async () => {
    await ragExtractor.dispose();
  });

  it('should index and retrieve source file content', async () => {
    // 模拟源文件内容
    const sourceFileContent = `
export class TestComponent {
  private readonly apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async processData(data: any[]): Promise<string> {
    return data.map(item => item.toString()).join(',');
  }
  
  validateInput(input: string): boolean {
    return input.length > 0 && input.trim() !== '';
  }
}
`;
    
    const filePath = '/src/components/TestComponent.ts';
    
    // 索引文件内容
    await vectorProvider.indexDocument(filePath, sourceFileContent, {
      type: 'typescript',
      lastModified: new Date().toISOString(),
      size: sourceFileContent.length
    });
    
    // 查询相关内容
    const query = {
      userInput: 'processData method implementation',
      context: {
        type: 'code_query',
        language: 'typescript'
      }
    };
    
    const extractedContext = await ragExtractor.extractContext(query);
    
    console.log('Extracted context:', JSON.stringify(extractedContext, null, 2));
    
    // 添加调试信息
    const indexStats = await vectorProvider.getIndexStats();
    console.log('Index stats:', indexStats);
    
    // 验证结果
    expect(extractedContext.code.relevantFiles).toHaveLength(1);
    
    const relevantFile = extractedContext.code.relevantFiles[0];
    expect(relevantFile.path).toBe(filePath);
    
    // 关键测试：确保返回的是源文件内容而不是文件信息
    expect(relevantFile.summary).toContain('export class TestComponent');
    expect(relevantFile.summary).toContain('async processData(data: any[]): Promise<string>');
    expect(relevantFile.summary).toContain('return data.map(item => item.toString()).join(\',\');');
    
    // 确保不是文件信息
    expect(relevantFile.summary).not.toContain('lastModified');
    expect(relevantFile.summary).not.toContain('size:');
    expect(relevantFile.summary).not.toContain('type: typescript');
  });

  it('should handle multiple files and return content for relevant queries', async () => {
    // 索引多个文件
    const files = [
      {
        path: '/src/utils/stringUtils.ts',
        content: `
export function formatText(text: string): string {
  return text.trim().toLowerCase();
}

export function splitWords(text: string): string[] {
  return text.split(/\\s+/);
}
`
      },
      {
        path: '/src/utils/arrayUtils.ts',
        content: `
export function removeDuplicates<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  return arr.reduce((map, item) => {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
    return map;
  }, new Map<K, T[]>());
}
`
      },
      {
        path: '/src/config/database.ts',
        content: `
export const DATABASE_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  user: 'admin'
};

export function createConnection() {
  return new Connection(DATABASE_CONFIG);
}
`
      }
    ];

    // 索引所有文件
    for (const file of files) {
      await vectorProvider.indexDocument(file.path, file.content, {
        type: 'typescript',
        lastModified: new Date().toISOString()
      });
    }

    // 查询数组相关功能
    const query = {
      userInput: 'remove duplicates from array',
      context: {
        type: 'code_query',
        language: 'typescript'
      }
    };

    const extractedContext = await ragExtractor.extractContext(query);
    
    console.log('Multiple files context:', JSON.stringify(extractedContext, null, 2));

    // 验证结果
    expect(extractedContext.code.relevantFiles.length).toBeGreaterThan(0);
    
    const arrayUtilsFile = extractedContext.code.relevantFiles.find(f => 
      f.path === '/src/utils/arrayUtils.ts'
    );
    
    expect(arrayUtilsFile).toBeDefined();
    expect(arrayUtilsFile?.summary).toContain('removeDuplicates');
    expect(arrayUtilsFile?.summary).toContain('return [...new Set(arr)];');
    
    // 确保内容是源代码而不是文件信息
    expect(arrayUtilsFile?.summary).toContain('export function');
    expect(arrayUtilsFile?.summary).not.toContain('lastModified');
  });

  it.skip('should handle Chinese query and return relevant content', async () => {
    // 索引中文注释的文件
    const chineseFile = `
/**
 * 用户管理模块
 * 提供用户认证和权限管理功能
 */
export class UserManager {
  private users: Map<string, User> = new Map();
  
  /**
   * 添加新用户
   * @param user 用户信息
   */
  addUser(user: User): void {
    this.users.set(user.id, user);
  }
  
  /**
   * 查找用户
   * @param id 用户ID
   * @returns 用户信息或null
   */
  findUser(id: string): User | null {
    return this.users.get(id) || null;
  }
  
  /**
   * 验证用户权限
   * @param userId 用户ID
   * @param permission 权限名称
   */
  checkPermission(userId: string, permission: string): boolean {
    const user = this.findUser(userId);
    return user ? user.permissions.includes(permission) : false;
  }
}
`;

    await vectorProvider.indexDocument('/src/auth/UserManager.ts', chineseFile, {
      type: 'typescript',
      language: 'zh-CN'
    });

    // 中文查询
    const query = {
      userInput: '用户权限验证',
      context: {
        type: 'code_query',
        language: 'typescript'
      }
    };

    const extractedContext = await ragExtractor.extractContext(query);
    
    console.log('Chinese query context:', JSON.stringify(extractedContext, null, 2));
    
    // Debug: test direct search
    const directSearch = await vectorProvider.search('用户权限验证');
    console.log('Direct Chinese search:', directSearch);

    // 验证结果
    expect(extractedContext.code.relevantFiles).toHaveLength(1);
    
    const userFile = extractedContext.code.relevantFiles[0];
    expect(userFile.path).toBe('/src/auth/UserManager.ts');
    expect(userFile.summary).toContain('用户管理模块');
    expect(userFile.summary).toContain('checkPermission');
    expect(userFile.summary).toContain('验证用户权限');
    
    // 确保返回的是完整的源代码内容
    expect(userFile.summary).toContain('export class UserManager');
    expect(userFile.summary).toContain('user.permissions.includes(permission)');
  });

  it('should maintain search performance with large content', async () => {
    // 创建大文件内容
    const largeContent = `
export class LargeDataProcessor {
  private data: any[] = [];
  
  ${Array.from({ length: 100 }, (_, i) => `
  method${i}(param: string): string {
    return param.toUpperCase() + '_${i}';
  }
  `).join('\n')}
  
  processLargeDataSet(dataset: any[]): any[] {
    return dataset.map(item => ({
      ...item,
      processed: true,
      timestamp: new Date().toISOString()
    }));
  }
  
  ${Array.from({ length: 50 }, (_, i) => `
  utility${i}(value: any): any {
    return { value, index: ${i}, processed: true };
  }
  `).join('\n')}
}
`;

    const startTime = Date.now();
    
    await vectorProvider.indexDocument('/src/processors/LargeDataProcessor.ts', largeContent, {
      type: 'typescript',
      size: largeContent.length
    });
    
    const indexTime = Date.now() - startTime;
    
    // 查询
    const queryStart = Date.now();
    const query = {
      userInput: 'processLargeDataSet implementation',
      context: {
        type: 'code_query'
      }
    };
    
    const extractedContext = await ragExtractor.extractContext(query);
    const queryTime = Date.now() - queryStart;
    
    console.log(`Performance - Index time: ${indexTime}ms, Query time: ${queryTime}ms`);
    
    // 验证结果和性能
    expect(extractedContext.code.relevantFiles).toHaveLength(1);
    expect(extractedContext.code.relevantFiles[0].summary).toContain('processLargeDataSet');
    expect(extractedContext.code.relevantFiles[0].summary).toContain('dataset.map');
    
    // 性能要求
    expect(indexTime).toBeLessThan(1000); // 索引时间小于1秒
    expect(queryTime).toBeLessThan(500);  // 查询时间小于0.5秒
  });
});
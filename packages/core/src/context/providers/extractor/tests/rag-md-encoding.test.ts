/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGContextExtractor } from '../ragContextExtractor.js';
import { memoryKnowledgeGraph } from '../../graph/memoryKnowledgeGraph.js';
import { TFIDFVectorProvider } from '../../vector/tfidfVectorProvider.js';

/**
 * RAG MD文件编码测试套件
 * 
 * 测试目标：
 * 1. MD文件内容的正确编码和索引
 * 2. 文件名编码机制验证
 * 3. 中文、英文、特殊字符的处理
 * 4. 多语言分词和tokenization
 */
describe('RAG MD文件编码测试', () => {
  let ragExtractor: RAGContextExtractor;
  let mockGraphProvider: any;
  let mockVectorProvider: any;

  beforeEach(() => {
    // 创建mock providers
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

    // 创建RAG实例
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

  describe('MD文件内容编码', () => {
    it('应该正确编码包含中文的MD文件', async () => {
      const testMdContent = `# 项目介绍

这是一个基于Node.js的项目，主要功能包括：

## 特性
- 支持多语言分词
- 实现语义搜索
- 提供RAG功能

\`\`\`typescript
// 示例代码
function tokenize(text: string): string[] {
  return text.split(' ');
}
\`\`\`

### 配置说明
配置文件位于 \`config/settings.json\`
`;

      const filePath = '/project/docs/README.md';
      
      await ragExtractor.handleFileChange({
        filePath,
        content: testMdContent,
      });

      // 验证graph provider被正确调用
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
        id: filePath,
        name: filePath,
        type: 'file',
        content: testMdContent,
        metadata: {},
        relationships: []
      });

      // 验证vector provider被正确调用
      expect(mockVectorProvider.indexDocument).toHaveBeenCalledWith(
        filePath,
        testMdContent,
        { type: 'file', filePath }
      );
    });

    it('应该正确处理包含特殊字符的MD文件', async () => {
      const testMdContent = `# API文档 📚

## 接口说明 🔧

### GET /api/users/:id
返回用户信息

**参数：**
- \`id\` (required): 用户ID

**响应：**
\`\`\`json
{
  "id": 123,
  "name": "张三",
  "email": "zhangsan@example.com"
}
\`\`\`

### POST /api/users
创建新用户

⚠️ **注意事项：**
- 邮箱格式必须正确
- 密码长度至少8位
- 支持特殊字符: !@#$%^&*()
`;

      const filePath = '/project/docs/API.md';
      
      await ragExtractor.handleFileChange({
        filePath,
        content: testMdContent,
      });

      // 验证特殊字符被正确处理
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
        id: filePath,
        name: filePath,
        type: 'file',
        content: testMdContent,
        metadata: {},
        relationships: []
      });
    });

    it('应该正确处理混合语言的MD文件', async () => {
      const testMdContent = `# 多语言支持 Multilingual Support

## 中文部分
这是中文内容，包含一些技术术语如：TypeScript、Node.js、API等。

## English Section
This is English content with some technical terms like: framework, library, module.

## 日本語セクション
これは日本語の内容です。技術的な用語: フレームワーク、ライブラリ、モジュール。

## 한국어 섹션
이것은 한국어 내용입니다. 기술 용어: 프레임워크, 라이브러리, 모듈.

\`\`\`typescript
// Code example with mixed comments
function processText(text: string): string {
  // 处理文本 Process text
  return text.toLowerCase();
}
\`\`\`
`;

      const filePath = '/project/docs/multilingual.md';
      
      await ragExtractor.handleFileChange({
        filePath,
        content: testMdContent,
      });

      // 验证多语言内容被正确处理
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
        id: filePath,
        name: filePath,
        type: 'file',
        content: testMdContent,
        metadata: {},
        relationships: []
      });
    });
  });

  describe('分词和编码验证', () => {
    it('应该正确分词中文内容', () => {
      const text = '这是一个TypeScript项目，支持多语言分词功能。';
      const tokens = (ragExtractor as any).textAnalyzer.tokenize(text);
      
      expect(tokens).toContain('typescript');
      expect(tokens).toContain('项目');
      expect(tokens).toContain('支持');
      expect(tokens).toContain('多语言');
      expect(tokens).toContain('分词');
      expect(tokens).toContain('功能');
    });

    it('应该正确分词英文内容', () => {
      const text = 'This is a TypeScript project with multilingual tokenization support.';
      const tokens = (ragExtractor as any).textAnalyzer.tokenize(text);
      
      expect(tokens).toContain('typescript');
      expect(tokens).toContain('project');
      expect(tokens).toContain('multilingual');
      expect(tokens).toContain('tokenization');
      expect(tokens).toContain('support');
    });

    it('应该正确处理代码块中的内容', () => {
      const text = `
## 代码示例

\`\`\`typescript
function processData(data: string[]): ProcessedData {
  return data.map(item => ({
    id: generateId(),
    content: item.trim(),
    timestamp: Date.now()
  }));
}
\`\`\`

\`\`\`javascript
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000
};
\`\`\`
`;

      const tokens = (ragExtractor as any).textAnalyzer.tokenize(text);
      
      expect(tokens).toContain('typescript');
      expect(tokens).toContain('javascript');
      expect(tokens).toContain('processdata');
      expect(tokens).toContain('config');
      expect(tokens).toContain('apiurl');
    });
  });

  describe('文件类型识别', () => {
    it('应该正确识别不同类型的MD文件', async () => {
      const testCases = [
        {
          path: '/project/README.md',
          content: '# 项目说明\n这是项目的主要说明文档。',
          expectedType: 'file'
        },
        {
          path: '/project/docs/API.md',
          content: '# API文档\n## 接口列表\n- GET /users\n- POST /users',
          expectedType: 'file'
        },
        {
          path: '/project/CHANGELOG.md',
          content: '# 变更日志\n## v1.0.0\n- 初始版本发布',
          expectedType: 'file'
        }
      ];

      for (const testCase of testCases) {
        await ragExtractor.handleFileChange({
          filePath: testCase.path,
          content: testCase.content,
        });

        expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
          id: testCase.path,
          name: testCase.path,
          type: testCase.expectedType,
          content: testCase.content,
          metadata: {},
          relationships: []
        });
      }
    });
  });

  describe('编码性能测试', () => {
    it('应该能够处理大型MD文件', async () => {
      // 生成大型MD文件内容
      const sections = [];
      for (let i = 0; i < 100; i++) {
        sections.push(`
## 第${i + 1}节

这是第${i + 1}节的内容。包含一些技术术语如：TypeScript, Node.js, API, Database, Framework。

\`\`\`typescript
// 示例代码 ${i + 1}
function example${i + 1}() {
  console.log('这是示例 ${i + 1}');
  return { id: ${i + 1}, name: 'example${i + 1}' };
}
\`\`\`

### 子节 ${i + 1}.1
详细说明内容...

### 子节 ${i + 1}.2
更多详细内容...
`);
      }

      const largeMdContent = `# 大型文档\n\n${sections.join('\n')}`;
      const filePath = '/project/docs/large-document.md';
      
      const startTime = Date.now();
      await ragExtractor.handleFileChange({
        filePath,
        content: largeMdContent,
      });
      const endTime = Date.now();

      // 验证处理时间在合理范围内（< 5秒）
      expect(endTime - startTime).toBeLessThan(5000);
      
      // 验证文件被正确索引
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
        id: filePath,
        name: filePath,
        type: 'file',
        content: largeMdContent,
        metadata: {},
        relationships: []
      });
    });
  });

  describe('错误处理', () => {
    it('应该正确处理格式错误的MD文件', async () => {
      const malformedMdContent = `# 标题

这是一个格式错误的MD文件：

\`\`\`typescript
// 未闭合的代码块
function test() {
  return "test";

\`\`\`json
{
  "unclosed": "object"
  "missing": "comma"
}

### 不匹配的标题层级
##### 跳过了层级

`;

      const filePath = '/project/docs/malformed.md';
      
      // 应该不抛出异常
      await expect(ragExtractor.handleFileChange({
        filePath,
        content: malformedMdContent,
      })).resolves.not.toThrow();
    });

    it('应该正确处理空MD文件', async () => {
      const emptyMdContent = '';
      const filePath = '/project/docs/empty.md';
      
      await ragExtractor.handleFileChange({
        filePath,
        content: emptyMdContent,
      });

      expect(mockGraphProvider.upsertNode).toHaveBeenCalledWith({
        id: filePath,
        name: filePath,
        type: 'file',
        content: emptyMdContent,
        metadata: {},
        relationships: []
      });
    });
  });
});
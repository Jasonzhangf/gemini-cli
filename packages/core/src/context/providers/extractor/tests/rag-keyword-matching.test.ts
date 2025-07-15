/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGContextExtractor } from '../ragContextExtractor.js';

/**
 * RAG关键字命中文件和内容测试套件
 * 
 * 测试目标：
 * 1. 关键字在文件名中的命中
 * 2. 关键字在文件内容中的命中
 * 3. 多语言关键字搜索
 * 4. 模糊匹配和语义匹配
 * 5. 相关性排序和过滤
 */
describe('RAG关键字命中文件和内容测试', () => {
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

  describe('文件名关键字命中', () => {
    it('应该能够通过文件名关键字找到相关文件', async () => {
      const testFiles = [
        {
          path: '/project/src/UserService.ts',
          content: 'export class UserService { async getUser() {} }'
        },
        {
          path: '/project/src/UserRepository.ts',
          content: 'export class UserRepository { findById() {} }'
        },
        {
          path: '/project/src/UserController.ts',
          content: 'export class UserController { handleRequest() {} }'
        },
        {
          path: '/project/docs/UserGuide.md',
          content: '# 用户指南\n\n## 如何使用用户管理功能'
        }
      ];

      // 索引所有文件
      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      // 模拟搜索"user"关键字
      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      mockVectorProvider.search.mockResolvedValue(
        testFiles.map(file => ({
          id: file.path,
          similarity: 0.8,
          metadata: { type: 'file', filePath: file.path }
        }))
      );

      const results = await ragExtractor.searchContext('user', '', 10);

      // 验证所有包含"user"的文件都被找到
      expect(results.context.code.relevantFiles).toBeDefined();
      expect(results.context.code.relevantFiles.length).toBe(4);
      
      // 验证文件路径正确
      const foundPaths = results.context.code.relevantFiles.map(f => f.path);
      expect(foundPaths).toContain('/project/src/UserService.ts');
      expect(foundPaths).toContain('/project/src/UserRepository.ts');
      expect(foundPaths).toContain('/project/src/UserController.ts');
      expect(foundPaths).toContain('/project/docs/UserGuide.md');
    });

    it('应该能够处理驼峰命名的文件名匹配', async () => {
      const testFiles = [
        {
          path: '/project/src/PaymentService.ts',
          content: 'export class PaymentService {}'
        },
        {
          path: '/project/src/PaymentProcessor.ts',
          content: 'export class PaymentProcessor {}'
        },
        {
          path: '/project/src/OrderPayment.ts',
          content: 'export class OrderPayment {}'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"payment"关键字
      const results = await ragExtractor.searchContext('payment', '', 10);

      expect(results.context.code.relevantFiles.length).toBe(3);
    });

    it('应该能够处理中文文件名匹配', async () => {
      const testFiles = [
        {
          path: '/project/docs/用户指南.md',
          content: '# 用户指南\n\n这是用户使用指南。'
        },
        {
          path: '/project/docs/用户API.md',
          content: '# 用户API文档\n\n## 用户接口说明'
        },
        {
          path: '/project/src/用户服务.ts',
          content: 'export class 用户服务 { 获取用户() {} }'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"用户"关键字
      const results = await ragExtractor.searchContext('用户', '', 10);

      expect(results.context.code.relevantFiles.length).toBe(3);
    });
  });

  describe('文件内容关键字命中', () => {
    it('应该能够通过内容关键字找到相关文件', async () => {
      const testFiles = [
        {
          path: '/project/src/AuthService.ts',
          content: `
export class AuthService {
  async authenticateUser(username: string, password: string) {
    // 用户认证逻辑
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new Error('用户不存在');
    }
    
    const isValid = await this.validatePassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('密码错误');
    }
    
    return this.generateToken(user);
  }
  
  private async validatePassword(password: string, hash: string): Promise<boolean> {
    // 密码验证逻辑
    return bcrypt.compare(password, hash);
  }
}
`
        },
        {
          path: '/project/docs/authentication.md',
          content: `
# 身份认证

## 用户认证流程

1. 用户输入用户名和密码
2. 系统验证用户凭据
3. 生成访问令牌
4. 返回认证结果

## 密码策略

- 密码长度至少8位
- 包含大小写字母、数字和特殊字符
- 定期更换密码
`
        },
        {
          path: '/project/src/PasswordUtil.ts',
          content: `
export class PasswordUtil {
  static generateHash(password: string): string {
    return bcrypt.hash(password, 10);
  }
  
  static validateComplexity(password: string): boolean {
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return password.length >= 8 && hasLower && hasUpper && hasNumber && hasSpecial;
  }
}
`
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"密码"关键字
      const results = await ragExtractor.searchContext('密码', '', 10);

      expect(results.context.code.relevantFiles.length).toBe(3);
      
      // 验证相关性排序
      const relevantFiles = results.context.code.relevantFiles;
      expect(relevantFiles.every(f => f.relevance > 0)).toBe(true);
    });

    it('应该能够处理代码中的技术术语匹配', async () => {
      const testFiles = [
        {
          path: '/project/src/DatabaseConnection.ts',
          content: `
import { Pool } from 'pg';
import { Connection } from 'mysql2';

export class DatabaseConnection {
  private pool: Pool;
  
  async connect(): Promise<void> {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }
  
  async query(sql: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}
`
        },
        {
          path: '/project/docs/database-setup.md',
          content: `
# 数据库设置

## PostgreSQL 配置

1. 安装 PostgreSQL 数据库
2. 创建数据库和用户
3. 配置连接参数

\`\`\`sql
CREATE DATABASE myapp_db;
CREATE USER myapp_user WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE myapp_db TO myapp_user;
\`\`\`

## 连接池配置

使用连接池可以提高数据库性能：

- 最大连接数：20
- 最小连接数：5
- 连接超时：30秒
`
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"数据库"关键字
      const results = await ragExtractor.searchContext('数据库', '', 10);

      expect(results.context.code.relevantFiles.length).toBe(2);
    });

    it('应该能够处理多语言混合内容的匹配', async () => {
      const testFiles = [
        {
          path: '/project/src/ApiClient.ts',
          content: `
/**
 * API客户端
 * API Client for making HTTP requests
 */
export class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * 发送GET请求
   * Send GET request
   */
  async get(endpoint: string): Promise<any> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return response.json();
  }
  
  /**
   * 发送POST请求
   * Send POST request
   */
  async post(endpoint: string, data: any): Promise<any> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }
}
`
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索中文关键字
      const chineseResults = await ragExtractor.searchContext('请求', '', 10);
      expect(chineseResults.context.code.relevantFiles.length).toBe(1);

      // 搜索英文关键字
      const englishResults = await ragExtractor.searchContext('request', '', 10);
      expect(englishResults.context.code.relevantFiles.length).toBe(1);
    });
  });

  describe('模糊匹配和语义匹配', () => {
    it('应该支持模糊匹配功能', async () => {
      const testFiles = [
        {
          path: '/project/src/UserService.ts',
          content: 'export class UserService { getUserData() {} }'
        },
        {
          path: '/project/src/UserRepository.ts',
          content: 'export class UserRepository { findUser() {} }'
        },
        {
          path: '/project/src/UserController.ts',
          content: 'export class UserController { handleUserRequest() {} }'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索部分匹配的关键字
      const results1 = await ragExtractor.searchContext('usr', '', 10);
      expect(results1.context.code.relevantFiles.length).toBeGreaterThan(0);

      const results2 = await ragExtractor.searchContext('serv', '', 10);
      expect(results2.context.code.relevantFiles.length).toBeGreaterThan(0);
    });

    it('应该支持语义相似性匹配', async () => {
      const testFiles = [
        {
          path: '/project/src/AuthService.ts',
          content: `
export class AuthService {
  async login(username: string, password: string) {
    // 用户登录逻辑
    return this.authenticateUser(username, password);
  }
  
  async signIn(credentials: any) {
    // 用户签到逻辑
    return this.validateCredentials(credentials);
  }
}
`
        },
        {
          path: '/project/src/LoginController.ts',
          content: `
export class LoginController {
  async handleLogin(req: any, res: any) {
    // 处理登录请求
    const { username, password } = req.body;
    const result = await this.authService.login(username, password);
    res.json(result);
  }
}
`
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"认证"应该找到登录相关的文件
      const results = await ragExtractor.searchContext('认证', '', 10);
      expect(results.context.code.relevantFiles.length).toBe(2);
    });

    it('应该支持同义词匹配', async () => {
      const testFiles = [
        {
          path: '/project/src/ConfigService.ts',
          content: 'export class ConfigService { getSettings() {} }'
        },
        {
          path: '/project/src/SettingsManager.ts',
          content: 'export class SettingsManager { loadConfiguration() {} }'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      // 搜索"配置"应该找到settings相关的文件
      const results = await ragExtractor.searchContext('配置', '', 10);
      expect(results.context.code.relevantFiles.length).toBe(2);
    });
  });

  describe('相关性排序和过滤', () => {
    it('应该能够根据相关性对结果排序', async () => {
      const testFiles = [
        {
          path: '/project/src/UserService.ts',
          content: 'export class UserService { /* 用户相关的核心服务 */ }'
        },
        {
          path: '/project/src/UserRepository.ts',
          content: 'export class UserRepository { /* 用户数据访问层 */ }'
        },
        {
          path: '/project/src/EmailService.ts',
          content: 'export class EmailService { sendToUser() {} /* 发送邮件给用户 */ }'
        },
        {
          path: '/project/docs/README.md',
          content: '# 项目说明\n\n偶尔提到user这个词。'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map((file, index) => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path },
          relevance: index === 0 ? 0.9 : index === 1 ? 0.8 : index === 2 ? 0.5 : 0.3
        }))
      });

      const results = await ragExtractor.searchContext('user', '', 10);
      const relevantFiles = results.context.code.relevantFiles;

      // 验证按相关性排序
      expect(relevantFiles.length).toBeGreaterThan(0);
      for (let i = 0; i < relevantFiles.length - 1; i++) {
        expect(relevantFiles[i].relevance).toBeGreaterThanOrEqual(relevantFiles[i + 1].relevance);
      }
    });

    it('应该能够过滤低相关性的结果', async () => {
      const testFiles = [
        {
          path: '/project/src/HighRelevance.ts',
          content: 'export class HighRelevance { /* 高相关性内容 */ }'
        },
        {
          path: '/project/src/LowRelevance.ts',
          content: 'export class LowRelevance { /* 低相关性内容 */ }'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: [
          {
            id: testFiles[0].path,
            name: testFiles[0].path,
            type: 'file',
            content: testFiles[0].content,
            metadata: { filePath: testFiles[0].path },
            relevance: 0.8
          },
          {
            id: testFiles[1].path,
            name: testFiles[1].path,
            type: 'file',
            content: testFiles[1].content,
            metadata: { filePath: testFiles[1].path },
            relevance: 0.05 // 低于阈值
          }
        ]
      });

      const results = await ragExtractor.searchContext('relevance', '', 10);
      
      // 验证低相关性结果被过滤
      expect(results.context.code.relevantFiles.length).toBe(1);
      expect(results.context.code.relevantFiles[0].relevance).toBeGreaterThan(0.1);
    });
  });

  describe('性能测试', () => {
    it('应该能够处理大量关键字搜索', async () => {
      const testFiles = [];
      for (let i = 0; i < 1000; i++) {
        testFiles.push({
          path: `/project/src/File${i}.ts`,
          content: `export class File${i} { method${i}() { return "content${i}"; } }`
        });
      }

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.slice(0, 10).map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      const startTime = Date.now();
      const results = await ragExtractor.searchContext('File', '', 10);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // 2秒内完成
      expect(results.context.code.relevantFiles.length).toBeLessThanOrEqual(10);
    });
  });

  describe('边界情况处理', () => {
    it('应该正确处理空搜索关键字', async () => {
      const results = await ragExtractor.searchContext('', '', 10);
      expect(results.context.code.relevantFiles).toBeDefined();
      expect(results.context.code.relevantFiles.length).toBe(0);
    });

    it('应该正确处理特殊字符搜索', async () => {
      const testFiles = [
        {
          path: '/project/src/SpecialChars.ts',
          content: 'const pattern = /[!@#$%^&*()]/g; // 特殊字符模式'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      const results = await ragExtractor.searchContext('特殊字符', '', 10);
      expect(results.context.code.relevantFiles.length).toBe(1);
    });

    it('应该正确处理Unicode字符搜索', async () => {
      const testFiles = [
        {
          path: '/project/src/Unicode.ts',
          content: 'const emoji = "😊🎉🚀"; // Unicode表情符号'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      mockGraphProvider.query.mockResolvedValue({
        nodes: testFiles.map(file => ({
          id: file.path,
          name: file.path,
          type: 'file',
          content: file.content,
          metadata: { filePath: file.path }
        }))
      });

      const results = await ragExtractor.searchContext('emoji', '', 10);
      expect(results.context.code.relevantFiles.length).toBe(1);
    });
  });
});
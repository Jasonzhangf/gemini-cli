/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGContextExtractor } from '../ragContextExtractor.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * RAG综合测试套件
 * 
 * 测试目标：
 * 1. 完整的RAG工作流测试
 * 2. 集成所有功能的端到端测试
 * 3. 性能和稳定性测试
 * 4. 错误恢复和边界情况测试
 * 5. 实际使用场景模拟
 */
describe('RAG综合测试套件', () => {
  let ragExtractor: RAGContextExtractor;
  let mockGraphProvider: any;
  let mockVectorProvider: any;
  let mockFileSystem: Map<string, string>;

  beforeEach(() => {
    mockFileSystem = new Map();
    
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

    // Mock文件系统
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: string) => {
      const content = mockFileSystem.get(filePath as string);
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockFileSystem.clear();
  });

  describe('完整工作流测试', () => {
    it('应该完整支持：索引 -> 搜索 -> 上下文提取 -> 结果排序', async () => {
      // 准备测试数据：一个完整的项目结构
      const projectFiles = {
        '/project/README.md': `# 用户管理系统

这是一个现代化的用户管理系统，提供完整的用户CRUD操作。

## 特性
- 用户注册和登录
- 用户资料管理
- 权限控制
- 数据安全

## 技术栈
- TypeScript + Node.js
- PostgreSQL 数据库
- JWT 认证
- bcrypt 密码加密
`,
        '/project/src/models/User.ts': `export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateRequest {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface UserUpdateRequest {
  username?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
}`,
        '/project/src/services/UserService.ts': `import { User, UserCreateRequest, UserUpdateRequest } from '../models/User.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { PasswordUtil } from '../utils/PasswordUtil.js';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(userData: UserCreateRequest): Promise<User> {
    // 验证用户名是否已存在
    const existingUser = await this.userRepository.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 验证邮箱是否已存在
    const existingEmail = await this.userRepository.findByEmail(userData.email);
    if (existingEmail) {
      throw new Error('邮箱已存在');
    }

    // 创建用户
    const user: User = {
      id: crypto.randomUUID(),
      username: userData.username,
      email: userData.email,
      passwordHash: await PasswordUtil.hashPassword(userData.password),
      role: userData.role || 'user',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.userRepository.create(user);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async updateUser(id: string, userData: UserUpdateRequest): Promise<User | null> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      return null;
    }

    const updatedUser: User = {
      ...user,
      ...userData,
      updatedAt: new Date()
    };

    if (userData.password) {
      updatedUser.passwordHash = await PasswordUtil.hashPassword(userData.password);
    }

    return this.userRepository.update(id, updatedUser);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.userRepository.delete(id);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }
}`,
        '/project/src/repositories/UserRepository.ts': `import { User } from '../models/User.js';
import { DatabaseConnection } from '../utils/DatabaseConnection.js';

export class UserRepository {
  constructor(private db: DatabaseConnection) {}

  async create(user: User): Promise<User> {
    const sql = \`
      INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    \`;
    
    const result = await this.db.query(sql, [
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      user.role,
      user.createdAt,
      user.updatedAt
    ]);

    return result[0];
  }

  async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = $1';
    const result = await this.db.query(sql, [id]);
    return result[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE username = $1';
    const result = await this.db.query(sql, [username]);
    return result[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = $1';
    const result = await this.db.query(sql, [email]);
    return result[0] || null;
  }

  async update(id: string, user: User): Promise<User | null> {
    const sql = \`
      UPDATE users 
      SET username = $2, email = $3, password_hash = $4, role = $5, updated_at = $6
      WHERE id = $1
      RETURNING *
    \`;
    
    const result = await this.db.query(sql, [
      id,
      user.username,
      user.email,
      user.passwordHash,
      user.role,
      user.updatedAt
    ]);

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM users WHERE id = $1';
    const result = await this.db.query(sql, [id]);
    return result.rowCount > 0;
  }

  async findAll(): Promise<User[]> {
    const sql = 'SELECT * FROM users ORDER BY created_at DESC';
    return this.db.query(sql);
  }
}`,
        '/project/src/controllers/UserController.ts': `import { Request, Response } from 'express';
import { UserService } from '../services/UserService.js';
import { UserCreateRequest, UserUpdateRequest } from '../models/User.js';

export class UserController {
  constructor(private userService: UserService) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const userData: UserCreateRequest = req.body;
      const user = await this.userService.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: '用户未找到' });
        return;
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userData: UserUpdateRequest = req.body;
      const user = await this.userService.updateUser(id, userData);
      
      if (!user) {
        res.status(404).json({ error: '用户未找到' });
        return;
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await this.userService.deleteUser(id);
      
      if (!success) {
        res.status(404).json({ error: '用户未找到' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.userService.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}`,
        '/project/docs/API.md': `# API文档

## 用户管理接口

### 创建用户
\`POST /api/users\`

**请求体：**
\`\`\`json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123",
  "role": "user"
}
\`\`\`

**响应：**
\`\`\`json
{
  "id": "uuid",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "user",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
\`\`\`

### 获取用户
\`GET /api/users/:id\`

**响应：**
\`\`\`json
{
  "id": "uuid",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "user",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
\`\`\`

### 更新用户
\`PUT /api/users/:id\`

**请求体：**
\`\`\`json
{
  "username": "newusername",
  "email": "newemail@example.com"
}
\`\`\`

### 删除用户
\`DELETE /api/users/:id\`

**响应：** 204 No Content

### 获取所有用户
\`GET /api/users\`

**响应：**
\`\`\`json
[
  {
    "id": "uuid",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
\`\`\`
`
      };

      // 索引所有文件
      for (const [filePath, content] of Object.entries(projectFiles)) {
        mockFileSystem.set(filePath, content);
        await ragExtractor.handleFileChange({ filePath, content });
      }

      // 模拟搜索行为
      const searchQueries = [
        '用户创建',
        'user password',
        'API接口',
        'database query',
        'UserService'
      ];

      for (const query of searchQueries) {
        // 模拟相关文件的查询结果
        const relevantFiles = Object.entries(projectFiles).filter(([path, content]) => {
          const lowerQuery = query.toLowerCase();
          const lowerPath = path.toLowerCase();
          const lowerContent = content.toLowerCase();
          return lowerPath.includes(lowerQuery) || lowerContent.includes(lowerQuery);
        });

        mockGraphProvider.query.mockResolvedValue({
          nodes: relevantFiles.map(([path, content]) => ({
            id: path,
            name: path,
            type: 'file',
            content,
            metadata: { filePath: path }
          }))
        });

        mockVectorProvider.search.mockResolvedValue(
          relevantFiles.map(([path, content]) => ({
            id: path,
            similarity: 0.8,
            metadata: { type: 'file', filePath: path }
          }))
        );

        const results = await ragExtractor.searchContext(query, '', 10);

        // 验证搜索结果
        expect(results).toBeDefined();
        expect(results.context).toBeDefined();
        expect(results.context.code).toBeDefined();
        expect(results.context.code.relevantFiles).toBeDefined();
        expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);

        // 验证相关性排序
        const relevantFilesResults = results.context.code.relevantFiles;
        for (let i = 0; i < relevantFilesResults.length - 1; i++) {
          expect(relevantFilesResults[i].relevance).toBeGreaterThanOrEqual(relevantFilesResults[i + 1].relevance);
        }
      }
    });

    it('应该支持增量索引和实时更新', async () => {
      // 初始文件
      const initialFile = {
        path: '/project/src/Service.ts',
        content: 'export class Service { method1() {} }'
      };

      await ragExtractor.handleFileChange({
        filePath: initialFile.path,
        content: initialFile.content
      });

      // 更新文件
      const updatedFile = {
        path: '/project/src/Service.ts',
        content: 'export class Service { method1() {} method2() {} }'
      };

      await ragExtractor.handleFileChange({
        filePath: updatedFile.path,
        content: updatedFile.content
      });

      // 验证增量更新
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(2);
      expect(mockVectorProvider.indexDocument).toHaveBeenCalledTimes(2);
    });
  });

  describe('性能和稳定性测试', () => {
    it('应该能够处理大规模项目索引', async () => {
      const fileCount = 500;
      const files: Array<{path: string, content: string}> = [];

      // 生成大量文件
      for (let i = 0; i < fileCount; i++) {
        files.push({
          path: `/project/src/module${i}/Component${i}.tsx`,
          content: `
import React from 'react';

export interface Component${i}Props {
  title: string;
  data: any[];
}

export const Component${i}: React.FC<Component${i}Props> = ({ title, data }) => {
  return (
    <div>
      <h1>{title}</h1>
      <ul>
        {data.map((item, index) => (
          <li key={index}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
};

export default Component${i};
`
        });
      }

      const startTime = Date.now();

      // 批量索引
      for (const file of files) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      const endTime = Date.now();
      const indexingTime = endTime - startTime;

      // 验证索引性能
      expect(indexingTime).toBeLessThan(30000); // 30秒内完成
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(fileCount);
      expect(mockVectorProvider.indexDocument).toHaveBeenCalledTimes(fileCount);
    });

    it('应该能够处理高并发搜索请求', async () => {
      const testFiles = [
        {
          path: '/project/src/UserService.ts',
          content: 'export class UserService { createUser() {} }'
        },
        {
          path: '/project/src/UserController.ts',
          content: 'export class UserController { handleUser() {} }'
        }
      ];

      for (const file of testFiles) {
        await ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        });
      }

      // 模拟并发搜索
      const concurrentSearches = 20;
      const searchPromises = [];

      for (let i = 0; i < concurrentSearches; i++) {
        mockGraphProvider.query.mockResolvedValue({
          nodes: testFiles.map(file => ({
            id: file.path,
            name: file.path,
            type: 'file',
            content: file.content,
            metadata: { filePath: file.path }
          }))
        });

        searchPromises.push(ragExtractor.searchContext('user', '', 10));
      }

      const startTime = Date.now();
      const results = await Promise.all(searchPromises);
      const endTime = Date.now();

      // 验证并发性能
      expect(endTime - startTime).toBeLessThan(5000); // 5秒内完成
      expect(results.length).toBe(concurrentSearches);
      results.forEach(result => {
        expect(result.context.code.relevantFiles.length).toBeGreaterThan(0);
      });
    });
  });

  describe('错误恢复和边界情况', () => {
    it('应该能够从索引错误中恢复', async () => {
      const testFiles = [
        {
          path: '/project/src/ValidFile.ts',
          content: 'export class ValidFile {}'
        },
        {
          path: '/project/src/InvalidFile.ts',
          content: 'invalid content that might cause parsing errors'
        }
      ];

      // 模拟索引错误
      mockGraphProvider.upsertNode.mockResolvedValueOnce(Promise.resolve())
        .mockRejectedValueOnce(new Error('Graph indexing failed'))
        .mockResolvedValue(Promise.resolve());

      mockVectorProvider.indexDocument.mockResolvedValue(Promise.resolve());

      for (const file of testFiles) {
        await expect(ragExtractor.handleFileChange({
          filePath: file.path,
          content: file.content
        })).resolves.not.toThrow();
      }

      // 验证系统能够继续工作
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(2);
    });

    it('应该能够处理内存不足的情况', async () => {
      // 模拟内存不足
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        rss: 1024 * 1024 * 1024, // 1GB
        heapTotal: 1024 * 1024 * 1024,
        heapUsed: 800 * 1024 * 1024, // 800MB used
        external: 0,
        arrayBuffers: 0
      });

      const largeFile = {
        path: '/project/src/LargeFile.ts',
        content: 'a'.repeat(10 * 1024 * 1024) // 10MB file
      };

      await expect(ragExtractor.handleFileChange({
        filePath: largeFile.path,
        content: largeFile.content
      })).resolves.not.toThrow();

      // 恢复原始函数
      process.memoryUsage = originalMemoryUsage;
    });

    it('应该能够处理磁盘空间不足的情况', async () => {
      // 模拟磁盘写入失败
      vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('ENOSPC: no space left on device'));

      const testFile = {
        path: '/project/src/TestFile.ts',
        content: 'export class TestFile {}'
      };

      await expect(ragExtractor.handleFileChange({
        filePath: testFile.path,
        content: testFile.content
      })).resolves.not.toThrow();
    });
  });

  describe('实际使用场景模拟', () => {
    it('应该支持开发者典型的搜索场景', async () => {
      // 模拟React项目结构
      const reactProject = {
        '/project/src/components/UserProfile.tsx': `
import React, { useState, useEffect } from 'react';
import { User } from '../types/User';
import { UserService } from '../services/UserService';

interface UserProfileProps {
  userId: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userId }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, [userId]);

  const loadUserData = async () => {
    try {
      const userData = await UserService.getUserById(userId);
      setUser(userData);
    } catch (error) {
      console.error('加载用户数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  if (!user) {
    return <div>用户未找到</div>;
  }

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>邮箱: {user.email}</p>
      <p>角色: {user.role}</p>
    </div>
  );
};
`,
        '/project/src/services/UserService.ts': `
export class UserService {
  static async getUserById(id: string): Promise<User> {
    const response = await fetch(\`/api/users/\${id}\`);
    if (!response.ok) {
      throw new Error('获取用户失败');
    }
    return response.json();
  }

  static async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const response = await fetch(\`/api/users/\${id}\`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    return response.json();
  }
}
`,
        '/project/src/hooks/useUser.ts': `
import { useState, useEffect } from 'react';
import { User } from '../types/User';
import { UserService } from '../services/UserService';

export const useUser = (userId: string) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, [userId]);

  const loadUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const userData = await UserService.getUserById(userId);
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    try {
      const updatedUser = await UserService.updateUser(userId, userData);
      setUser(updatedUser);
      return updatedUser;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
      throw err;
    }
  };

  return { user, loading, error, updateUser, reload: loadUser };
};
`
      };

      // 索引项目文件
      for (const [filePath, content] of Object.entries(reactProject)) {
        mockFileSystem.set(filePath, content);
        await ragExtractor.handleFileChange({ filePath, content });
      }

      // 典型搜索场景
      const searchScenarios = [
        {
          query: 'user profile component',
          expectFilesContaining: ['UserProfile', 'useUser']
        },
        {
          query: 'API调用',
          expectFilesContaining: ['UserService', 'fetch']
        },
        {
          query: 'React hooks',
          expectFilesContaining: ['useUser', 'useState', 'useEffect']
        },
        {
          query: '错误处理',
          expectFilesContaining: ['error', 'catch', 'try']
        }
      ];

      for (const scenario of searchScenarios) {
        mockGraphProvider.query.mockResolvedValue({
          nodes: Object.entries(reactProject).map(([path, content]) => ({
            id: path,
            name: path,
            type: 'file',
            content,
            metadata: { filePath: path }
          }))
        });

        const results = await ragExtractor.searchContext(scenario.query, '', 10);
        
        expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);
        
        // 验证搜索结果包含期望的关键词
        const allContent = results.context.code.relevantFiles
          .map(f => f.path + ' ' + f.summary)
          .join(' ');
        
        scenario.expectFilesContaining.forEach(keyword => {
          expect(allContent.toLowerCase()).toContain(keyword.toLowerCase());
        });
      }
    });

    it('应该支持多轮对话中的上下文保持', async () => {
      const conversationFiles = {
        '/project/src/ChatService.ts': `
export class ChatService {
  private conversationHistory: Message[] = [];

  async sendMessage(message: string): Promise<string> {
    // 添加用户消息到历史
    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // 调用AI服务
    const response = await this.callAI(message);
    
    // 添加助手响应到历史
    this.conversationHistory.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });

    return response;
  }

  getConversationHistory(): Message[] {
    return this.conversationHistory;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
`
      };

      for (const [filePath, content] of Object.entries(conversationFiles)) {
        mockFileSystem.set(filePath, content);
        await ragExtractor.handleFileChange({ filePath, content });
      }

      // 模拟多轮对话搜索
      const conversationQueries = [
        '对话历史',
        '消息发送',
        '聊天服务',
        'AI调用'
      ];

      for (const query of conversationQueries) {
        mockGraphProvider.query.mockResolvedValue({
          nodes: Object.entries(conversationFiles).map(([path, content]) => ({
            id: path,
            name: path,
            type: 'file',
            content,
            metadata: { filePath: path }
          }))
        });

        const results = await ragExtractor.searchContext(query, '', 10);
        expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe('配置和自定义测试', () => {
    it('应该支持不同的算法配置', async () => {
      const algorithms = ['tfidf', 'bm25', 'cosine'];
      
      for (const algorithm of algorithms) {
        const customRagExtractor = new RAGContextExtractor(
          mockGraphProvider,
          mockVectorProvider,
          {
            maxResults: 5,
            relevanceThreshold: 0.2,
            algorithm: algorithm as any,
            enableSemanticAnalysis: true,
            enableEntityExtraction: true,
            enableDynamicEntityExtraction: true,
            enableConceptExtraction: true,
            enableContextualRelevance: true,
            semanticSimilarityThreshold: 0.4,
            entityExtractionMode: 'adaptive',
            useAdvancedFiltering: true,
            enableHybridRanking: true,
            maxEntityCount: 30,
            maxConceptCount: 20,
            contextWindow: 5,
            enableRealTimeUpdate: true,
            enableGraphTraversal: true,
          }
        );

        const testFile = {
          path: '/project/src/TestFile.ts',
          content: 'export class TestFile { testMethod() {} }'
        };

        await customRagExtractor.handleFileChange({
          filePath: testFile.path,
          content: testFile.content
        });

        expect(mockGraphProvider.upsertNode).toHaveBeenCalled();
        expect(mockVectorProvider.indexDocument).toHaveBeenCalled();
      }
    });

    it('应该支持自定义相关性阈值', async () => {
      const highThresholdConfig = {
        maxResults: 10,
        relevanceThreshold: 0.8, // 高阈值
        algorithm: 'tfidf' as const,
        enableSemanticAnalysis: true,
        enableEntityExtraction: true,
        enableDynamicEntityExtraction: true,
        enableConceptExtraction: true,
        enableContextualRelevance: true,
        semanticSimilarityThreshold: 0.7,
        entityExtractionMode: 'adaptive' as const,
        useAdvancedFiltering: true,
        enableHybridRanking: true,
        maxEntityCount: 50,
        maxConceptCount: 30,
        contextWindow: 3,
        enableRealTimeUpdate: true,
        enableGraphTraversal: true,
      };

      const highThresholdRag = new RAGContextExtractor(
        mockGraphProvider,
        mockVectorProvider,
        highThresholdConfig
      );

      const testFile = {
        path: '/project/src/TestFile.ts',
        content: 'export class TestFile { testMethod() {} }'
      };

      await highThresholdRag.handleFileChange({
        filePath: testFile.path,
        content: testFile.content
      });

      mockGraphProvider.query.mockResolvedValue({
        nodes: [{
          id: testFile.path,
          name: testFile.path,
          type: 'file',
          content: testFile.content,
          metadata: { filePath: testFile.path },
          relevance: 0.9 // 高相关性
        }]
      });

      const results = await highThresholdRag.searchContext('test', '', 10);
      expect(results.context.code.relevantFiles.length).toBeGreaterThan(0);
    });
  });

  describe('集成测试', () => {
    it('应该与现有系统无缝集成', async () => {
      // 模拟现有系统的文件变更通知
      const systemFiles = [
        '/project/src/existing/OldService.ts',
        '/project/src/existing/OldController.ts',
        '/project/docs/existing/OldDocs.md'
      ];

      for (const filePath of systemFiles) {
        const content = `// Existing file content for ${filePath}`;
        await ragExtractor.handleFileChange({ filePath, content });
      }

      // 验证现有文件被正确索引
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(systemFiles.length);
      expect(mockVectorProvider.indexDocument).toHaveBeenCalledTimes(systemFiles.length);
    });

    it('应该支持实时文件监控集成', async () => {
      // 模拟文件监控器的事件
      const fileEvents = [
        { type: 'add', path: '/project/src/NewFile.ts', content: 'new content' },
        { type: 'change', path: '/project/src/NewFile.ts', content: 'updated content' },
        { type: 'delete', path: '/project/src/NewFile.ts' }
      ];

      for (const event of fileEvents) {
        if (event.type === 'add' || event.type === 'change') {
          await ragExtractor.handleFileChange({
            filePath: event.path,
            content: event.content
          });
        }
        // 删除事件的处理可能需要额外的方法
      }

      // 验证文件事件被正确处理
      expect(mockGraphProvider.upsertNode).toHaveBeenCalledTimes(2); // add + change
    });
  });
});

// 辅助函数
function generateTestFileContent(
  fileType: 'ts' | 'js' | 'py' | 'java' | 'md',
  className: string,
  content: string
): string {
  switch (fileType) {
    case 'ts':
      return `export class ${className} {\n  ${content}\n}`;
    case 'js':
      return `class ${className} {\n  ${content}\n}\n\nmodule.exports = ${className};`;
    case 'py':
      return `class ${className}:\n    ${content}`;
    case 'java':
      return `public class ${className} {\n    ${content}\n}`;
    case 'md':
      return `# ${className}\n\n${content}`;
    default:
      return content;
  }
}
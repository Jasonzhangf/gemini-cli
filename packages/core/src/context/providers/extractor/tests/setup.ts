/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

/**
 * RAG测试环境设置
 * 
 * 这个文件配置RAG测试套件的全局环境，包括：
 * - Mock设置
 * - 全局变量配置
 * - 测试数据准备
 * - 清理逻辑
 */

// 全局测试配置
const TEST_CONFIG = {
  timeout: 30000,
  mockTimeout: 5000,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 1000,
  debug: process.env.NODE_ENV === 'development'
};

// 全局Mock对象
let globalMocks: {
  console: any;
  performance: any;
  crypto: any;
} = {} as any;

/**
 * 全局测试前置设置
 */
beforeAll(() => {
  if (TEST_CONFIG.debug) {
    console.log('🚀 Starting RAG test suite...');
  }

  // 设置全局timeout
  vi.setConfig({
    testTimeout: TEST_CONFIG.timeout,
    hookTimeout: TEST_CONFIG.mockTimeout,
  });

  // Mock console以减少测试输出噪音
  globalMocks.console = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  // 只在非调试模式下静默console
  if (!TEST_CONFIG.debug) {
    vi.spyOn(console, 'log').mockImplementation(globalMocks.console.log);
    vi.spyOn(console, 'warn').mockImplementation(globalMocks.console.warn);
    vi.spyOn(console, 'error').mockImplementation(globalMocks.console.error);
    vi.spyOn(console, 'info').mockImplementation(globalMocks.console.info);
    vi.spyOn(console, 'debug').mockImplementation(globalMocks.console.debug);
  }

  // Mock performance对象
  globalMocks.performance = {
    now: vi.fn().mockReturnValue(Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
  };

  if (typeof global.performance === 'undefined') {
    (global as any).performance = globalMocks.performance;
  }

  // Mock crypto对象
  globalMocks.crypto = {
    randomUUID: vi.fn().mockImplementation(() => 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      })
    ),
    getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }),
  };

  if (typeof global.crypto === 'undefined') {
    (global as any).crypto = globalMocks.crypto;
  }

  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.RAG_TEST_MODE = 'true';
  process.env.RAG_DEBUG = TEST_CONFIG.debug ? 'true' : 'false';
});

/**
 * 全局测试后置清理
 */
afterAll(() => {
  if (TEST_CONFIG.debug) {
    console.log('🏁 RAG test suite completed');
  }

  // 清理全局mocks
  vi.clearAllMocks();
  vi.restoreAllMocks();

  // 清理环境变量
  delete process.env.RAG_TEST_MODE;
  delete process.env.RAG_DEBUG;
});

/**
 * 每个测试前的设置
 */
beforeEach(() => {
  // 重置时间相关的mocks
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

  // 重置内存使用情况mock
  vi.spyOn(process, 'memoryUsage').mockReturnValue({
    rss: 100 * 1024 * 1024, // 100MB
    heapTotal: 50 * 1024 * 1024, // 50MB
    heapUsed: 30 * 1024 * 1024, // 30MB
    external: 5 * 1024 * 1024, // 5MB
    arrayBuffers: 1 * 1024 * 1024, // 1MB
  });
});

/**
 * 每个测试后的清理
 */
afterEach(() => {
  // 恢复真实时间
  vi.useRealTimers();

  // 清理测试相关的mocks
  vi.clearAllMocks();
  
  // 清理可能的内存泄漏
  if (global.gc) {
    global.gc();
  }
});

/**
 * 测试工具函数
 */
export const testUtils = {
  /**
   * 创建测试用的文件内容
   */
  createTestFileContent: (type: 'ts' | 'js' | 'py' | 'java' | 'md', size: number = 1000): string => {
    const templates = {
      ts: `// TypeScript test file
export class TestClass {
  private property: string = 'test';
  
  public method(): void {
    console.log('test method');
  }
}`,
      js: `// JavaScript test file
class TestClass {
  constructor() {
    this.property = 'test';
  }
  
  method() {
    console.log('test method');
  }
}

module.exports = TestClass;`,
      py: `# Python test file
class TestClass:
    def __init__(self):
        self.property = 'test'
    
    def method(self):
        print('test method')`,
      java: `// Java test file
public class TestClass {
    private String property = "test";
    
    public void method() {
        System.out.println("test method");
    }
}`,
      md: `# Test Document

This is a test markdown document.

## Section 1
Content of section 1.

## Section 2
Content of section 2.

\`\`\`typescript
// Code example
function example() {
  return 'test';
}
\`\`\``
    };

    let content = templates[type];
    
    // 如果需要更大的文件，重复内容
    while (content.length < size) {
      content += '\n' + content;
    }
    
    return content.substring(0, size);
  },

  /**
   * 创建测试用的文件路径
   */
  createTestFilePath: (filename: string, extension: string = 'ts'): string => {
    return `/project/src/test/${filename}.${extension}`;
  },

  /**
   * 等待指定时间
   */
  delay: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 生成随机字符串
   */
  randomString: (length: number = 10): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * 验证性能指标
   */
  measurePerformance: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  /**
   * 创建大量测试文件
   */
  createManyFiles: (count: number, contentSize: number = 1000): Array<{path: string, content: string}> => {
    const files = [];
    for (let i = 0; i < count; i++) {
      files.push({
        path: testUtils.createTestFilePath(`file${i}`, 'ts'),
        content: testUtils.createTestFileContent('ts', contentSize)
      });
    }
    return files;
  },

  /**
   * 模拟并发操作
   */
  concurrent: async <T>(operations: Array<() => Promise<T>>, maxConcurrency: number = 10): Promise<T[]> => {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const operation of operations) {
      const promise = operation().then(result => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }
};

/**
 * 测试数据常量
 */
export const testData = {
  // 多语言关键字
  keywords: {
    chinese: ['用户', '密码', '登录', '注册', '管理', '服务', '配置', '数据库'],
    english: ['user', 'password', 'login', 'register', 'manage', 'service', 'config', 'database'],
    mixed: ['用户service', 'password密码', 'login登录', 'config配置']
  },

  // 文件扩展名
  extensions: ['ts', 'js', 'py', 'java', 'md', 'json', 'xml', 'yaml', 'txt'],

  // 编程语言关键字
  programmingKeywords: {
    typescript: ['interface', 'class', 'function', 'const', 'let', 'var', 'import', 'export'],
    javascript: ['function', 'const', 'let', 'var', 'import', 'export', 'require', 'module'],
    python: ['class', 'def', 'import', 'from', 'if', 'else', 'for', 'while'],
    java: ['class', 'public', 'private', 'static', 'void', 'import', 'package'],
    markdown: ['#', '##', '###', '```', '**', '*', '[]', '()']
  },

  // 测试文件模板
  fileTemplates: {
    userService: `export class UserService {
  async createUser(data: UserData): Promise<User> {
    // 创建用户逻辑
    return this.userRepository.create(data);
  }
  
  async getUserById(id: string): Promise<User | null> {
    // 获取用户逻辑
    return this.userRepository.findById(id);
  }
}`,
    apiDoc: `# API文档

## 用户接口

### 创建用户
POST /api/users

### 获取用户
GET /api/users/:id

### 更新用户
PUT /api/users/:id

### 删除用户
DELETE /api/users/:id`,
    config: `{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "testdb"
  },
  "auth": {
    "secret": "test-secret",
    "expires": "24h"
  }
}`
  }
};

// 导出配置和工具
export { TEST_CONFIG, globalMocks };
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RAG测试套件索引文件
 * 
 * 这个文件导出所有RAG相关的测试套件，方便统一管理和运行
 */

// 导出所有测试套件
export * from './rag-md-encoding.test.js';
export * from './rag-filename-encoding.test.js';
export * from './rag-context-extraction.test.js';
export * from './rag-keyword-matching.test.js';
export * from './rag-comprehensive.test.js';

/**
 * 测试套件说明
 * 
 * 1. rag-md-encoding.test.ts - MD文件编码支持测试
 *    - 测试中文、英文、特殊字符的处理
 *    - 多语言分词和tokenization
 *    - 代码块内容处理
 *    - 大型文件性能测试
 * 
 * 2. rag-filename-encoding.test.ts - 文件名编码机制测试
 *    - 文件名标准化和编码
 *    - 中文文件名处理
 *    - 特殊字符和空格处理
 *    - 路径分离和组件提取
 *    - 文件名实体提取
 * 
 * 3. rag-context-extraction.test.ts - Graph查询原文件上下文提取测试
 *    - 命中行上下10行内容提取
 *    - 多语言代码上下文提取
 *    - Markdown文档上下文提取
 *    - 边界情况处理
 *    - 性能测试
 * 
 * 4. rag-keyword-matching.test.ts - 关键字命中文件和内容测试
 *    - 文件名关键字匹配
 *    - 文件内容关键字匹配
 *    - 模糊匹配和语义匹配
 *    - 相关性排序和过滤
 *    - 多语言关键字搜索
 * 
 * 5. rag-comprehensive.test.ts - 综合测试套件
 *    - 完整工作流测试
 *    - 性能和稳定性测试
 *    - 错误恢复和边界情况
 *    - 实际使用场景模拟
 *    - 集成测试
 */

/**
 * 运行指定的测试套件
 * 
 * @example
 * ```bash
 * # 运行所有RAG测试
 * npm test -- src/context/providers/extractor/tests/
 * 
 * # 运行特定测试套件
 * npm test -- src/context/providers/extractor/tests/rag-md-encoding.test.ts
 * npm test -- src/context/providers/extractor/tests/rag-filename-encoding.test.ts
 * npm test -- src/context/providers/extractor/tests/rag-context-extraction.test.ts
 * npm test -- src/context/providers/extractor/tests/rag-keyword-matching.test.ts
 * npm test -- src/context/providers/extractor/tests/rag-comprehensive.test.ts
 * 
 * # 运行特定测试用例
 * npm test -- --grep "应该正确编码包含中文的MD文件"
 * npm test -- --grep "应该能够通过文件名关键字找到相关文件"
 * npm test -- --grep "应该能够提取命中行的上下10行内容"
 * ```
 */

/**
 * 测试配置建议
 * 
 * 在vitest.config.ts中添加以下配置：
 * ```typescript
 * export default defineConfig({
 *   test: {
 *     globals: true,
 *     environment: 'node',
 *     setupFiles: ['./src/context/providers/extractor/tests/setup.ts'],
 *     testTimeout: 30000, // 30秒超时
 *     hookTimeout: 10000, // 10秒hook超时
 *     coverage: {
 *       reporter: ['text', 'json', 'html'],
 *       include: ['src/context/providers/extractor/**/*.ts'],
 *       exclude: ['src/context/providers/extractor/tests/**/*.ts']
 *     }
 *   }
 * });
 * ```
 */
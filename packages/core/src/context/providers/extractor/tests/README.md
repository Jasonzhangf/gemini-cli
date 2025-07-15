# RAG测试套件

这是一个全面的RAG（Retrieval-Augmented Generation）系统测试套件，专门用于测试Gemini CLI项目中的RAG功能。

## 📋 测试覆盖范围

### 1. MD文件编码支持测试 (`rag-md-encoding.test.ts`)
- ✅ 中文、英文、特殊字符MD文件处理
- ✅ 多语言分词和tokenization
- ✅ 代码块内容解析
- ✅ 大型文件性能测试
- ✅ 格式错误MD文件处理

### 2. 文件名编码机制测试 (`rag-filename-encoding.test.ts`)
- ✅ 标准文件名编码和标准化
- ✅ 中文文件名处理
- ✅ 特殊字符和空格处理
- ✅ 路径分离和组件提取
- ✅ 文件名实体提取和索引
- ✅ 驼峰命名法识别

### 3. Graph查询原文件上下文提取测试 (`rag-context-extraction.test.ts`)
- ✅ 命中行上下10行内容提取
- ✅ 多语言代码上下文提取（TypeScript、Python、Java）
- ✅ Markdown文档上下文提取
- ✅ 文件边界情况处理
- ✅ 大文件和并发处理性能测试

### 4. 关键字命中文件和内容测试 (`rag-keyword-matching.test.ts`)
- ✅ 文件名关键字匹配
- ✅ 文件内容关键字匹配
- ✅ 模糊匹配和语义匹配
- ✅ 相关性排序和过滤
- ✅ 多语言关键字搜索
- ✅ 同义词匹配

### 5. 综合测试套件 (`rag-comprehensive.test.ts`)
- ✅ 完整工作流测试（索引→搜索→提取→排序）
- ✅ 大规模项目性能测试
- ✅ 高并发搜索测试
- ✅ 错误恢复和边界情况
- ✅ 实际使用场景模拟
- ✅ 配置和自定义测试

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行所有测试

```bash
# 运行所有RAG测试
npm test -- src/context/providers/extractor/tests/

# 运行测试并生成覆盖率报告
npm test -- --coverage src/context/providers/extractor/tests/
```

### 运行特定测试套件

```bash
# MD文件编码测试
npm test -- src/context/providers/extractor/tests/rag-md-encoding.test.ts

# 文件名编码测试
npm test -- src/context/providers/extractor/tests/rag-filename-encoding.test.ts

# 上下文提取测试
npm test -- src/context/providers/extractor/tests/rag-context-extraction.test.ts

# 关键字匹配测试
npm test -- src/context/providers/extractor/tests/rag-keyword-matching.test.ts

# 综合测试
npm test -- src/context/providers/extractor/tests/rag-comprehensive.test.ts
```

### 运行特定测试用例

```bash
# 运行包含特定关键字的测试
npm test -- --grep "应该正确编码包含中文的MD文件"
npm test -- --grep "应该能够提取命中行的上下10行内容"
npm test -- --grep "应该支持模糊匹配功能"
```

## 🎯 测试重点功能

### 1. MD文件编码增强

**需求**：RAG需要编码MD文件，包括文件名编码

**实现**：
- 支持中文、英文、特殊字符的MD文件
- 正确处理Markdown语法和代码块
- 文件名的标准化和实体提取

**测试用例**：
```typescript
it('应该正确编码包含中文的MD文件', async () => {
  const testMdContent = `# 项目介绍
这是一个基于Node.js的项目，主要功能包括：
- 支持多语言分词
- 实现语义搜索
`;
  // 测试逻辑...
});
```

### 2. Graph查询原文件上下文提取

**需求**：RAG现在除了编码graph的内容，还需要通过graph查询到原文件，将原文件上下10行提取出来

**实现**：
- 通过graph查询定位到原文件
- 提取命中行的上下10行内容
- 保持代码结构和格式完整性
- 处理文件边界情况

**测试用例**：
```typescript
it('应该能够提取命中行的上下10行内容', async () => {
  const contextLines = await extractContextLines(testFileContent, 16, 10);
  expect(contextLines.lines.length).toBeLessThanOrEqual(21); // 最多21行
});
```

### 3. 关键字命中文件和内容

**需求**：根据关键字可以命中文件和说明文件的内容

**实现**：
- 文件名关键字匹配
- 文件内容关键字匹配
- 多语言关键字搜索
- 相关性排序和过滤

**测试用例**：
```typescript
it('应该能够通过文件名关键字找到相关文件', async () => {
  const results = await ragExtractor.searchContext('user', '', 10);
  expect(results.context.code.relevantFiles.length).toBe(4);
});
```

## 📊 性能基准

### 索引性能
- **单文件索引**: < 100ms
- **大文件索引** (10MB): < 5s
- **批量索引** (500文件): < 30s

### 搜索性能
- **简单搜索**: < 200ms
- **复杂搜索**: < 1s
- **并发搜索** (20个请求): < 5s

### 内存使用
- **基础占用**: ~100MB
- **大项目索引**: ~500MB
- **峰值使用**: < 1GB

## 🛠️ 配置选项

### 测试配置 (`setup.ts`)

```typescript
const TEST_CONFIG = {
  timeout: 30000,           // 测试超时时间
  mockTimeout: 5000,        // Mock超时时间
  maxFileSize: 10 * 1024 * 1024,  // 最大文件大小
  maxFiles: 1000,           // 最大文件数量
  debug: process.env.NODE_ENV === 'development'
};
```

### RAG配置示例

```typescript
const ragConfig = {
  maxResults: 10,           // 最大结果数
  relevanceThreshold: 0.1,  // 相关性阈值
  algorithm: 'tfidf',       // 算法类型
  enableSemanticAnalysis: true,     // 语义分析
  enableEntityExtraction: true,     // 实体提取
  contextWindow: 3,         // 上下文窗口大小
  enableRealTimeUpdate: true,       // 实时更新
};
```

## 📈 测试报告

### 运行测试报告

```bash
# 生成详细的测试报告
npm test -- --reporter=verbose src/context/providers/extractor/tests/

# 生成覆盖率报告
npm test -- --coverage src/context/providers/extractor/tests/
```

### 覆盖率目标
- **语句覆盖率**: > 90%
- **分支覆盖率**: > 85%
- **函数覆盖率**: > 95%
- **行覆盖率**: > 90%

## 🔧 调试和开发

### 启用调试模式

```bash
# 启用调试输出
NODE_ENV=development npm test -- src/context/providers/extractor/tests/

# 启用RAG调试
RAG_DEBUG=true npm test -- src/context/providers/extractor/tests/
```

### 常用调试命令

```bash
# 运行单个测试并查看详细输出
npm test -- --grep "特定测试名称" --reporter=verbose

# 监控测试文件变化
npm test -- --watch src/context/providers/extractor/tests/

# 生成测试快照
npm test -- --update-snapshots src/context/providers/extractor/tests/
```

## 📝 贡献指南

### 添加新测试

1. 确定测试类别（MD编码、文件名编码、上下文提取、关键字匹配、综合）
2. 在相应的测试文件中添加测试用例
3. 使用 `testUtils` 中的辅助函数
4. 确保测试覆盖边界情况和错误处理

### 测试命名规范

```typescript
describe('功能模块名称', () => {
  describe('具体功能', () => {
    it('应该[期望行为]', async () => {
      // 测试实现
    });
  });
});
```

### 测试数据管理

- 使用 `testData` 常量提供测试数据
- 使用 `testUtils.createTestFileContent()` 创建测试文件
- 使用 `mockFileSystem` 模拟文件系统

## 🐛 故障排除

### 常见问题

1. **测试超时**
   - 检查 `TEST_CONFIG.timeout` 设置
   - 确保没有无限循环
   - 使用 `vi.useFakeTimers()` 控制时间

2. **内存泄漏**
   - 确保在 `afterEach` 中清理Mock
   - 使用 `vi.clearAllMocks()` 清理
   - 检查大文件测试的内存使用

3. **Mock失效**
   - 确保Mock在正确的作用域内
   - 使用 `vi.resetAllMocks()` 重置
   - 检查Mock的返回值类型

### 性能优化建议

1. **减少文件I/O**
   - 使用 `mockFileSystem` 替代真实文件
   - 批量处理测试数据

2. **优化异步操作**
   - 使用 `Promise.all()` 并行处理
   - 避免不必要的 `await`

3. **内存管理**
   - 及时清理大对象
   - 使用流式处理大文件

## 📚 相关文档

- [RAG系统架构文档](../README.md)
- [Vitest官方文档](https://vitest.dev/)
- [TypeScript测试指南](https://www.typescriptlang.org/docs/handbook/testing.html)

## 🤝 支持

如果您在使用这个测试套件时遇到问题，请：

1. 查看本README文档
2. 检查测试日志和错误信息
3. 在项目仓库中提交Issue
4. 联系开发团队获取支持

---

**更新时间**: 2025-01-15
**版本**: 1.0.0
**维护者**: Jason Zhang
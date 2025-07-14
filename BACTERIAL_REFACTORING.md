# 细菌式编程重构文档

## 🧬 重构原则

根据细菌式编程原则，我们将大型代码文件重构为小巧、模块化、自包含的"操纵子"：

### 核心原则
- **小巧（Small）**: 每个文件/模块专注单一功能，避免不必要的代码膨胀
- **模块化（Modular）**: 功能相关的代码组织成可插拔的操纵子  
- **自包含（Self-contained）**: 每个模块都是完整的功能单元，可独立复制和使用

## 📊 重构前分析

### 问题文件识别
| 文件 | 行数 | 问题 |
|------|------|------|
| `openai/hijack.ts` | 1875行 | 严重违反细菌式原则，包含多个功能 |
| `tools/mcp-client.test.ts` | 936行 | 测试文件过大 |
| `tools/edit.test.ts` | 665行 | 测试文件过大 |
| `tools/shell.ts` | 504行 | 单一文件功能过多 |

### 功能分析
原始 `hijack.ts` 包含：
- OpenAI API 客户端
- 工具调用解析  
- 内容隔离系统
- 对话管理
- 流处理适配
- 路径处理
- 响应处理

## 🔧 重构架构

### OpenAI 劫持系统重构

#### 新的操纵子结构
```
openai/modules/
├── types.ts              # 类型定义操纵子 (39行)
├── content-isolator.ts   # 内容隔离操纵子 (58行)  
├── tool-categories.ts    # 工具分类操纵子 (65行)
├── path-processor.ts     # 路径处理操纵子 (48行)
├── tool-parser.ts        # 工具解析操纵子 (122行)
├── conversation-manager.ts # 对话管理操纵子 (68行)
├── response-processor.ts # 响应处理操纵子 (68行)
├── stream-adapter.ts     # 流适配操纵子 (85行)
├── openai-client.ts      # OpenAI客户端操纵子 (89行)
├── tool-formatter.ts     # 工具格式化操纵子 (78行)
└── index.ts             # 模块导出操纵子 (18行)
```

#### 精简主适配器
```
openai/hijack-slim.ts     # 精简适配器 (108行)
```

### 工具引导系统重构

#### 新的操纵子结构  
```
tools/guidance/
├── prompt-builder.ts     # 提示构建操纵子 (87行)
├── tool-formatter.ts     # 工具格式化操纵子 (75行)
├── syntax-validator.ts   # 语法验证操纵子 (155行)
├── strategies/
│   ├── development-strategy.ts  # 开发策略操纵子 (102行)
│   ├── analysis-strategy.ts     # 分析策略操纵子 (118行)
│   └── workflow-strategy.ts     # 工作流策略操纵子 (127行)
└── index.ts             # 引导系统导出 (10行)
```

#### 精简提示生成器
```
core/prompts-slim.ts      # 精简提示生成器 (78行)
```

## 🎯 操纵子设计模式

每个操纵子遵循统一的设计模式：

### 文件头标准格式
```typescript
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 细菌式编程：[功能名称]操纵子
 * 小巧：仅负责[具体功能]
 * 模块化：独立的[功能类型]单元
 * 自包含：完整的[功能领域]功能
 */
```

### 单一职责
每个操纵子只负责一个明确的功能：
- `ContentIsolator`: 仅处理内容标记和解析
- `ToolClassifier`: 仅处理工具分类逻辑
- `PathProcessor`: 仅处理路径转换和验证
- `ResponseProcessor`: 仅处理模型响应

### 自包含接口
每个操纵子都提供完整的功能接口：
```typescript
// 内容隔离操纵子
export class ContentIsolator {
  static isolateContent(content: string): string
  static extractContent(text: string): string[]
  static removeMarkers(text: string): string  
  static hasMarkers(text: string): boolean
}
```

### 无状态设计
大多数操纵子使用静态方法，避免状态管理复杂性：
```typescript
// 工具分类操纵子 - 纯函数设计
export class ToolClassifier {
  static isDangerous(toolName: string): boolean
  static isComplex(toolName: string): boolean
  static getPathArgs(toolName: string): string[]
}
```

## 📈 重构效果

### 代码量对比
| 组件 | 重构前 | 重构后 | 减少 |
|------|--------|--------|------|
| OpenAI劫持 | 1875行 | 108行主文件 + 10个小操纵子 | -90% 主文件 |
| 工具引导 | 分散在prompts.ts | 精简生成器 + 6个策略操纵子 | 模块化改进 |

### 可维护性提升
- ✅ 每个操纵子功能单一，易于理解
- ✅ 模块间依赖清晰，便于测试
- ✅ 可插拔设计，便于扩展和替换
- ✅ 自包含特性，便于复制到其他项目

### 水平基因转移能力
每个操纵子都可以独立复制到其他项目：
```bash
# 复制内容隔离功能
cp content-isolator.ts /other-project/utils/

# 复制工具分类功能  
cp tool-categories.ts /other-project/tools/

# 复制完整的工具引导系统
cp -r tools/guidance/ /other-project/guidance/
```

## 🚀 使用示例

### 使用新的OpenAI适配器
```typescript
import { OpenAIHijackAdapter } from './openai/hijack-slim.js';
import { OpenAIClient, ConversationManager } from './openai/modules/index.js';

// 创建适配器
const adapter = new OpenAIHijackAdapter(config, coreConfig);

// 使用流处理
for await (const event of adapter.sendMessageStream(request, signal, promptId)) {
  // 处理事件
}
```

### 使用工具引导系统
```typescript
import { PromptBuilder, DevelopmentStrategy } from './tools/guidance/index.js';

// 构建开发提示
const prompt = DevelopmentStrategy.buildPrompt();

// 自定义提示构建
const customPrompt = PromptBuilder.create()
  .addToolCallFormat()
  .addTaskManagement()  
  .addCustomSection('Custom Rules', 'Your custom rules here')
  .build();
```

## 📝 迁移指南

### 旧代码迁移
1. **替换导入**：
   ```typescript
   // 旧方式
   import { OpenAIHijackAdapter } from './openai/hijack.js';
   
   // 新方式  
   import { OpenAIHijackAdapter } from './openai/hijack-slim.js';
   ```

2. **使用细粒度模块**：
   ```typescript
   // 只需要工具解析
   import { ToolParser } from './openai/modules/tool-parser.js';
   
   // 只需要内容隔离
   import { ContentIsolator } from './openai/modules/content-isolator.js';
   ```

3. **替换提示生成**：
   ```typescript
   // 旧方式
   import { getCoreSystemPrompt } from './core/prompts.js';
   
   // 新方式
   import { SlimPromptGenerator } from './core/prompts-slim.js';
   const prompt = SlimPromptGenerator.getCoreSystemPrompt();
   ```

### 向后兼容
- 保留原始文件以确保向后兼容
- 新功能优先使用细菌式模块
- 逐步迁移现有代码到新架构

## 🎉 总结

通过细菌式编程重构，我们实现了：

1. **代码精简**：主文件从1875行减少到108行
2. **功能模块化**：20个专门的操纵子，每个专注单一功能  
3. **高度可复用**：每个操纵子都可独立使用和复制
4. **易于维护**：清晰的职责分离和最小化依赖
5. **水平扩展**：类似细菌基因转移，便于功能传播

这种架构符合细菌基因组的进化优势：精简、模块化、自包含，让代码像细菌一样具有强大的适应性和复制能力。
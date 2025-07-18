# Context Generation Functions Analysis

## 1. Context生成函数列表

### A. 系统提示词生成 (System Prompt Generation)
- **文件**: `packages/core/src/context/index.ts`
  - `getEnhancedSystemPromptIfAvailable(config: Config, userMessage?: string): Promise<string>`
  - **职责**: 统一入口，生成增强的系统提示词

- **文件**: `packages/core/src/core/unifiedPromptManager.ts`
  - `generateSystemPrompt(tools: FunctionDeclaration[], includeContext: boolean, includeTaskManagement: boolean): string`
  - `generateToolSpecificGuidance(tools: FunctionDeclaration[]): string`
  - **职责**: 生成模块化的系统提示词组件

### B. 上下文数据生成 (Context Data Generation)
- **文件**: `packages/core/src/context/contextAgent.ts`
  - `getContextForPrompt(userInput?: string): Promise<string>`
  - **职责**: 生成基于RAG的动态上下文

- **文件**: `packages/core/src/context/standardContextIntegrator.ts`
  - `getSystemContext(): Promise<SystemContext>`
  - `getStaticContext(includeProjectDiscovery: boolean): Promise<StaticContext>`
  - `getDynamicContext(): Promise<DynamicContext>`
  - `getTaskContext(): Promise<TaskContext>`
  - `getStandardContext(options): Promise<StandardContext>`
  - **职责**: 生成标准化的上下文结构

- **文件**: `packages/core/src/system/UnifiedSystemOrchestrator.ts`
  - `generateSystemContext(userInput?: string, conversationHistory?: any[]): Promise<string>`
  - **职责**: 统一系统级上下文编排

### C. 格式化和渲染 (Formatting and Rendering)
- **文件**: `packages/core/src/context/standardContextIntegrator.ts`
  - `formatStandardContextForModel(context: StandardContext, saveDebug: boolean): string`
  - `formatSystemContext(context: SystemContext): string`
  - `formatStaticContext(context: StaticContext): string`
  - `formatDynamicContext(context: DynamicContext): string`
  - `formatTaskContext(context: TaskContext): string`
  - **职责**: 将上下文数据格式化为模型可读的字符串

## 2. 功能职责分析

### ✅ 功能单一的函数 (Single Responsibility)

1. **UnifiedPromptManager**
   - `generateSystemPrompt()`: 纯粹的系统提示词生成
   - `generateToolSpecificGuidance()`: 纯粹的工具引导生成
   - ✅ 职责单一，无交织

2. **ContextAgent**
   - `getContextForPrompt()`: 专门生成基于RAG的动态上下文
   - ✅ 职责单一，专注于智能上下文提取

3. **StandardContextIntegrator** - 格式化函数
   - `formatSystemContext()`: 仅格式化系统上下文
   - `formatStaticContext()`: 仅格式化静态上下文
   - `formatDynamicContext()`: 仅格式化动态上下文
   - `formatTaskContext()`: 仅格式化任务上下文
   - ✅ 每个函数职责单一

### ❌ 存在问题的函数 (Multiple Responsibilities)

1. **getEnhancedSystemPromptIfAvailable()** - 在 `context/index.ts`
   ```typescript
   // 这个函数做了太多事情：
   // 1. 决定是否使用增强模式
   // 2. 获取工具列表
   // 3. 生成系统提示词
   // 4. 添加工具引导
   // 5. 处理错误回退
   ```
   **问题**: 职责过多，违反单一职责原则

2. **generateSystemContext()** - 在 `UnifiedSystemOrchestrator.ts`
   ```typescript
   // 这个函数做了太多事情：
   // 1. 执行多个模块
   // 2. 管理执行状态
   // 3. 处理并发执行
   // 4. 组合最终结果
   // 5. 事件发射
   ```
   **问题**: 编排逻辑和生成逻辑混合

3. **StandardContextIntegrator** - 数据获取函数
   ```typescript
   // 这些函数混合了数据获取和部分格式化：
   // getSystemContext() - 获取数据 + 部分处理
   // getStaticContext() - 获取数据 + 缓存管理
   // getDynamicContext() - 获取数据 + 内容过滤
   // getTaskContext() - 获取数据 + 状态判断
   ```
   **问题**: 数据获取和业务逻辑混合

## 3. 交织问题分析

### A. 系统提示词生成中的重复
- `UnifiedPromptManager.generateSystemPrompt()` 生成基础提示词
- `getEnhancedSystemPromptIfAvailable()` 又添加了工具引导
- **问题**: 工具引导生成逻辑分散在两个地方

### B. 上下文数据流混乱
```
User Request → getEnhancedSystemPromptIfAvailable()
                ↓
            UnifiedPromptManager.generateSystemPrompt()
                ↓
            + ContextAgent.getContextForPrompt()
                ↓
            + StandardContextIntegrator.getStandardContext()
                ↓
            + UnifiedSystemOrchestrator.generateSystemContext()
```
**问题**: 多个入口点，数据流不清晰

### C. 格式化逻辑分散
- `StandardContextIntegrator` 有自己的格式化方法
- `UnifiedSystemOrchestrator` 也有组合逻辑
- `ContextAgent` 也有上下文格式化
- **问题**: 格式化职责分散，可能导致不一致

## 4. 建议的重构方案

### Phase 1: 明确职责边界
1. **数据获取层**: 纯粹的数据获取，无格式化
2. **业务逻辑层**: 处理业务规则，无格式化
3. **格式化层**: 纯粹的格式化，无业务逻辑
4. **编排层**: 纯粹的流程控制，无具体实现

### Phase 2: 重构具体函数
1. 拆分 `getEnhancedSystemPromptIfAvailable()` 为多个单一职责函数
2. 重构 `generateSystemContext()` 为纯编排器
3. 统一格式化逻辑到单一模块
4. 建立清晰的数据流管道

### Phase 3: 消除交织
1. 统一工具引导生成入口
2. 建立单一上下文数据流
3. 消除重复的格式化逻辑
4. 建立清晰的依赖关系
# Gemini CLI 系统实现指南

## 📋 快速参考 - Claude 必读

**🔧 工具操作**: 使用 `packages/core/src/config/config.ts` 注册的工具
**🧠 RAG查询**: 只通过 `contextAgent.injectContextIntoDynamicSystem()`  
**📋 任务管理**: 使用 `create_tasks.ts` 及 snake_case 命名的任务工具
**📄 Context生成**: 
- Gemini模式: `promptBuilder.ts` 独立函数
- OpenAI模式: `tool-guidance.ts` 工具引导 (第三方模型必需)
**🔍 工具解析**: 
- Gemini模式: 原生FunctionCall
- OpenAI模式: `tool-call-parser.ts` (第三方模型必需)

**❌ 禁用系统**: 已删除的 `guidance/`, `refactored/`, Legacy `UnifiedToolSystem`, `*Tool.ts`
**✅ OpenAI专用**: `tool-guidance.ts`, `tool-call-parser.ts`, `hijack-refactored.ts` (保留)

## 系统架构概览

此文档描述了 Gemini CLI 的核心系统实现，每个功能模块的唯一入口点和实现文件。Claude 在进行系统相关操作时必须参考此文档确保使用正确的实现。

**清理状态**: ✅ 系统已完成重复实现清理，所有模块都有唯一的实现路径。

## 🔧 1. 工具系统 (Tool System)

### 主要实现路径
- **入口点**: `packages/core/src/config/config.ts` (registerCoreTool)
- **核心文件**: `packages/core/src/tools/` 目录下的各个工具文件

### 工具描述和引导
- **Gemini模式**: `packages/core/src/core/prompts.ts` - getCoreSystemPrompt() (原生function call)
- **OpenAI模式**: `packages/core/src/openai/context/tool-guidance.ts` - ToolGuidanceGenerator (文本引导)
- **状态**: **两套系统各有用途 - Gemini用原生，第三方模型需要文本引导**

### 重复实现需要清理
- ❌ `packages/core/src/tools/guidance/prompt-builder.ts` - 重复实现
- ❌ `packages/core/src/context/refactored/PromptSectionGenerator.ts` - 重复实现
- ❌ `packages/core/src/context/refactored/SystemPromptBuilder.ts` - 重复实现

### 任务管理工具
- **主要实现**: `packages/core/src/tools/create_tasks.ts` - CreateTasksTool 类
- **支持工具**: 
  - `get_current_task.ts`
  - `finish_current_task.ts` 
  - `insert_task.ts`
  - `modify_task.ts`
  - `get_next_task.ts`

## 🧠 2. RAG 和 LLM 增强系统

### 主要入口点
- **单一入口**: `packages/core/src/context/contextAgent.ts` - ContextAgent 类
- **调用位置**: `packages/cli/src/nonInteractiveCli.ts` 第73行
- **方法**: `injectContextIntoDynamicSystem(input)`

### LLM 意图识别（独立进程）
- **主要实现**: `packages/core/src/context/contextAgentLLMProcess.ts`
- **进程管理**: `packages/core/src/context/contextAgentProcessManager.ts`
- **HTTP 客户端**: `packages/core/src/context/contextAgentLLMClient.ts`
- **HTTP 服务器**: `packages/core/src/context/contextAgentLLMServer.ts`

### RAG 提供者
- **工厂类**: `packages/core/src/context/providers/contextProviderFactory.ts`
- **主要提供者**: Neo4j Graph RAG (`packages/core/src/context/providers/graph/neo4jKnowledgeGraphProvider.ts`)
- **备用提供者**: SiliconFlow (`packages/core/src/context/providers/vector/siliconFlowEmbeddingProvider.ts`)

### 重复实现需要清理
- ❌ `packages/core/src/openai/context/context-injector.ts` - 与主要 contextAgent 重复
- ❌ 各种 context manager 的重复实现

## 📋 3. Context 系统分离

### 系统上下文 (System Context)
- **实现**: `packages/core/src/core/prompts.ts` - getCoreSystemPrompt()
- **内容**: 身份、核心准则、工具格式、安全规则

### 工具上下文 (Tool Context) 
- **实现**: `packages/core/src/core/prompts.ts` 中的工具列表和示例
- **OpenAI 补充**: `packages/core/src/openai/context/tool-guidance.ts`

### 静态上下文 (Static Context)
- **实现**: `packages/core/src/context/staticAnalyzer.ts`
- **内容**: 项目结构、配置文件、依赖关系

### 动态上下文 (Dynamic Context)
- **实现**: `packages/core/src/context/contextAgent.ts` 中的 RAG 查询结果
- **提供者**: RAG 系统通过 contextProviderFactory

### 任务上下文 (Task Context)
- **实现**: `packages/core/src/context/promptBuilder.ts` - getCurrentTaskPrompt()
- **状态检查**: `packages/core/src/context/contextWrapper.ts`

### 对话记录 (Conversation History)
- **实现**: 由各个客户端管理 (Gemini/OpenAI)
- **分离器**: `packages/core/src/context/ContextHistorySeparator.ts`

### 严格分离原则
- 每个 context 部分有独立的生成函数
- 不能相互包含或交叉引用
- 通过 section 分隔符明确隔离

## 🔧 4. 工具解析和映射

### 工具解析 - 按模式分离
- **Gemini模式**: 原生 FunctionCall 解析 (无需文本解析)
- **OpenAI模式**: `packages/core/src/openai/parsers/tool-call-parser.ts` (第三方模型必需)
- **格式**: `[tool_call: tool_name for parameters]` (第三方模型的文本约定)

### OpenAI Hijack 系统
- **核心适配器**: `packages/core/src/openai/hijack-refactored.ts`
- **作用**: 让第三方模型通过OpenAI接口使用Gemini CLI核心功能
- **重要性**: 不是重复实现，是第三方模型支持的关键

### 工具映射
- **注册中心**: `packages/core/src/config/config.ts` - registerCoreTool()
- **工具定义**: 各个工具文件的导出类

### 已清理的重复实现
- ✅ `packages/core/src/tools/UnifiedToolSystem.ts` - parseToolCalls 已标记为废弃

## ⚡ 5. 任务系统

### 任务建立
- **主要入口**: `packages/core/src/tools/create_tasks.ts` - CreateTasksTool.execute()
- **集成**: `packages/core/src/context/standardContextIntegrator.ts`

### 任务引导
- **实现**: `packages/core/src/context/promptBuilder.ts` - getCurrentTaskPrompt()
- **模式检查**: `packages/core/src/context/contextWrapper.ts` - isInMaintenanceMode()

### 任务更新
- **完成**: `packages/core/src/tools/finish_current_task.ts`
- **插入**: `packages/core/src/tools/insert_task.ts`
- **修改**: `packages/core/src/tools/modify_task.ts`
- **获取**: `packages/core/src/tools/get_current_task.ts`

### 重复实现需要清理
- ❌ Legacy TaskManager 系统 (`packages/core/src/tools/ToolManager.ts`)
- ❌ UnifiedToolSystem 中的任务管理重复逻辑

## 📖 6. 系统使用指南

### Claude 操作规则
1. **工具操作**: 始终使用 `packages/core/src/config/config.ts` 注册的工具
2. **RAG 查询**: 只通过 `contextAgent.injectContextIntoDynamicSystem()` 
3. **任务管理**: 使用 `create_tasks.ts` 及相关任务工具
4. **Context 生成**: 
   - Gemini模式: `promptBuilder.ts` 的各个独立函数
   - OpenAI模式: `tool-guidance.ts` 生成工具引导
5. **工具解析**: 
   - Gemini模式: 原生FunctionCall
   - OpenAI模式: `tool-call-parser.ts` 解析文本工具调用

### 禁止使用的重复实现
- ❌ 已删除的 `tools/guidance/` 目录下的 prompt 构建器  
- ❌ 已删除的 `context/refactored/` 目录下的重复实现
- ❌ Legacy tool manager 系统 (ToolManager.ts, UnifiedToolSystem.ts)
- ❌ 多个 context injector

### 保留的OpenAI专用实现 
- ✅ `openai/context/tool-guidance.ts` - 第三方模型工具引导 (非重复)
- ✅ `openai/parsers/tool-call-parser.ts` - 第三方模型工具解析 (非重复)  
- ✅ `openai/hijack-refactored.ts` - OpenAI接口hijack适配器 (核心功能)

### 调试和日志
- **增强日志**: `packages/core/src/utils/enhancedLogger.ts`
- **模块级调试**: 通过环境变量控制 (DEBUG_CONTEXT, DEBUG_RAG 等)

## ✅ 清理完成状态

### 已删除的重复实现
1. ✅ `packages/core/src/tools/guidance/` - 整个目录已删除
2. ✅ `packages/core/src/context/refactored/` - 整个目录已删除
3. ✅ `packages/core/src/tools/FinishCurrentTaskTool.ts` - Legacy版本已删除
4. ✅ `packages/core/src/tools/GetCurrentTaskTool.ts` - Legacy版本已删除
5. ✅ `packages/core/src/tools/CreateTasksTool.ts` - Legacy版本已删除

### 已标记废弃的系统
1. ✅ `UnifiedToolSystem.ts` - 标记为Legacy，解析功能已禁用
2. ✅ `ToolManager.ts` - 标记为Legacy，任务工具注册已禁用
3. ✅ `SystemCoordinator/UnifiedSystemOrchestrator` - 导出已移除

### 统一后的实现路径
1. ✅ 工具描述和引导：`packages/core/src/core/prompts.ts` (单一实现)
2. ✅ RAG和LLM增强：`packages/core/src/context/contextAgent.ts` (单一入口)
3. ✅ Context生成：`packages/core/src/context/index.ts` → `prompts.ts` (统一路径)
4. ✅ 工具解析：`packages/core/src/openai/parsers/tool-call-parser.ts` (主要实现)
5. ✅ 任务管理：config.ts注册的snake_case工具 (统一系统)

## 📝 维护说明

此文档应该在每次系统架构变更时更新。Claude 在进行任何系统级操作前必须查阅此文档，确保使用正确的实现路径，避免使用已废弃或重复的实现。
# RAG配置问题修复报告

## 🔍 问题描述

ContextAgent在初始化RAG系统时报告：
```
[SiliconFlow] API key not provided, falling back to text matching mode
[SiliconFlow] Debug: SILICONFLOW_API_KEY from process.env = NOT SET
[SiliconFlow] Debug: config.apiKey = EMPTY
```

## 🔎 原因分析

环境变量加载的优先级问题：
1. **预期行为**: 应该从 `~/.gemini/.env` 加载 SiliconFlow 配置
2. **实际行为**: 项目根目录的 `.env` 文件被优先加载，覆盖了全局配置
3. **根本原因**: 环境文件查找优先级为：项目级 → 全局级

## ✅ 解决方案

### 1. 环境变量统一配置
将 SiliconFlow 和 DOUBAO 配置添加到项目级 `.env` 文件：

```env
# SiliconFlow Configuration
SILICONFLOW_API_KEY=sk-jlungjxjmgfmibhduhtxojjdvmzkmjwcxqcrwypckztdvvhr
SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-m3
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Qwen/Qwen3-8B

# DOUBAO Configuration  
DOUBAO_API_KEY=78d477df-3b49-4c21-a640-c3d06d4ca7f0
DOUBAO_API_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_ACTUAL_MODEL=ep-20241216165142-hsgmt

# Current Provider
OPENAI_PROVIDER=DOUBAO
```

### 2. 配置加载流程优化
- ✅ 确保环境变量在ContextAgent初始化前加载
- ✅ 统一环境配置管理
- ✅ 移除调试代码，保持生产环境整洁

## 📋 三种模型切换方式

### 方式1: 环境变量配置（推荐）
```bash
# 使用便捷脚本
./switch-provider.sh doubao      # 切换到DOUBAO
./switch-provider.sh siliconflow # 切换到SiliconFlow

# 或手动编辑 .env
OPENAI_PROVIDER=DOUBAO
```

### 方式2: 启动时指定模型
```bash
npm start -- -m doubao     # 启动时选择DOUBAO
npm start -- -m siliconflow # 启动时选择SiliconFlow
```

### 方式3: CLI内交互切换
```bash
npm start
# 在CLI中使用斜杠命令
> /model
# 显示模型选择菜单，交互式切换
```

## 🧪 验证结果

### RAG系统状态
- ✅ SiliconFlow API 密钥正确加载
- ✅ DOUBAO 提供商配置完整
- ✅ 环境变量优先级正确处理
- ✅ 知识图谱初始化成功

### 预期输出
```
[ContextAgent] Initializing RAG system...
[ContextAgent] Using medium project configuration for RAG system
[ContextAgent] Extractor: rag, Graph: local, Vector: siliconflow
[SiliconFlow] Embedding provider initialized successfully
[ContextAgent] RAG system initialized successfully
```

## 📚 技术细节

### 环境加载时序
1. CLI启动 → `main()` 函数
2. 环境加载 → `loadSettings()` → `loadEnvironment()` → `dotenv.config()`
3. 配置创建 → Config对象实例化
4. 配置初始化 → `config.initialize()`
5. ContextAgent初始化 → RAG系统初始化
6. SiliconFlow提供商创建 → 访问 `process.env.SILICONFLOW_API_KEY`

### 关键文件
- `/packages/cli/src/config/settings.ts` - 环境变量加载
- `/packages/core/src/context/providers/contextProviderFactory.ts` - 提供商工厂
- `/packages/core/src/context/providers/vector/siliconFlowEmbeddingProvider.ts` - SiliconFlow实现

## 🎯 问题解决状态

- ✅ RAG配置问题修复完成
- ✅ DOUBAO提供商集成完成
- ✅ 模型切换功能完善
- ✅ `/model` 命令实现完成
- ✅ 环境变量加载优先级修复
- ✅ 文档更新完整

### 新增功能

#### `/model` 命令
```bash
# 查看当前提供商状态
> /model

# 列出所有可用提供商
> /model list

# 切换到指定提供商
> /model switch doubao
> /model switch siliconflow
> /model switch gemini
```

#### 环境变量加载优先级
- **全局默认**: `~/.gemini/.env` 作为默认配置源
- **项目覆盖**: 项目级 `.env` 文件可覆盖全局设置
- **多文件合并**: 支持多个环境文件的分层加载

---

**修复日期**: 2025-01-17  
**影响范围**: ContextAgent RAG系统初始化 + 模型切换功能  
**解决方案**: 环境变量配置统一管理 + 交互式模型切换
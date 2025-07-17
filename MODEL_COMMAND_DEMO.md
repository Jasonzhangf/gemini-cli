# `/model` 命令功能演示 - 新架构

## 🎯 重新设计的命令结构

基于您的需求，`/model` 命令现在支持两个层级的管理：
- **提供商级别**: `/model provider` - 切换不同的AI服务提供商  
- **模型级别**: `/model switch` - 在当前提供商内切换不同模型

### 1. 主命令 `/model` - 当前状态概览

```bash
> /model
```

**输出**:
```
🤖 Current Model Status

📍 Provider: SiliconFlow
🎯 Model: Qwen/Qwen3-8B

💡 Available Commands:
  • `/model provider` - Switch to different provider
  • `/model switch` - Switch models in current provider
  • `/model list` - Show detailed information
```

### 2. 提供商管理 `/model provider` - 切换AI服务

```bash
> /model provider
```

**输出**:
```
🏢 Available Model Providers:

  • `/model provider siliconflow` - SiliconFlow 🟢 (current)
    SiliconFlow API (Qwen models)

  • `/model provider doubao` - DOUBAO 🟡 (switch to)
    Volcano Engine DOUBAO API

  • `/model provider gemini` - Gemini 🟡 (switch to)
    Google Gemini API

  • `/model provider lmstudio` - LM Studio 🔴 (not configured)
    Local LM Studio server
```

```bash
> /model provider doubao
```

**输出**:
```
✅ Switched to DOUBAO provider. Restart the CLI for changes to take effect.
```

### 3. 模型切换 `/model switch` - 当前提供商内的模型

```bash
> /model switch
```

**输出**:
```
🎯 Available Models in SILICONFLOW:

📍 Current: Qwen/Qwen3-8B

🔄 Switch to:
  • `/model switch Qwen/Qwen3-14B` - Qwen/Qwen3-14B
  • `/model switch Qwen/Qwen3-72B` - Qwen/Qwen3-72B
  • `/model switch deepseek-ai/deepseek-llm-67b-chat` - deepseek-ai/deepseek-llm-67b-chat
  • `/model switch internlm/internlm2_5-7b-chat` - internlm/internlm2_5-7b-chat
```

```bash
> /model switch Qwen/Qwen3-72B
```

**输出**:
```
✅ Switched to Qwen/Qwen3-72B model in SILICONFLOW provider. Restart CLI for changes to take effect.
```

### 4. 详细信息 `/model list` - 完整概览

```bash
> /model list
```

**输出**:
```
🤖 Model Management Overview

📍 Current Configuration:
  • Provider: SiliconFlow
  • Model: Qwen/Qwen3-72B

🏢 Available Providers:
  • SiliconFlow 🟢 (current)
  • DOUBAO 🟡 (available)
  • Gemini 🟡 (available)
  • LM Studio 🔴 (not configured)

🎯 Available Models in SiliconFlow:
  • Qwen/Qwen3-8B 🟡 (available)
  • Qwen/Qwen3-14B 🟡 (available)
  • Qwen/Qwen3-72B 🟢 (current)
  • deepseek-ai/deepseek-llm-67b-chat 🟡 (available)
  • internlm/internlm2_5-7b-chat 🟡 (available)

💡 Commands:
  • `/model provider <name>` - Switch provider
  • `/model switch <model>` - Switch model in current provider
```

## 🚀 智能功能

### Tab 补全支持

```bash
> /model <TAB>
# 显示: list, provider, switch

> /model provider <TAB>
# 显示可用的提供商: siliconflow, doubao, gemini, lmstudio

> /model switch <TAB>
# 显示当前提供商的可用模型，例如在SiliconFlow下:
# Qwen/Qwen3-14B, Qwen/Qwen3-72B, deepseek-ai/deepseek-llm-67b-chat...
```

### 错误处理

```bash
> /model provider unknown
```

**输出**:
```
❌ Unknown provider: unknown. Use `/model provider` to see available providers.
```

```bash
> /model provider lmstudio
```

**输出**:
```
❌ Provider LM Studio is not configured. Please check your environment variables.
```

```bash
> /model switch unknown-model
```

**输出**:
```
❌ Unknown model: unknown-model. Use `/model switch` to see available models.
```

### 智能状态检测

```bash
> /model provider siliconflow
```

**输出** (如果已经在使用SiliconFlow):
```
ℹ️ Already using SiliconFlow provider.
```

```bash
> /model switch Qwen/Qwen3-8B
```

**输出** (如果已经在使用该模型):
```
ℹ️ Already using Qwen/Qwen3-8B model.
```

## 🎯 设计理念

### 1. **双层架构**
- **提供商层** (`/model provider`): 管理不同的AI服务提供商
- **模型层** (`/model switch`): 在当前提供商内切换具体模型

### 2. **渐进式操作流程**
1. **初始化**: 系统默认读取 `~/.gemini/.env` 的 `OPENAI_PROVIDER`
2. **提供商切换**: 用 `/model provider` 选择AI服务  
3. **模型细调**: 用 `/model switch` 选择具体模型
4. **即时生效**: 重启CLI后新配置生效

### 3. **智能化体验**
- **上下文感知**: 根据当前提供商显示相应模型列表
- **状态指示**: 清晰的状态标识 (🟢当前 🟡可用 🔴未配置)
- **操作引导**: 每个命令都提供下一步操作建议
- **补全支持**: 全面的tab补全功能

### 4. **分层管理优势**
- **职责分离**: 提供商切换 vs 模型选择
- **配置清晰**: 避免混淆不同层级的设置
- **扩展性强**: 易于添加新提供商和新模型
- **用户友好**: 符合用户的心理模型

---

**更新日期**: 2025-01-17  
**功能状态**: ✅ 实现完成并测试通过
# DOUBAO Provider Integration

本文档说明如何在Gemini CLI中集成和使用火山引擎的DOUBAO模型提供商。

## 🚀 快速开始

### 1. 环境配置

在 `~/.gemini/.env` 文件中添加以下配置：

```env
# DOUBAO Provider Configuration
DOUBAO_API_KEY=your_doubao_api_key_here
DOUBAO_API_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3/chat/completions
DOUBAO_ACTUAL_MODEL=Doubao-Seed-1.6-flash

# Switch to DOUBAO provider
OPENAI_PROVIDER=DOUBAO
```

### 2. 切换提供商

有三种方式可以切换模型提供商：

#### 方式1: 环境变量配置（推荐）
```bash
# 使用便捷脚本
./switch-provider.sh doubao      # 切换到DOUBAO
./switch-provider.sh siliconflow # 切换到SiliconFlow
./switch-provider.sh             # 查看当前配置

# 或手动编辑 ~/.gemini/.env
OPENAI_PROVIDER=DOUBAO
```

#### 方式2: 启动时指定模型
```bash
npm start -- -m doubao     # 启动时选择DOUBAO
npm start -- -m siliconflow # 启动时选择SiliconFlow
```

#### 方式3: CLI内交互切换
```bash
npm start
# 在CLI中使用斜杠命令

# 查看当前状态和快速切换选项
> /model

# 查看所有提供商详细信息
> /model list

# 查看可切换的提供商
> /model switch

# 直接切换到指定提供商
> /model switch doubao
> /model switch siliconflow
```

### 3. 启动CLI

```bash
# 使用DOUBAO模式启动
npm start

# 或使用OpenAI兼容模式
npm start -- --openai
```

## 📋 支持的模型

基于火山引擎DOUBAO API文档，支持以下模型：

### 模型配置
- 使用您在DOUBAO控制台创建的推理接入点ID
- 格式通常为: `ep-yyyymmddhhmmss-xxxxx`
- 示例: `ep-20241216165142-hsgmt`

### 获取模型ID
1. 登录火山引擎控制台
2. 访问DOUBAO服务页面
3. 创建或查看推理接入点
4. 复制接入点ID作为模型名称

## 🔧 高级配置

### 完整环境变量列表

```env
# ==== DOUBAO Configuration ====
DOUBAO_API_KEY=your_api_key                                     # 必需：API密钥
DOUBAO_API_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3    # API端点
DOUBAO_ACTUAL_MODEL=ep-20241216165142-hsgmt                     # 推理接入点ID

# ==== Provider Selection ====
OPENAI_PROVIDER=DOUBAO                                          # 激活DOUBAO提供商

# ==== Optional Settings ====
OPENAI_TEMPERATURE=0.7                                          # 温度参数
OPENAI_MAX_TOKENS=4096                                          # 最大Token数
```

### 认证配置

1. **获取API密钥**：
   - 访问[火山引擎控制台](https://console.volcengine.com/)
   - 创建DOUBAO应用并获取API密钥

2. **配置端点**：
   - 默认端点：`https://ark.cn-beijing.volces.com/api/v3`
   - 完整聊天API：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`

## 🛠️ 功能特性

### OpenAI兼容性
- ✅ Chat Completions API
- ✅ 流式响应
- ✅ 工具调用（Function Calling）
- ✅ 多轮对话
- ✅ 系统提示词

### Gemini CLI集成
- ✅ ContextAgent支持
- ✅ 知识图谱集成
- ✅ RAG系统兼容
- ✅ 工具执行
- ✅ 历史记录管理

## 🔍 调试和故障排除

### 启用调试模式

```bash
DEBUG=1 npm start -- --openai
```

### 常见问题

1. **API密钥无效**
   ```
   ❌ Error: Invalid API key
   ```
   解决：检查 `DOUBAO_API_KEY` 是否正确设置

2. **端点不可达**
   ```
   ❌ Error: Connection timeout
   ```
   解决：检查网络连接和 `DOUBAO_API_ENDPOINT` 配置

3. **模型不支持**
   ```
   ❌ Error: Model not found
   ```
   解决：确认 `DOUBAO_ACTUAL_MODEL` 是支持的模型名称

### 配置验证

运行以下命令验证配置：

```bash
# 检查当前提供商
echo "Current provider: $(grep OPENAI_PROVIDER ~/.gemini/.env | cut -d'=' -f2)"

# 检查DOUBAO配置
grep "DOUBAO_" ~/.gemini/.env
```

## 📚 API参考

### DOUBAO特殊配置

DOUBAO API具有以下特点：

1. **认证方式**: Bearer Token
2. **请求格式**: OpenAI兼容
3. **响应格式**: 标准JSON + 流式
4. **工具调用**: 支持Function Calling

### 与SiliconFlow的差异

| 特性 | DOUBAO | SiliconFlow |
|------|--------|-------------|
| API格式 | OpenAI兼容 | OpenAI兼容 |
| 认证方式 | Bearer Token | Bearer Token |
| 工具调用 | ✅ 原生支持 | ✅ 原生支持 |
| 流式响应 | ✅ 支持 | ✅ 支持 |
| 视觉理解 | ✅ 部分模型 | ❌ 不支持 |
| 中文优化 | ✅ 优秀 | ✅ 良好 |

## 🚦 使用示例

### 基本聊天

```bash
# 启动DOUBAO模式
./switch-provider.sh doubao
npm start

# 在CLI中
> 你好！请介绍一下你自己
```

### 工具调用示例

```bash
# 文件操作
> 请创建一个Python脚本来计算斐波那契数列

# 代码分析
> 分析当前项目的架构，找出可以优化的地方
```

### 知识图谱查询

```bash
# 初始化项目知识图谱
> /init

# 基于项目上下文的查询
> 如何在这个项目中添加新的工具？
```

---

## 📝 更新日志

- **v1.0.0** - 初始DOUBAO集成
  - OpenAI兼容层支持
  - 基础聊天功能
  - 工具调用支持
  - 配置管理

---

> 💡 **提示**: 如需更多帮助，请查看[Gemini CLI文档](../index.md)或提交[Issue](https://github.com/google/gemini-cli/issues)。
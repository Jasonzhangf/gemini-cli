# CCR-Gemini: Claude Code Router for Gemini CLI

🤖 A clean, stable proxy system that allows you to use third-party AI providers (SHUAIHONG, DeepSeek, OpenAI, Claude, etc.) through the official Gemini CLI interface.

## 🌟 Key Features

- ✅ **Zero Code Modification**: Completely untouched official gemini-cli source code
- ✅ **Transparent Proxy**: User experience identical to official gemini-cli
- ✅ **Multi-Provider Support**: SHUAIHONG, DeepSeek, OpenAI, Claude, and more
- ✅ **Real-time API Translation**: Automatic conversion between different API formats
- ✅ **Flexible Configuration**: Easy provider and model switching via environment variables
- ✅ **Debug Friendly**: Built-in debug mode for troubleshooting

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装官方Gemini CLI
npm install -g @google/gemini-cli

# 安装代理服务依赖
cd proxy-service
npm install
```

### 2. 运行安装脚本

```bash
./setup-proxy.sh
```

### 3. 使用CCR-Gemini

```bash
# 基本用法 - 与官方gemini完全相同
./ccr-gemini -p "Hello, world!"

# 交互模式
./ccr-gemini

# 查看帮助
./ccr-gemini --help

# 启用调试模式
CCR_DEBUG=true ./ccr-gemini -p "Test message"
```

## ⚙️ 配置

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CCR_PROVIDER` | `shuaihong` | 目标提供者: shuaihong, deepseek, openai, claude |
| `CCR_API_KEY` | SHUAIHONG key | 目标提供者的API密钥 |
| `CCR_MODEL` | `gpt-4o` | 要使用的模型名称 |
| `CCR_BASE_URL` | `https://ai.shuaihong.fun/v1` | 提供者API基础URL |
| `CCR_PORT` | `3457` | 代理服务端口 |
| `CCR_HOST` | `localhost` | 代理服务主机 |
| `CCR_DEBUG` | `false` | 启用调试日志 |

### 配置示例

```bash
# 使用DeepSeek
export CCR_PROVIDER=deepseek
export CCR_API_KEY=your_deepseek_key
export CCR_MODEL=deepseek-chat

# 使用OpenAI
export CCR_PROVIDER=openai  
export CCR_API_KEY=your_openai_key
export CCR_MODEL=gpt-4

# 使用Claude
export CCR_PROVIDER=claude
export CCR_API_KEY=your_anthropic_key
export CCR_MODEL=claude-3-sonnet-20240229
```

## 🏗️ 系统架构

```
用户输入 → ccr-gemini → 代理服务 → 第三方API → 响应返回
    ↓            ↓           ↓            ↓
官方gemini  环境变量重定向  API格式转换  实际AI服务
```

### 工作原理

1. **ccr-gemini脚本**: 
   - 启动代理服务（如果未运行）
   - 设置环境变量重定向API请求
   - 调用官方gemini-cli

2. **代理服务**:
   - 监听本地端口3457
   - 接收来自gemini的API请求
   - 转换API格式（Gemini格式 ↔ OpenAI/Claude格式）
   - 转发到目标提供者
   - 转换响应格式并返回

3. **官方gemini-cli**:
   - 认为自己在与官方API通信
   - 正常显示结果给用户

## 📁 文件结构

```
├── ccr-gemini                    # 主要包装脚本
├── proxy-service/                # 代理服务目录
│   ├── src/
│   │   ├── server.js            # 主代理服务器
│   │   ├── config.js            # 配置管理
│   │   └── gemini-translator.js # API格式转换器
│   ├── package.json             # 依赖配置
│   └── .env.example             # 环境变量示例
├── setup-proxy.sh               # 安装脚本
└── test-proxy.js                # 测试脚本
```

## 🧪 测试

### 测试代理服务

```bash
node test-proxy.js
```

### 测试完整流程

```bash
# 基本功能测试
./ccr-gemini -p "介绍一下你自己"

# 调试模式测试
CCR_DEBUG=true ./ccr-gemini -p "测试消息"

# 交互模式测试
./ccr-gemini
```

## 🔧 故障排除

### 常见问题

1. **代理服务无法启动**
   ```bash
   # 检查端口是否被占用
   lsof -i :3457
   
   # 手动启动代理服务
   cd proxy-service && npm start
   ```

2. **API请求失败**
   ```bash
   # 检查API密钥是否正确
   curl -X POST http://localhost:3457/health
   
   # 启用调试模式查看详细日志
   CCR_DEBUG=true ./ccr-gemini -p "test"
   ```

3. **官方gemini找不到**
   ```bash
   # 确保已安装官方gemini-cli
   npm list -g @google/gemini-cli
   
   # 检查路径配置
   which gemini
   ```

### 调试技巧

- 使用 `CCR_DEBUG=true` 查看详细日志
- 检查代理服务健康状态: `curl http://localhost:3457/health`
- 查看代理服务日志: `cd proxy-service && npm start`

## 🎯 优势对比

### vs 直接修改源码
- ✅ 不会因官方更新而破坏
- ✅ 保持官方功能完整性
- ✅ 易于维护和升级

### vs 其他代理方案
- ✅ 零配置，开箱即用
- ✅ 完全透明，用户体验一致
- ✅ 支持多种API格式转换

## 📝 更新日志

### v1.0.0 (2025-01-20)
- ✨ 初始版本发布
- ✅ 支持SHUAIHONG、DeepSeek、OpenAI、Claude
- ✅ 完整的API格式转换
- ✅ 调试模式和健康检查
- ✅ 自动化安装脚本

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

---

**作者**: Jason Zhang  
**项目**: Enhanced CLI System with Proxy Architecture  
**日期**: 2025年1月20日
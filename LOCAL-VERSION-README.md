# 🚀 本地版本Gemini CLI使用指南

本地版本的Gemini CLI支持通过代理服务器连接到第三方AI提供商，并在界面上显示代理信息。

## ✨ 功能特性

- 🔄 **自动代理检测** - 实时检测本地代理服务器状态
- 🎨 **UI界面增强** - Footer显示代理端口、提供商和模型信息
- 🌍 **第三方模型支持** - 通过-m参数指定不同的AI模型
- ⚡ **一键安装** - 简化的构建和安装流程

## 📦 安装步骤

### 1. 一键构建和安装
```bash
# 完整构建和全局安装
./build-and-install.sh

# 或者简化安装（需要已有bundle）
./install-local-gemini.sh
```

### 2. 安装后的命令

安装完成后，您将获得以下命令：

- `gemini-local` - 本地CLI版本（手动启动代理）
- `gemini-proxy` - 自动启动代理的CLI版本
- `start-gemini-proxy` - 手动启动代理服务器
- `uninstall-gemini-local` - 卸载本地版本

## 🔧 配置设置

### 代理服务器配置
编辑 `~/.gemini-cli-router/.env`:

```bash
# SHUAIHONG Provider Configuration
GCR_PROVIDER=shuaihong
GCR_TARGET_API_KEY=your_api_key_here
GCR_BASE_URL=https://ai.shuaihong.fun/v1
GCR_MODEL=gpt-4o

# Server Configuration
GCR_PORT=3458
GCR_HOST=localhost

# Debug Mode
GCR_DEBUG=true
```

### 支持的提供商和模型

| 提供商 | 基础URL | 支持的模型 |
|--------|---------|------------|
| **SHUAIHONG** | `https://ai.shuaihong.fun/v1` | `gpt-4o`, `claude-3.5-sonnet`, `gemini-2.5-pro` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-coder` |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4`, `gpt-4o`, `gpt-3.5-turbo` |
| **Claude** | `https://api.anthropic.com/v1` | `claude-3.5-sonnet`, `claude-3-haiku` |

## 🚀 使用方法

### 基本用法
```bash
# 使用默认模型
gemini-local -p "Hello world"

# 指定第三方模型
gemini-local -m gpt-4o -p "用GPT-4o回答这个问题"

# 使用Claude模型
gemini-local -m claude-3.5-sonnet -p "帮我写一段代码"

# 自动启动代理模式
gemini-proxy -m deepseek-chat -p "使用DeepSeek回答"
```

### 交互模式
```bash
# 进入交互模式
gemini-local

# 进入交互模式并指定模型
gemini-local -m gpt-4o
```

## 🎨 界面功能

### Footer显示信息
当代理服务器运行时，CLI底部会显示：

```
🔄 Proxy:3458 | SHUAIHONG | gpt-4o
```

显示内容：
- `🔄 Proxy:3458` - 代理服务器端口
- `SHUAIHONG` - 当前AI提供商
- `gpt-4o` - 通过-m参数指定的模型

### 实时检测
- CLI每30秒自动检测代理服务器状态
- 代理启动/停止时UI会实时更新
- 无代理时显示原有的sandbox信息

## 🧪 测试功能

### 快速测试
```bash
# 运行UI测试
./quick-ui-test.sh

# 完整功能测试
./test-local-build-complete.sh
```

### 手动测试步骤

1. **启动代理服务器**
```bash
start-gemini-proxy
```

2. **验证代理状态**
```bash
curl http://127.0.0.1:3458/health
```

3. **测试不同模型**
```bash
gemini-local -m gpt-4o -p "测试GPT-4o"
gemini-local -m claude-3.5-sonnet -p "测试Claude"
gemini-local -m deepseek-chat -p "测试DeepSeek"
```

## 🔍 故障排除

### 1. 代理服务器无法启动
```bash
# 检查端口占用
lsof -i :3458

# 杀死占用进程
pkill -f "node src/server.js"

# 重新启动
start-gemini-proxy
```

### 2. CLI无法连接代理
- 确认代理服务器正在运行
- 检查 `~/.gemini-cli-router/.env` 配置
- 验证API密钥有效性

### 3. UI不显示代理信息
- 确认使用的是本地构建版本 `gemini-local`
- 检查代理服务器health端点是否正常
- 重启CLI让检测生效

## 📋 开发说明

### 主要修改文件
- `packages/cli/src/ui/components/Footer.tsx` - UI显示逻辑
- `packages/cli/src/ui/App.tsx` - 代理检测和状态管理  
- `packages/cli/src/config/config.ts` - 参数配置和描述
- `proxy-service/src/server.js` - 代理服务器增强

### 构建流程
1. 修改源码
2. 运行 `./build-and-install.sh`
3. 测试功能
4. 部署使用

## 🆘 获取帮助

如果遇到问题：
1. 查看代理服务器日志
2. 检查配置文件
3. 运行测试脚本诊断
4. 确认API密钥和网络连接

---

**作者**: Jason Zhang  
**版本**: 本地增强版  
**最后更新**: 2025-07-21
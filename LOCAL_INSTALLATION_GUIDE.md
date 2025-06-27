# 🚀 本地安装指南 - Gemini CLI with Hijack Feature

## 📋 概述

这是一个自定义版本的 Gemini CLI，包含了完整的 OpenAI 兼容模型劫持功能。它与官方版本完全独立，不会产生冲突。

### 🎯 主要特性
- ✅ **完整的模型劫持功能** - 可以将任何 Gemini 模型调用重定向到 OpenAI 兼容的 API
- ✅ **独立包名** - `@fanzhang/gemini-cli-hijack` 不与官方版本冲突
- ✅ **全局安装** - 可以在任意目录使用 `gemini` 命令
- ✅ **可配置目标模型** - 默认劫持 `gemini-2.5-flash`，可自定义任何模型
- ✅ **完整的 OpenAI API 支持** - 流式和非流式调用

## 🔧 安装方式

### 方式 1: 使用安装脚本 (推荐)

```bash
# 在项目根目录执行
./install-local.sh
```

### 方式 2: 手动安装

```bash
# 1. 卸载官方版本 (如果已安装)
npm uninstall -g @google/gemini-cli

# 2. 构建项目
npm run build

# 3. 全局安装
npm install -g .
```

## 📦 包信息

- **包名**: `@fanzhang/gemini-cli-hijack`
- **版本**: `0.1.5-hijack.1`
- **命令**: `gemini`
- **类型**: 符号链接到本地开发目录

## ✅ 验证安装

```bash
# 检查版本
gemini --version
# 应该显示: 0.1.5-hijack.1

# 检查包信息
npm list -g @fanzhang/gemini-cli-hijack
# 应该显示符号链接到本地目录

# 确认官方版本已移除
npm list -g @google/gemini-cli
# 应该显示: (empty)
```

## 🔧 配置劫持功能

创建 `~/.gemini/.env` 文件：

```bash
# 基本配置 (使用默认目标模型 gemini-2.5-flash)
HIJACK_ENABLED=true
HIJACK_PROVIDER=OPENAI_COMPATIBLE
HIJACK_ACTUAL_MODEL=your-model-name
HIJACK_API_KEY=your-api-key
HIJACK_API_ENDPOINT=http://your-endpoint/v1

# 可选：自定义目标模型
HIJACK_TARGET_MODEL=gemini-2.5-pro
```

## 🧪 测试功能

### 测试 1: 基本功能
```bash
gemini --version
```

### 测试 2: 劫持功能 (需要配置)
```bash
echo "hello" | gemini -m gemini-2.5-flash
```

预期输出包含劫持配置信息：
```
🔄 ===== MODEL HIJACK CONFIGURED ===== 🔄
🎯 Target Model: gemini-2.5-flash
✨ Configured To: your-model-name
🔗 Endpoint: http://your-endpoint/v1
🔑 Using API Key: ********...
✅ OpenAI compatible implementation active
🚀 Requests will be sent to configured endpoint
========================================
```

### 测试 3: 任意目录使用
```bash
cd /tmp
echo "test from any directory" | gemini -m gemini-2.5-flash
```

## 🗑️ 卸载

### 方式 1: 使用卸载脚本
```bash
./uninstall-local.sh
```

### 方式 2: 手动卸载
```bash
npm uninstall -g @fanzhang/gemini-cli-hijack
```

## 🔄 更新本地版本

当你修改了代码后：

```bash
# 重新构建和安装
npm run build
npm install -g .
```

或者使用脚本：
```bash
./install-local.sh
```

## 📊 与官方版本的区别

| 特性 | 官方版本 | 本地版本 |
|------|----------|----------|
| 包名 | `@google/gemini-cli` | `@fanzhang/gemini-cli-hijack` |
| 版本 | `0.x.x` | `0.1.5-hijack.1` |
| 模型劫持 | ❌ | ✅ |
| OpenAI 兼容 | ❌ | ✅ |
| 可配置目标模型 | ❌ | ✅ |
| 自定义功能 | ❌ | ✅ |

## 🔒 安全说明

- ✅ 本地版本使用独立的包名，不会与官方版本冲突
- ✅ 符号链接安装，便于开发和调试
- ✅ 可以随时切换回官方版本
- ✅ 配置文件独立，不影响其他工具

## 🐛 问题排查

### 问题 1: 命令不存在
```bash
# 检查全局安装
npm list -g @fanzhang/gemini-cli-hijack

# 重新安装
./install-local.sh
```

### 问题 2: 劫持不工作
```bash
# 检查配置文件
cat ~/.gemini/.env

# 确认环境变量
echo $HIJACK_ENABLED
```

### 问题 3: 版本冲突
```bash
# 确认当前版本
gemini --version

# 卸载所有版本并重新安装
npm uninstall -g @google/gemini-cli
npm uninstall -g @fanzhang/gemini-cli-hijack
./install-local.sh
```

## 📞 支持

如果遇到问题，请检查：
1. 是否在正确的项目目录运行安装脚本
2. Node.js 版本是否 >= 18.0.0
3. npm 权限是否正确
4. 配置文件格式是否正确

---

## 🎉 总结

现在你拥有了一个功能完整的 Gemini CLI，包含模型劫持功能，可以：

1. **在任意目录使用** `gemini` 命令
2. **透明劫持** Gemini 模型调用到 OpenAI 兼容 API
3. **完全独立** 于官方版本，避免冲突
4. **易于管理** 通过提供的脚本安装/卸载

开始使用您的定制版 Gemini CLI 吧！🚀
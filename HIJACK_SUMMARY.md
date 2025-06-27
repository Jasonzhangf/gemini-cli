# Gemini 2.5 Pro 模型劫持功能总结

## 🎯 功能概述
实现了对 `gemini-2.5-pro` 模型调用的自动劫持，透明地转换为用户配置的第三方 OpenAI 兼容 API 调用。

## 📁 配置文件
**位置**: `~/.gemini/.env`

```bash
# Gemini CLI 劫持配置
# 当调用 gemini-2.5-pro 时自动劫持到以下配置
HIJACK_ENABLED=true
HIJACK_TARGET_MODEL=gemini-2.5-pro
HIJACK_PROVIDER=OPENAI_COMPATIBLE
HIJACK_ACTUAL_MODEL=blacktooth-ab-test
HIJACK_API_KEY=1234567890
HIJACK_API_ENDPOINT=http://127.0.0.1:2048/v1
```

## 👁️ 用户可见的提示

### 1. 启动界面提示
当用户启动 `gemini-cli` 时，会在 ASCII 艺术图下方看到：

```
╭─────────────────────────────────────────────╮
│ 🔄 Model Hijack Active                     │
│ 📍 gemini-2.5-pro → blacktooth-ab-test     │
│ 🔗 Endpoint: http://127.0.0.1:2048/v1      │
│ ✅ Configuration loaded from ~/.gemini/.env │
╰─────────────────────────────────────────────╯
```

### 2. 模型调用时提示
当实际调用 `gemini-2.5-pro` 模型时，控制台会显示：

```
🎉 ===== MODEL HIJACK SUCCESSFUL ===== 🎉
🎯 Original Model: gemini-2.5-pro
✨ Hijacked To: blacktooth-ab-test
🔗 Endpoint: http://127.0.0.1:2048/v1
🔑 Using API Key: 12345678...
🛡️ Request will be transparently redirected
========================================
```

## 🔧 技术实现

### 核心文件修改
1. **packages/core/src/core/contentGenerator.ts**
   - 添加 `loadHijackConfigFromEnv()` 从环境变量读取配置
   - 添加 `getHijackInfo()` 为启动界面提供信息
   - 在 `createContentGeneratorConfig()` 中实现劫持逻辑

2. **packages/core/src/core/openaiCompatibleContentGenerator.ts**
   - 新建 OpenAI 兼容的内容生成器
   - 支持普通和流式内容生成

3. **packages/cli/src/ui/components/Tips.tsx**
   - 添加启动界面的劫持配置提示框

### 工作流程
1. 用户执行: `gemini-cli -m gemini-2.5-pro`
2. 启动界面显示劫持配置状态
3. 系统加载 `~/.gemini/.env` 环境变量
4. 检测到 `gemini-2.5-pro` 匹配劫持规则
5. 显示详细的劫持成功消息
6. 自动切换到 OpenAI 兼容认证模式
7. 使用 `blacktooth-ab-test` 模型调用本地端点
8. 对上层应用完全透明

## 📋 使用说明

1. **配置劫持**:
   - 创建 `~/.gemini/.env` 文件
   - 设置相应的环境变量

2. **启用劫持**:
   - 确保 `HIJACK_ENABLED=true`
   - 配置目标模型和实际模型

3. **查看状态**:
   - 启动时在 Tips 区域查看配置状态
   - 调用时在控制台查看劫持消息

4. **测试功能**:
   ```bash
   gemini-cli -m gemini-2.5-pro
   ```

## 🧪 测试脚本
- `test-env-hijack.cjs` - 测试环境变量配置
- `demo-startup-hijack.cjs` - 演示启动界面
- `demo-hijack-message.cjs` - 演示劫持消息

现在用户可以在两个位置清楚地看到劫持配置状态：启动界面和实际调用时！
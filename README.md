# Gemini CLI - 模型劫持功能

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

## 模型劫持功能 (Model Hijacking Feature)

Gemini CLI 支持模型劫持功能，允许您将特定的模型调用透明地重定向到用户配置的 OpenAI 兼容 API。此功能对于 A/B 测试、使用替代模型或与自定义模型端点集成非常有用。

### 配置 (Configuration)

在 `~/.gemini/.env` (或您项目中的 `.gemini/.env` 目录) 创建配置文件：

```bash
# Gemini CLI 劫持配置
# 当调用目标模型时自动劫持到以下配置
HIJACK_ENABLED=true
# 可选：指定要劫持的模型，默认为 gemini-2.5-flash
HIJACK_TARGET_MODEL=gemini-2.5-flash
HIJACK_PROVIDER=OPENAI_COMPATIBLE
HIJACK_ACTUAL_MODEL=blacktooth-ab-test
HIJACK_API_KEY=your-api-key-here
HIJACK_API_ENDPOINT=http://127.0.0.1:2048/v1
```

### 配置参数 (Configuration Parameters)

- `HIJACK_ENABLED`: 设置为 `true` 以启用模型劫持。
- `HIJACK_TARGET_MODEL`: 要拦截的原始模型名称 (可选，默认为 `gemini-2.5-flash`)。
- `HIJACK_PROVIDER`: 对于 OpenAI 兼容 API，设置为 `OPENAI_COMPATIBLE`。
- `HIJACK_ACTUAL_MODEL`: 实际要使用的目标模型名称。
- `HIJACK_API_KEY`: 目标端点的 API 密钥。
- `HIJACK_API_ENDPOINT`: OpenAI 兼容 API 端点的基本 URL。

### 使用方法 (Usage)

配置完成后，劫持对您的工作流程是完全透明的：

```bash
# 这将根据您的配置自动重定向
gemini -m gemini-2.5-flash

# 或者指定任何已配置的目标模型
gemini -m gemini-2.5-pro  # 如果 HIJACK_TARGET_MODEL=gemini-2.5-pro
```

### 视觉指示 (Visual Indicators)

当劫持激活时，您将看到：

1. **CLI 界面中的启动通知**:

   ```
   ╭─────────────────────────────────────────────╮
   │ 🔄 Model Hijack Active                     │
   │ 📍 gemini-2.5-flash → blacktooth-ab-test   │
   │ 🔗 Endpoint: http://127.0.0.1:2048/v1      │
   │ ✅ Configuration loaded from ~/.gemini/.env │
   ╰─────────────────────────────────────────────╯
   ```

2. **调用目标模型时的通知**:
   ```
   🔄 ===== MODEL HIJACK CONFIGURED ===== 🔄
   🎯 Target Model: gemini-2.5-flash
   ✨ Configured To: blacktooth-ab-test
   🔗 Endpoint: http://127.0.0.1:2048/v1
   🔑 Using API Key: 12345678...
   ✅ OpenAI compatible implementation active
   🚀 Requests will be sent to configured endpoint
   ========================================
   ```

### 环境变量文件优先级 (Environment File Priority)

CLI 按以下顺序搜索 `.env` 文件：

1. 当前工作目录: `./gemini/.env`
2. 项目根目录: `./.env`
3. 父目录 (向上遍历)
4. 用户家目录: `~/.gemini/.env`
5. 用户家目录: `~/.env`

### 故障排除 (Troubleshooting)

如果您遇到问题，请查阅 [故障排除指南](docs/troubleshooting.md)。

## 本地安装与劫持功能 (Local Installation with Hijack Feature)

此仓库包含一个带有 OpenAI 兼容模型劫持功能的自定义版本。

### 安装 (Installation)

要安装本地版本，请运行以下命令：

```bash
# 快速安装
./install-local.sh

# 手动安装
npm run build
npm install -g .
```

有关详细说明，请参阅 [LOCAL_INSTALLATION_GUIDE.md](./LOCAL_INSTALLATION_GUIDE.md)。

### 卸载 (Uninstallation)

要卸载本地版本，请运行以下命令：

```bash
./uninstall-local.sh
```

此脚本将移除 `@fanzhang/gemini-cli-hijack` 包。卸载后，您可以选择安装官方的 Gemini CLI。

### 包信息 (Package Information)

- **本地包**: `@fanzhang/gemini-cli-hijack`
- **版本**: `0.1.5-hijack.1`
- **特性**: 模型劫持、OpenAI 兼容性、可配置目标

## 服务条款和隐私声明 (Terms of Service and Privacy Notice)

有关适用于您使用 Gemini CLI 的服务条款和隐私声明的详细信息，请参阅 [服务条款和隐私声明](./docs/tos-privacy.md)。

## 贡献 (Contributing)

有关如何为 Gemini CLI 做出贡献的详细信息，请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证 (License)

本项目根据 [Apache 2.0 许可证](./LICENSE) 的条款获得许可。有关更多信息，请参阅 `LICENSE`。

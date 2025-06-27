# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

## Model Hijacking Feature

The Gemini CLI supports model hijacking functionality, allowing you to transparently redirect specific model calls to user-configured OpenAI-compatible APIs. This feature is particularly useful for A/B testing, using alternative models, or integrating with custom model endpoints.

### Configuration

Create a configuration file at `~/.gemini/.env` (or in your project's `.gemini/.env` directory):

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

### Configuration Parameters

- `HIJACK_ENABLED`: Set to `true` to enable model hijacking
- `HIJACK_TARGET_MODEL`: The original model name to intercept (optional, defaults to `gemini-2.5-flash`)
- `HIJACK_PROVIDER`: Set to `OPENAI_COMPATIBLE` for OpenAI-compatible APIs
- `HIJACK_ACTUAL_MODEL`: The target model name to use instead
- `HIJACK_API_KEY`: API key for the target endpoint
- `HIJACK_API_ENDPOINT`: Base URL for the OpenAI-compatible API endpoint

### Usage

Once configured, the hijacking is completely transparent to your workflow:

```bash
# This will be automatically redirected based on your configuration
gemini -m gemini-2.5-flash

# Or specify any configured target model
gemini -m gemini-2.5-pro  # if HIJACK_TARGET_MODEL=gemini-2.5-pro
```

### Visual Indicators

When hijacking is active, you'll see:

1. **Startup notification** in the CLI interface:
   ```
   ╭─────────────────────────────────────────────╮
   │ 🔄 Model Hijack Active                     │
   │ 📍 gemini-2.5-flash → blacktooth-ab-test   │
   │ 🔗 Endpoint: http://127.0.0.1:2048/v1      │
   │ ✅ Configuration loaded from ~/.gemini/.env │
   ╰─────────────────────────────────────────────╯
   ```

2. **Model call notification** when the target model is invoked:
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

### Environment File Priority

The CLI searches for `.env` files in the following order:
1. Current working directory: `./gemini/.env`
2. Project root: `./.env`
3. Parent directories (traversing upward)
4. Home directory: `~/.gemini/.env`
5. Home directory: `~/.env`

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Gemini CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).


## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to contribute to the Gemini CLI.

## License

This project is licensed under the terms of the [Apache 2.0 license](./LICENSE). See `LICENSE` for more information.
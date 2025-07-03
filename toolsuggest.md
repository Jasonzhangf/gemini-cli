# Gemini CLI Hijack Tool: 改进与适应性增强方案

当前 Gemini CLI 中的“劫持 (Hijack)”机制主要通过环境变量（如 `HIJACK_ENABLED`, `HIJACK_TARGET_MODEL`, `HIJACK_PROVIDER`, `HIJACK_ACTUAL_MODEL`, `HIJACK_API_KEY`, `HIJACK_API_ENDPOINT`）和 `.gemini/.env` 文件来配置和激活。通过 `demo-startup-hijack.cjs`, `demo-hijack-message.cjs`, `test-env-hijack.cjs` 可以看出，这种方式能够实现模型请求的重定向，并提供启动和成功提示信息。

**当前方式的分析：**

*   **优点**：
    *   简单直接：通过环境变量设置，易于在命令行或脚本中快速启用。
    *   环境隔离：`.env` 文件允许在不同开发环境中配置不同的劫持目标。
    *   透明性：在启动时和劫持成功时提供清晰的控制台输出，告知用户劫持状态。

*   **局限性**：
    *   **灵活性受限**：难以管理多个不同的劫持场景。如果用户想在不同项目或不同任务中切换不同的后端模型或端点，需要手动修改环境变量或 `.env` 文件，操作繁琐且容易出错。
    *   **配置冗余**：对于多个需要劫持的模型，每个劫持都需要一组独立的环境变量。
    *   **可发现性差**：用户可能不知道有哪些模型可以被劫持，或者有哪些可用的劫持配置。
    *   **安全性考量**：`HIJACK_API_KEY` 直接存储在 `.env` 文件中，虽然对于本地开发环境常见，但如果考虑到更广泛的分享或自动化场景，可能不够安全。
    *   **硬编码信息**：`demo-startup-hijack.cjs` 和 `demo-hijack-message.cjs` 中的显示信息是硬编码的，不易定制或翻译。

## 更好的或适应性更强的方案建议：

为了提高劫持机制的灵活性、可用性和安全性，可以考虑以下改进方案：

### 1. 引入结构化配置管理 (JSON/YAML)

除了 `.env` 文件，引入一个结构化、可扩展的配置文件（例如 `~/.gemini/hijack-profiles.json` 或 `~/.gemini/config.yaml`）来管理劫持配置。

*   **多配置文件支持**：允许用户定义多个具名的劫持配置文件（Profile）。
    ```json
    // ~/.gemini/hijack-profiles.json 示例
    {
      "activeProfile": "local-llm-dev",
      "profiles": {
        "local-llm-dev": {
          "targetModel": "gemini-2.5-pro",
          "actualModel": "my-local-model",
          "provider": "OPENAI_COMPATIBLE",
          "endpoint": "http://127.0.0.1:2048/v1",
          "apiKeyRef": "local-llm-key" // 引用安全存储的密钥
        },
        "test-ab": {
          "targetModel": "gemini-1.5-flash",
          "actualModel": "experiment-model-A",
          "provider": "GEMINI",
          "endpoint": "https://api.example.com/v2",
          "apiKeyRef": "gemini-prod-key"
        }
      }
    }
    ```
*   **命令行激活**：通过 CLI 命令方便地切换或管理这些 Profile。
    *   `gemini-cli config hijack list`: 列出所有可用的劫持 Profile。
    *   `gemini-cli config hijack use <profile-name>`: 激活一个指定的 Profile。
    *   `gemini-cli config hijack add`: 交互式地添加新的 Profile。
    *   `gemini-cli config hijack disable`: 禁用所有劫持。
    *   `gemini-cli --hijack-profile <profile-name> ...`: 在单次执行中临时指定 Profile。

### 2. 增强环境变量与配置文件的交互

*   **优先级机制**：确保环境变量的优先级高于配置文件。例如，如果 `HIJACK_TARGET_MODEL` 环境变量被设置，它将覆盖配置文件中的 `targetModel`。这允许临时覆盖。
*   **动态加载**：CLI 启动时，首先加载全局或用户目录下的配置文件，然后检查并应用环境变量覆盖。

### 3. 引入更安全的密钥管理

直接在 `.env` 或配置文件中存储 API Key 存在一定的安全风险。可以考虑以下方式：

*   **操作系统密钥管理工具集成**：
    *   **macOS**: Keychain Access
    *   **Linux**: Secret Service (通过 `keyrings` 库)
    *   **Windows**: Credential Manager
    允许用户将 API Key 存储在这些安全的系统级存储中，并在配置中通过引用名称来获取。
*   **交互式输入**：对于敏感操作，如果密钥不在安全存储中，可以提示用户在运行时输入密钥（避免写入文件）。
*   **加密存储 (可选)**：对于非常敏感的场景，可以考虑对配置文件中的密钥进行加密存储，但在实际应用中通常复杂性较高。

### 4. 动态且可扩展的劫持逻辑

*   **模块化劫持插件**：将不同 `HIJACK_PROVIDER` 的逻辑抽象为可插拔的模块或类。例如，`OpenAICompatibleProvider`, `GeminiProvider` 等。这使得添加新的 LLM 提供商变得容易，而无需修改核心逻辑。
*   **上下文感知劫持**：允许劫持配置基于当前工作目录、项目名称或特定命令参数等上下文信息进行。例如，只在 `/my-project/llm-dev` 目录下运行时劫持特定模型。
    *   在配置文件中增加 `context` 字段，例如 `"context": {"cwd": "/path/to/project"}`。

### 5. 改进用户反馈和调试

*   **可定制的劫持通知**：将劫持成功、失败或激活的提示信息定义为可配置的模板（例如，使用 EJS 或 Mustache 模板引擎），允许用户或管理员根据需求定制显示内容和语言。
*   **详细的日志记录**：增加详细的调试日志模式（例如，`--debug-hijack` 选项），输出劫持决策过程、请求和响应的重定向信息，这对于问题排查至关重要。
*   **劫持状态命令**：`gemini-cli status --hijack` 可以显示当前激活的劫持 Profile 及其详细信息。

### 6. 考虑 Web UI/GUI 配置界面 (长期展望)

对于非开发者用户或追求更直观体验的用户，一个基于 Web 或本地 GUI 的配置界面将极大地简化劫持管理，可视化展示当前劫持状态，并提供点击式切换功能。

## 总结

核心思想是将单一的环境变量配置方式升级为更强大、更灵活的**结构化配置管理体系**。通过引入具名 Profile、支持多种加载方式、强化安全性以及提供更精细的控制和反馈机制，可以显著提升 Gemini CLI 劫持工具的可用性、适应性和可维护性。最直接的下一步是实现基于 JSON/YAML 的配置文件管理和相应的 CLI 命令。
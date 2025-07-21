# Gemini CLI Router 项目设计文档

## 1. 项目概述

本项目名为 "Gemini CLI Router" (GCR)，是一个为 Google Gemini CLI 工具设计的本地代理系统。其核心功能是拦截官方 Gemini CLI 发出的 API 请求，将其无缝路由到第三方 AI 服务提供商（如 SHUAIHONG, DeepSeek, OpenAI, Claude 等）。

该项目最大的特点是**零修改**，用户无需改动官方 `@google/gemini-cli` 的任何代码，即可通过本工具将请求转发，从而使用其他厂商的 AI 模型。

## 2. 核心组件分析

### 2.1. `gcr-gemini` (主执行文件)

这是用户直接交互的命令行工具，作为官方 `gemini` 命令的替代品。它是一个 Node.js 脚本，主要职责如下：

- **加载配置**: 从 `~/.gemini-cli-router/.env` 文件中读取用户配置，如代理端口、目标 AI 提供商、API 密钥等。
- **参数解析**: 解析命令行参数，特别是 `-m` 或 `--model` 参数，以实现模型的动态切换。
- **启动与管理代理服务**: 检查本地代理服务 (`proxy-service`) 是否正在运行。如果没有，则自动在后台启动该服务。
- **设置环境变量**: 在执行真正的 `gemini` 命令之前，动态设置 `GEMINI_API_BASE_URL` 环境变量，将其指向本地代理服务的地址。这是实现请求拦截的关键。
- **执行命令**: 调用系统中的官方 `gemini` 命令，并传入所有用户参数。

### 2.2. `proxy-service/` (核心代理服务)

这是一个基于 Node.js 和 Express 构建的 HTTP 代理服务器，是整个系统的核心。

- **`src/server.js`**: 代理服务的入口。它启动一个 Express 服务器，监听指定端口（默认为 3458），并定义了多个路由来处理来自 Gemini CLI 的请求。
- **`src/gemini-translator.js`**: API 格式转换器。这是实现与第三方服务兼容的核心逻辑。
    - `translateRequest`: 将 Gemini API 的请求体格式（`contents`, `systemInstruction` 等）转换为第三方 API（如 OpenAI/Claude）所接受的 `messages` 格式。
    - `translateResponse`: 将第三方 API 的响应体格式转换回 Gemini API 所期望的格式（`candidates`, `usageMetadata` 等）。
- **`src/config.js`**: 服务端配置文件。它从环境变量中读取配置，定义了服务端口、支持的 AI 提供商列表及其 `baseUrl`、默认模型等信息。
- **路由**:
    - `/health`: 健康检查端点，用于 `gcr-gemini` 脚本判断服务是否已成功启动。
    - `/v1beta/models/:model/generateContent`: 拦截 Gemini CLI 的主要 API 请求。
    - `/v1internal*`: 拦截 Gemini CLI 的内部流式请求。
    - `/chat/completions`: 为了兼容某些本身就使用 OpenAI 格式的第三方服务而设立的直通端点。

### 2.3. 安装与配置脚本

- **`package.json`**: 项目的 NPM 配置文件。
    - `bin`: 将 `gcr` 命令链接到 `gcr-gemini` 脚本，使其成为全局可执行命令。
    - `scripts`: 定义了 `postinstall` 和 `preuninstall` 脚本，分别在安装后和卸载前执行 `setup-post-install.js` 和 `cleanup-pre-uninstall.js`，用于处理环境设置和清理工作。
    - `files`: 定义了发布到 NPM 时需要包含的所有文件。
- **`install-gcr.sh` / `install-gcr-simple.sh`**: (备用) 手动安装脚本。
- **`setup-post-install.js`**: 在 `npm install -g` 之后自动运行。它的主要任务是创建配置文件目录 `~/.gemini-cli-router` 和一个默认的 `.env` 配置文件模板，引导用户进行配置。
- **`cleanup-pre-uninstall.js`**: 在 `npm uninstall -g` 之前自动运行。负责清理配置文件和停止后台代理服务。

## 3. 工作流程

1.  **安装**: 用户通过 `npm install -g gemini-cli-router` 安装。NPM 会自动将 `gcr` 命令链接到全局，并执行 `setup-post-install.js` 创建配置文件。
2.  **配置**: 用户编辑 `~/.gemini-cli-router/.env` 文件，填入要使用的第三方 AI 提供商的 `GCR_PROVIDER`、`GCR_TARGET_API_KEY` 等信息。
3.  **执行命令**: 用户在终端运行 `gcr chat "some prompt"`。
4.  **启动代理**: `gcr-gemini` 脚本首先检查 `http://localhost:3458/health`。如果代理未运行，它会启动 `proxy-service` 进程。
5.  **请求拦截**: `gcr-gemini` 脚本设置 `GEMINI_API_BASE_URL=http://localhost:3458` 环境变量，然后执行官方的 `gemini` 命令。
6.  **请求转发**: 官方 `gemini` CLI 将 API 请求发送到 `http://localhost:3458` 而不是 Google 的服务器。
7.  **API 转换**:
    - `proxy-service` 收到请求，`gemini-translator.js` 将其转换为目标 AI 提供商的 API 格式。
    - `proxy-service` 将转换后的请求发送到用户配置的第三方 API 端点（例如 `https://ai.shuaihong.fun/v1`）。
8.  **响应转换**:
    - `proxy-service` 收到第三方 API 的响应。
    - `gemini-translator.js` 将响应转换回 Gemini CLI 能够理解的格式。
9.  **返回响应**: `proxy-service` 将转换后的响应返回给官方 `gemini` CLI，最终显示给用户。

## 4. 设计目的与优势

- **非侵入式**: 无需修改官方工具，保证了稳定性和未来的兼容性。
- **灵活性**: 通过简单的配置即可切换不同的 AI 提供商和模型。
- **易用性**: 封装了复杂的代理和转换逻辑，用户体验与使用官方 CLI 基本一致。
- **隐私性**: 用户的 API 密钥等敏感信息仅存储在本地配置文件中，不会上传到任何其他地方。
- **可扩展性**: `config.js` 和 `gemini-translator.js` 的设计使得添加新的 AI 提供商变得相对容易。

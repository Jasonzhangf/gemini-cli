# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

This repository contains the Gemini CLI, a command-line AI workflow tool that connects to your
tools, understands your code and accelerates your workflows.

With the Gemini CLI you can:

- Query and edit large codebases in and beyond Gemini's 1M token context window.
- Generate new apps from PDFs or sketches, using Gemini's multimodal capabilities.
- Automate operational tasks, like querying pull requests or handling complex rebases.
- Use tools and MCP servers to connect new capabilities, including [media generation with Imagen,
  Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Ground your queries with the [Google Search](https://ai.google.dev/gemini-api/docs/grounding)
  tool, built in to Gemini.

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 18](https://nodejs.org/en/download) or higher installed.
2. **Run the CLI:** Execute the following command in your terminal:

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

   Or install it with:

   ```bash
   npm install -g @google/gemini-cli
   gemini
   ```

3. **Pick a color theme**
4. **Authenticate:** When prompted, sign in with your personal Google account. This will grant you up to 60 model requests per minute and 1,000 model requests per day using Gemini.

You are now ready to use the Gemini CLI!

### For advanced use or increased limits:

If you need to use a specific model or require a higher request capacity, you can use an API key:

1. Generate a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key.

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

For other authentication methods, including Google Workspace accounts, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once the CLI is running, you can start interacting with Gemini from your shell.

You can start a project from a new directory:

```sh
cd new-project/
gemini
> Write me a Gemini Discord bot that answers questions using a FAQ.md file I will provide
```

Or work with an existing project:

```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> Give me a summary of all of the changes that went in yesterday
```

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

## Model Hijacking Feature

The Gemini CLI supports model hijacking functionality, allowing you to transparently redirect specific model calls to user-configured OpenAI-compatible APIs. This feature is particularly useful for A/B testing, using alternative models, or integrating with custom model endpoints.

### Configuration

Create a configuration file at `~/.gemini/.env` (or in your project's `.gemini/.env` directory):

```bash
# Gemini CLI 劫持配置
# 当调用 gemini-2.5-pro 时自动劫持到以下配置
HIJACK_ENABLED=true
HIJACK_TARGET_MODEL=gemini-2.5-pro
HIJACK_PROVIDER=OPENAI_COMPATIBLE
HIJACK_ACTUAL_MODEL=blacktooth-ab-test
HIJACK_API_KEY=your-api-key-here
HIJACK_API_ENDPOINT=http://127.0.0.1:2048/v1
```

### Configuration Parameters

- `HIJACK_ENABLED`: Set to `true` to enable model hijacking
- `HIJACK_TARGET_MODEL`: The original model name to intercept (e.g., `gemini-2.5-pro`)
- `HIJACK_PROVIDER`: Set to `OPENAI_COMPATIBLE` for OpenAI-compatible APIs
- `HIJACK_ACTUAL_MODEL`: The target model name to use instead
- `HIJACK_API_KEY`: API key for the target endpoint
- `HIJACK_API_ENDPOINT`: Base URL for the OpenAI-compatible API endpoint

### Usage

Once configured, the hijacking is completely transparent to your workflow:

```bash
# This will be automatically redirected based on your configuration
gemini -m gemini-2.5-pro
```

### Visual Indicators

When hijacking is active, you'll see:

1. **Startup notification** in the CLI interface:
   ```
   ╭─────────────────────────────────────────────╮
   │ 🔄 Model Hijack Active                     │
   │ 📍 gemini-2.5-pro → blacktooth-ab-test     │
   │ 🔗 Endpoint: http://127.0.0.1:2048/v1      │
   │ ✅ Configuration loaded from ~/.gemini/.env │
   ╰─────────────────────────────────────────────╯
   ```

2. **Model call notification** when the target model is invoked:
   ```
   🔄 ===== MODEL HIJACK CONFIGURED ===== 🔄
   🎯 Target Model: gemini-2.5-pro
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

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `gemini`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Use MCP servers to integrate your local system tools with your enterprise collaboration suite.

```text
> Make me a slide deck showing the git history from the last 7 days, grouped by feature and team member.
```

```text
> Make a full-screen web app for a wall display to show our most interacted-with GitHub issues.
```

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organise my PDF invoices by month of expenditure.
```

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Gemini CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).

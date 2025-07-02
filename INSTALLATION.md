# Gemini CLI with Model Hijacking - Installation Guide

## Overview

Gemini CLI with Model Hijacking capabilities allows you to use any OpenAI-compatible API endpoint while maintaining the familiar Gemini CLI interface. This enables you to:

- **Transparently redirect** model calls to local LLM servers (LM Studio, Ollama, etc.)
- **Multiple provider support** with easy switching between different API endpoints
- **Full tool execution** with JSON-guided workflow and function call support
- **Model capability adaptation** for different model types and capabilities

## Prerequisites

- **Node.js 18+** (recommended: Node.js 20 or later)
- **npm** or **yarn** package manager

## Installation Methods

### Method 1: Global Installation (Recommended)

Install globally to use the `gemini` command anywhere:

```bash
# Clone the repository
git clone https://github.com/fanzhang/gemini-cli.git
cd gemini-cli

# Install dependencies and build
npm install
npm run build:release

# Install globally
npm install -g .
```

### Method 2: Local Installation

For development or local use:

```bash
# Clone and build
git clone https://github.com/fanzhang/gemini-cli.git
cd gemini-cli
npm install
npm run build:release

# Use local installation script
./install-local.sh
```

### Method 3: Direct npm Installation (When Published)

```bash
# This will be available when published to npm
npm install -g @fanzhang/gemini-cli-hijack
```

## Configuration

### 1. Basic Setup

Create configuration directory:
```bash
mkdir -p ~/.gemini
```

### 2. API Key Configuration

For standard Gemini API usage:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Model Hijacking Configuration

Create `~/.gemini/.env` file for hijacking configuration:

```bash
# ~/.gemini/.env

# Enable hijacking
HIJACK_ENABLED=true

# Primary provider configuration (LM Studio example)
HIJACK_API_ENDPOINT=http://localhost:1234/v1
HIJACK_ACTUAL_MODEL=your-local-model-name
HIJACK_API_KEY=lm-studio
HIJACK_TARGET_MODEL=gemini-2.5-flash
HIJACK_PROVIDER=lmstudio

# Secondary provider configuration (backup server)
BACK_API_ENDPOINT=http://127.0.0.1:2048/v1
BACK_ACTUAL_MODEL=gemini-2.5-pro
BACK_API_KEY=backup-api-key
BACK_TARGET_MODEL=gemini-2.5-flash

# Set active provider
HIJACK_ACTIVE_PROVIDER=HIJACK
```

### 4. Provider Switching

Create a provider switching script:

```bash
# ~/.gemini/switch-provider.sh
#!/bin/bash

if [ -z "$1" ]; then
    echo "Available providers:"
    grep "_API_ENDPOINT" ~/.gemini/.env | cut -d'_' -f1 | sort -u
    echo "Usage: $0 <PROVIDER_NAME>"
    exit 1
fi

PROVIDER=$1
sed -i.bak "s/HIJACK_ACTIVE_PROVIDER=.*/HIJACK_ACTIVE_PROVIDER=$PROVIDER/" ~/.gemini/.env
echo "Switched to provider: $PROVIDER"
```

Make it executable:
```bash
chmod +x ~/.gemini/switch-provider.sh
```

## Usage Examples

### Basic Usage

```bash
# Standard chat
gemini -p "Hello, how are you?"

# With specific model (will be hijacked if configured)
gemini -m gemini-2.5-flash -p "Analyze this code"

# With actual model override
gemini --actual-model custom-model-name -p "Test with specific model"

# YOLO mode (auto-approve tool execution)
gemini --yolo -p "Create a file called test.txt with hello world"
```

### Provider Management

```bash
# Switch to backup provider
~/.gemini/switch-provider.sh BACK

# Switch back to primary
~/.gemini/switch-provider.sh HIJACK

# List available providers
~/.gemini/switch-provider.sh
```

### Advanced Usage

```bash
# File operations
gemini --yolo -p "Organize files in ./documents by type"

# Code analysis
gemini -p "Read the main.py file and explain what it does"

# Multi-step tasks
gemini --yolo -p "Create a Python script that reads CSV and generates a report"
```

## Architecture Features

### Model Hijacking System

- **Transparent Redirection**: Users specify `gemini-2.5-flash`, system redirects to your configured endpoint
- **Multiple Providers**: Support unlimited API providers with easy switching
- **Display vs Actual**: What users see vs what actually executes are separate

### Tool Execution Architecture

- **JSON-Guided Workflow**: Models return JSON tool calls that get executed
- **Function Call Conversion**: JSON tool calls convert to standard function calls
- **Capability Adaptation**: Different models get appropriate tool declarations
- **Continuous Execution**: Multi-step tasks execute automatically

### Supported Tools

- **File Operations**: read, write, edit, list, search, glob patterns
- **Shell Commands**: Execute system commands with proper sandboxing
- **Web Operations**: Fetch web content, search, API calls  
- **Knowledge Management**: Save and retrieve information
- **Sequential Thinking**: Complex reasoning and planning

## Troubleshooting

### Common Issues

1. **Command not found**: Ensure global installation or use local path
2. **API connection failed**: Check endpoint URL and API key
3. **Tool execution failed**: Verify file permissions and paths
4. **Model not responding**: Check provider configuration and model name

### Debug Mode

Enable verbose logging:
```bash
export DEBUG=gemini:*
gemini -p "test message"
```

### Configuration Validation

Check your configuration:
```bash
gemini --config-check
```

## Uninstallation

### Global Uninstall
```bash
npm uninstall -g @fanzhang/gemini-cli-hijack
```

### Local Uninstall
```bash
./uninstall-local.sh
```

### Clean Configuration
```bash
rm -rf ~/.gemini
```

## Support

For issues, feature requests, or contributions:
- **GitHub Issues**: [https://github.com/fanzhang/gemini-cli/issues](https://github.com/fanzhang/gemini-cli/issues)
- **Documentation**: Check the `docs/` directory for detailed architecture information
- **Examples**: See `examples/` directory for usage examples

## License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.
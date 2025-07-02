# Gemini CLI with Model Hijacking

A powerful command-line interface for interacting with the Gemini API, enhanced with **model hijacking capabilities** that allow transparent redirection to any OpenAI-compatible API endpoint.

## 🌟 Key Features

### Model Hijacking System
- **Transparent Redirection**: Users specify `gemini-2.5-flash`, system redirects to your local LLM server
- **Multiple Provider Support**: Easily switch between different API endpoints (LM Studio, Ollama, etc.)
- **Display vs Actual Models**: What users see vs what actually executes are completely separate

### Advanced Tool Execution
- **JSON-Guided Workflow**: Models return structured tool calls that get executed automatically
- **Function Call Conversion**: Seamless conversion between JSON and native function calls
- **Capability Adaptation**: Different models get appropriate tool declarations based on their capabilities
- **Continuous Execution**: Multi-step tasks execute automatically until completion

### Comprehensive Tool Suite
- **File Operations**: read, write, edit, list, search, glob patterns
- **Shell Commands**: Execute system commands with proper sandboxing
- **Web Operations**: Fetch web content, search, API calls  
- **Knowledge Management**: Save and retrieve information across sessions
- **Sequential Thinking**: Complex reasoning and planning capabilities

## 🚀 Quick Start

### Installation

```bash
# Clone and build
git clone https://github.com/fanzhang/gemini-cli.git
cd gemini-cli
npm install
npm run build:release

# Install globally
npm install -g .
```

### Basic Configuration

```bash
# Create config directory
mkdir -p ~/.gemini

# Set up hijacking (example with LM Studio)
cat > ~/.gemini/.env << EOF
HIJACK_ENABLED=true
HIJACK_API_ENDPOINT=http://localhost:1234/v1
HIJACK_ACTUAL_MODEL=your-local-model-name
HIJACK_API_KEY=lm-studio
HIJACK_TARGET_MODEL=gemini-2.5-flash
HIJACK_ACTIVE_PROVIDER=HIJACK
EOF
```

### Usage Examples

```bash
# Basic chat (will use hijacked endpoint if configured)
gemini -p "Hello, how are you?"

# File operations with auto-execution
gemini --yolo -p "Create a Python script that analyzes CSV data"

# Multi-step tasks
gemini --yolo -p "Organize my documents folder by file type"
```

## 📖 Documentation

- **[Installation Guide](INSTALLATION.md)**: Detailed installation and configuration instructions
- **[Architecture Overview](docs/architecture.md)**: System design and implementation details
- **[CLAUDE.md](CLAUDE.md)**: Development guidelines and architectural principles

## 🏗️ Architecture Highlights

### ModelCapabilityAdapter System
- **Automatic Detection**: Identifies model capabilities (native function calls vs JSON-only)
- **Tool Declaration Adaptation**: Provides appropriate tool views for different model types
- **Transparent Execution**: All tools execute through unified ToolRegistry regardless of model type

### JSON Tool Execution Pipeline
1. **JSON Guidance**: System prompts guide models to return structured tool calls
2. **Parsing & Conversion**: JSON tool calls parsed and converted to function calls
3. **Registry Execution**: All tools execute through standard ToolRegistry
4. **Continuous Flow**: Tool results feed back to model for multi-step execution

### Multi-Provider Configuration
```bash
# Multiple providers supported
HIJACK_API_ENDPOINT=http://localhost:1234/v1    # LM Studio
BACK_API_ENDPOINT=http://127.0.0.1:2048/v1      # Backup server
OLLAMA_API_ENDPOINT=http://localhost:11434/v1   # Ollama

# Easy switching
HIJACK_ACTIVE_PROVIDER=HIJACK
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific functionality
gemini --yolo -m gemini-2.0-flash -p "Create test.txt with content 'Hello World'"

# Verify hijacking works
gemini -m gemini-2.5-flash -p "What model are you?" # Uses your actual model
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📋 Project Structure

```
├── packages/
│   ├── core/                 # Core functionality and tool registry
│   └── cli/                  # Command-line interface
├── scripts/                  # Build and development scripts
├── docs/                     # Documentation
├── CLAUDE.md                 # Development guidelines
├── INSTALLATION.md           # Installation instructions
└── README.md                 # This file
```

## 🔧 Development

```bash
# Development mode with watch
npm run dev

# Build release version
npm run build:release

# Prepare new version
npm run prepare:release 0.1.0
```

## 📄 License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.

## 🎯 Status

- **Version**: 0.1.0
- **Status**: Release Candidate
- **Architecture**: ModelCapabilityAdapter with JSON Tool Execution
- **Features**: ✅ Model Hijacking ✅ Tool Execution ✅ Multi-Provider ✅ Continuous Dialogue

---

**Gemini CLI with Model Hijacking** - Transparent model redirection with powerful tool execution capabilities.
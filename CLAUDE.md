# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gemini CLI is an advanced command-line AI workflow tool built by Jason Zhang that connects to various AI models including Gemini, OpenAI-compatible, and local models. It features a sophisticated context-aware system with separate LLM process architecture, Neo4j Graph RAG integration, and comprehensive modular logging. The project includes an OpenAI compatibility layer for third-party model providers and advanced RAG (Retrieval-Augmented Generation) capabilities.

## Architecture

### Monorepo Structure
- **`packages/cli/`** - Frontend CLI package (`@google/gemini-cli`)
  - React-based UI using Ink framework  
  - User input processing and display rendering
  - Authentication and configuration
- **`packages/core/`** - Backend package (`@google/gemini-cli-core`)
  - Gemini API client and communication
  - Tool registration and execution system
  - OpenAI compatibility adapter
  - Session management and security

### Key Systems

**Tools System**: Built-in tools include file operations (`read_file`, `write_file`, `list_directory`, `glob`, `search_file_content`, `replace`), shell execution (`run_shell_command`), web capabilities (`web_fetch`, `web_search`), memory storage (`save_memory`), and MCP server integration.

**Separate LLM Process Architecture**: Revolutionary separate process system for ContextAgent intent recognition:
- `contextAgentLLMProcess.ts` - Core LLM processing logic with strict JSON response validation
- `contextAgentLLMServer.ts` - HTTP server running separate LLM process 
- `contextAgentLLMClient.ts` - Client for main process communication via HTTP IPC
- `contextAgentProcessManager.ts` - Process lifecycle management and health monitoring
- `contextAgentLLMWorker.ts` - Worker process wrapper with fault tolerance

**Neo4j Graph RAG System**: Advanced Knowledge Graph RAG implementation:
- Neo4j as default RAG provider with graph-based context retrieval
- Complete removal of text matching fallbacks (SiliconFlow provider cleaned)
- Intent recognition → JSON keywords (≤10) → RAG queries workflow
- Knowledge graph with semantic relationships and vector embeddings
- Support for multi-turn conversation history and incremental indexing

**Enhanced Modular Logging**: Comprehensive turn-based logging system:
- `enhancedLogger.ts` - Advanced logging with turn separation and module filtering
- File naming format: `content-time` (e.g., `context-turn-abc123-2025-07-18-14-30-00.jsonl`)
- Module-specific logging: context, rag, llm, embedding, vectorstore, etc.
- Environment variable configuration for each module's enable/file output
- Turn-based log separation with unique IDs and session tracking

**OpenAI Compatibility**: Complete adapter layer in `packages/core/src/openai/` provides API compatibility, tool conversion between formats, model mapping, and multi-turn conversation management. Key files:
- `adapter.ts` - Main adapter implementing GeminiClient interface
- `realClient.ts` - OpenAI API client with tool parsing
- `toolConverter.ts` - Tool format conversion and text-guided parsing
- `config.ts` - Provider configuration management

**Context Separation System**: Modular prompt building with 6 distinct sections:
- Static prompts (core instructions, project context, style guidelines)
- Dynamic prompts (session context, recent actions, user intent)
- Tool guidance (available tools and usage instructions)
- System prompts (role, capabilities, limitations, behavior)
- RAG context (graph-based retrieved context)
- LLM intent (separate process intent recognition results)

**Security & Sandboxing**: macOS Seatbelt sandboxing with multiple profiles (`permissive-open`, `restrictive-closed`), Docker/Podman container support, and proxied networking capabilities.

## Development Commands

### Build & Development
```bash
npm install                    # Install dependencies
npm run build                  # Build entire project
npm run build:all              # Build with sandbox container
npm start                      # Start CLI from source
npm run debug                  # Start with Node.js debugger
DEV=true npm start            # Enable React DevTools
```

### Testing
```bash
npm run test                                    # Unit tests
npm run test:ci                                # Tests with coverage
npm run test:e2e                              # End-to-end tests
npm run test:integration:sandbox:none         # Integration tests without sandbox
npm run test:integration:sandbox:docker       # Integration tests with Docker
npm run test:integration:sandbox:podman       # Integration tests with Podman
```

### Quality Assurance
```bash
npm run preflight             # Complete check before commits
npm run lint                  # ESLint
npm run lint:fix              # Fix linting issues
npm run format                # Prettier formatting
npm run typecheck             # TypeScript checking
node comprehensive_context_test_suite.cjs  # Run comprehensive context testing
```

### Release & Bundle
```bash
npm run bundle                # Bundle for distribution
npm run prepare:package       # Prepare for release
npm run clean                 # Clean build artifacts
```

## Important Code Patterns

### Import Restrictions
- Custom ESLint rule prevents relative imports between packages
- Use absolute imports: `@google/gemini-cli-core` instead of `../core`
- ES modules only (`"type": "module"`)

### React & TypeScript
- Functional components only, hooks-based architecture
- Avoid `any` types, prefer `unknown` with type narrowing
- Ink framework for terminal UI components
- React DevTools v4.28.5 compatible for debugging

### Testing Framework
- **Vitest** as primary testing framework
- `ink-testing-library` for CLI component testing
- Comprehensive mocking with `vi` utilities
- Co-located test files with source code

### OpenAI Integration Specifics
When working with OpenAI compatibility:
- Text-guided tool calls require `prompt_id` field in events
- Tool parsing supports ✦ symbol prefix in JSON responses
- Model name display should reflect actual OpenAI provider model
- Debug mode: set `DEBUG=1` or `OPENAI_DEBUG=1` environment variables

## Configuration

### Environment Variables

#### Core Authentication
- `GEMINI_API_KEY` - Gemini API authentication
- `GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true` - Vertex AI
- `OPENAI_API_KEY` - OpenAI compatible providers
- `OPENAI_BASE_URL` - Custom OpenAI provider endpoint

#### Provider Configuration
- `OPENAI_PROVIDER=SILICONFLOW` - OpenAI provider type
- `OPENAI_MODEL=Qwen/Qwen3-8B` - Model selection
- `SILICONFLOW_API_KEY` - SiliconFlow API key
- `SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1` - SiliconFlow endpoint
- `SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-m3` - Embedding model

#### ContextAgent & LLM Process
- `CONTEXTAGENT_PROVIDER=gemini` - LLM provider for intent recognition
- `CONTEXTAGENT_MODEL=gemini-1.5-flash` - Model for separate LLM process
- `CONTEXTAGENT_DEBUG=true` - Enable ContextAgent debug mode

#### Neo4j Graph RAG Configuration
- `NEO4J_URI=bolt://localhost:7687` - Neo4j connection URI
- `NEO4J_USERNAME=neo4j` - Neo4j username
- `NEO4J_PASSWORD=gemini123` - Neo4j password
- `NEO4J_DATABASE=neo4j` - Neo4j database name
- `NEO4J_ENCRYPTION=false` - Enable/disable encryption
- `ENABLE_NEO4J_GRAPH_RAG=true` - Enable Neo4j as primary RAG
- `DEFAULT_RAG_PROVIDER=neo4j-graph-rag` - Set default RAG provider
- `DISABLE_SILICONFLOW_EMBEDDING=true` - Disable SiliconFlow embedding fallbacks

#### Debug & Logging Configuration
- `DEBUG=1` - Enable global debug logging
- `DEBUG_LOG_DIRECTORY=/Users/username/.gemini/debug` - Log directory path
- `DEBUG_TURN_BASED_LOGS=true` - Enable turn-based logging
- `DEBUG_FILENAME_FORMAT=content-time` - Filename format (content-time or time-content)
- `DEBUG_MAX_FILE_SIZE=10` - Max file size in MB
- `DEBUG_MAX_FILES=5` - Max number of rotated files

#### Module-Specific Debug Flags
- `DEBUG_CONTEXT=true` - Enable context module logging
- `DEBUG_RAG=true` - Enable RAG module logging
- `DEBUG_LLM=true` - Enable LLM module logging
- `DEBUG_EMBEDDING=true` - Enable embedding module logging
- `DEBUG_VECTORSTORE=true` - Enable vectorstore module logging
- `DEBUG_CONTEXTPROVIDER=true` - Enable context provider logging
- `DEBUG_PROMPTBUILDER=true` - Enable prompt builder logging
- `DEBUG_TOOLMANAGER=true` - Enable tool manager logging
- `DEBUG_TASKMANAGER=true` - Enable task manager logging
- `DEBUG_SYSTEM=true` - Enable system logging

#### Module File Output Configuration
- `DEBUG_CONTEXT_FILE=true` - Write context logs to file
- `DEBUG_RAG_FILE=true` - Write RAG logs to file
- `DEBUG_LLM_FILE=true` - Write LLM logs to file
- (Similar pattern for all modules with `_FILE` suffix)

#### System Configuration
- `GEMINI_SANDBOX=true|docker|podman` - Enable sandboxing
- `SEATBELT_PROFILE=restrictive-closed` - macOS sandbox profile
- `NEO4J_TEST_MODE=true` - Enable Neo4j test mode
- `DISABLE_RAG_SYSTEM=false` - Disable RAG system entirely

### Authentication Methods
- Personal Google account (OAuth)
- Gemini API key 
- Vertex AI API key
- Google Workspace accounts
- OpenAI compatible providers (SiliconFlow, LMStudio, etc.)

## Key Files & Directories

### Project Structure
- `scripts/` - Build, test, and development utilities
- `docs/` - Comprehensive documentation  
- `integration-tests/` - E2E testing framework
- `.gemini/` - Project-specific configuration and sandbox customization
- `bundle/` - Distribution artifacts
- `esbuild.config.js` - Bundling configuration

### Core Architecture Files
- `packages/core/src/context/contextAgent.ts` - Main ContextAgent with separate LLM process integration
- `packages/core/src/context/contextAgentLLMProcess.ts` - Separate LLM process core logic
- `packages/core/src/context/contextAgentLLMServer.ts` - HTTP server for LLM process
- `packages/core/src/context/contextAgentLLMClient.ts` - HTTP client for main process
- `packages/core/src/context/contextAgentProcessManager.ts` - Process lifecycle management
- `packages/core/src/utils/enhancedLogger.ts` - Enhanced modular logging system

### Provider Files
- `packages/core/src/context/providers/vector/siliconFlowEmbeddingProvider.ts` - SiliconFlow vector provider (text matching removed)
- `packages/core/src/context/providers/graph/neo4jKnowledgeGraphProvider.ts` - Neo4j Graph RAG provider
- `packages/core/src/context/providers/contextProviderFactory.ts` - Provider factory and configuration

### Testing & Validation
- `comprehensive_context_test_suite.cjs` - Complete modular testing suite
- Test result files: `test_report_*.json`, `test_logs_*.json`
- Validation reports: `COMPREHENSIVE_TEST_VALIDATION_REPORT.md`

### Configuration Files
- `~/.gemini/.env` - Environment variables and module configuration
- `packages/cli/src/config/settings.ts` - CLI settings management
- `packages/core/src/config/config.ts` - Core configuration system

## Development Prerequisites

- **Node.js**: ~20.19.0 for development (>=20 for production)
- **Git**
- **Neo4j**: Version 4.4+ for Graph RAG functionality
- Optional: Docker/Podman for container sandboxing

## OpenAI Mode Debugging

For OpenAI compatibility issues:
1. Enable debug: `DEBUG=1 gemini --openai`
2. Check for prompt_id in tool_call_request events
3. Verify text-guided tool parsing with ✦ symbols
4. Confirm model name displays correctly (not "gemini-2.5-pro")
5. Test multi-turn tool call conversations

## Terminology

- `openai` indicates OpenAI-compatible models, not the official OpenAI models

## Naming Conventions & Code Patterns

### Module Naming
- **LLM Process Files**: `contextAgentLLM*.ts` pattern for separate process components
- **Provider Files**: Located in `packages/core/src/context/providers/[type]/` 
- **Test Files**: Co-located with source files using `.test.ts` extension
- **Log Files**: `[module]-[type]-[turnId]-[date]-[time].jsonl` format

### Code Standards
- **细菌式编程 (Bacterial Programming)**: Small, modular, self-contained components
- **Import Restrictions**: Absolute imports only (`@google/gemini-cli-core`)
- **TypeScript**: Strict typing, avoid `any`, prefer `unknown` with type narrowing
- **Error Handling**: Comprehensive error logging with enhanced logger
- **Process Isolation**: Separate processes for LLM intent recognition

### Environment Configuration Pattern
- **Module Enable**: `DEBUG_[MODULE]=true` - Enable module logging
- **File Output**: `DEBUG_[MODULE]_FILE=true` - Enable file output for module
- **Provider Selection**: `[SYSTEM]_PROVIDER=[provider]` pattern
- **Connection**: `[SYSTEM]_[CONNECTION_PARAM]` pattern (URI, USERNAME, etc.)

## Enhanced Debugging & Monitoring

### Debug Mode Activation
```bash
# Enable full debug with enhanced logging
gemini --debug

# Module-specific debugging
DEBUG_CONTEXT=true DEBUG_RAG=true gemini --debug

# Turn-based logging with file output
DEBUG_TURN_BASED_LOGS=true DEBUG_CONTEXT_FILE=true gemini --debug
```

### Log File Analysis
- **Location**: `~/.gemini/debug/` directory
- **Format**: JSONL with structured data
- **Turn Separation**: Each conversation turn logged separately
- **Module Filtering**: Individual module logs for focused debugging

### Testing & Validation
```bash
# Run comprehensive context testing
node comprehensive_context_test_suite.cjs

# Test specific modules
DEBUG_LLM=true node comprehensive_context_test_suite.cjs

# Generate validation report
node comprehensive_context_test_suite.cjs > validation_report.json
```

## Memory Notes

- **Text guided tool call**: 使用tool_call格式，这是我们现在必选的feature
- **Separate LLM Process**: Intent recognition runs in isolated process for performance and fault tolerance
- **Neo4j Graph RAG**: Default RAG provider with complete text matching removal
- **Enhanced Logging**: Turn-based modular logging with configurable file output and module filtering

## Submission Memory
- 每次提交github 前必须更新update.sh并且构建成功，同时运行gemini cli成功
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gemini CLI is a command-line AI workflow tool built by Google that connects to Gemini AI models. It enables users to work with large codebases, generate applications, automate tasks, and leverage various tools through a sophisticated terminal interface. The project includes an OpenAI compatibility layer for third-party model providers.

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

**OpenAI Compatibility**: Complete adapter layer in `packages/core/src/openai/` provides API compatibility, tool conversion between formats, model mapping, and multi-turn conversation management. Key files:
- `adapter.ts` - Main adapter implementing GeminiClient interface
- `realClient.ts` - OpenAI API client with tool parsing
- `toolConverter.ts` - Tool format conversion and text-guided parsing
- `config.ts` - Provider configuration management

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
- `GEMINI_API_KEY` - Gemini API authentication
- `GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true` - Vertex AI
- `GEMINI_SANDBOX=true|docker|podman` - Enable sandboxing
- `SEATBELT_PROFILE=restrictive-closed` - macOS sandbox profile
- `DEBUG=1` - Enable debug logging

### Authentication Methods
- Personal Google account (OAuth)
- Gemini API key 
- Vertex AI API key
- Google Workspace accounts

## Key Files & Directories

- `scripts/` - Build, test, and development utilities
- `docs/` - Comprehensive documentation
- `integration-tests/` - E2E testing framework
- `.gemini/` - Project-specific configuration and sandbox customization
- `bundle/` - Distribution artifacts
- `esbuild.config.js` - Bundling configuration

## Development Prerequisites

- **Node.js**: ~20.19.0 for development (>=20 for production)
- **Git**
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
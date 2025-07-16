# Project Structure

## Enhanced CLI System Architecture

This is an npm workspaces monorepo with two main packages, extended with advanced AI model integration, context management, and remote access capabilities:

```
packages/
├── cli/           # @google/gemini-cli - Terminal UI and CLI interface
├── core/          # @google/gemini-cli-core - Core logic and AI integration
└── server/        # @google/gemini-cli-server - Server mode and remote access (planned)
```

## Key Directories

### Root Level
- `bundle/` - Built distribution files and sandbox profiles
- `docs/` - Comprehensive documentation (architecture, CLI, tools, etc.)
- `scripts/` - Build, development, and utility scripts
- `integration-tests/` - End-to-end integration test suite
- `.gemini/` - Project-level configuration and context data
- `.kiro/` - Kiro steering rules and settings

### Enhanced Package Structure

#### Core Package (packages/core/src/)
```
src/
├── config/                    # Configuration management
├── core/                      # Core functionality
├── openai/                    # OpenAI mode hijacking system
│   ├── hijack.ts             # Main hijack adapter (legacy)
│   ├── hijack-refactored.ts  # Modular hijack adapter
│   ├── types/                # TypeScript interfaces
│   ├── parsers/              # Tool call parsers (JSON, descriptive, content isolation)
│   ├── conversation/         # Conversation history management
│   ├── context/              # Context injection and management
│   ├── streaming/            # Response handling and streaming
│   └── debug/                # Debug logging and tracking
├── context/                   # Advanced context management
│   ├── contextAgent.ts       # Main context agent with RAG integration
│   ├── contextManager.ts     # Unified context data management
│   ├── todoService.ts        # Task persistence and management
│   ├── knowledgeGraph.ts     # Project structure analysis
│   ├── layeredContextManager.ts # Intelligent context layering
│   ├── providers/            # Modular RAG and graph providers
│   └── interfaces/           # Provider abstraction interfaces
├── tools/                     # Enhanced tool implementations
│   ├── todo.ts               # Unified task management tool
│   ├── create_tasks.ts       # Task creation and breakdown
│   ├── get_current_task.ts   # Current task retrieval
│   ├── finish_current_task.ts # Task completion handling
│   └── workflow_template.ts  # Workflow template management
├── services/                  # Business logic services
├── utils/                     # Utility functions
└── analysis/                  # Semantic analysis services
```

#### CLI Package (packages/cli/src/)
```
src/
├── config/                    # CLI-specific configuration
├── ui/                        # React/Ink UI components
│   ├── components/           # Reusable UI components
│   ├── contexts/             # React contexts
│   ├── hooks/                # Custom React hooks
│   └── themes/               # UI themes and styling
├── services/                  # CLI business logic
└── utils/                     # CLI utilities
```

#### Server Package (packages/server/src/) - Planned
```
src/
├── server/                    # HTTP/WebSocket server
├── tty/                       # TTY virtualization layer
├── mobile/                    # Mobile web interface
├── api/                       # REST API endpoints
└── websocket/                 # Real-time communication
```

## Important Files

### Configuration
- `package.json` - Root package with workspaces and scripts
- `tsconfig.json` - TypeScript configuration with composite setup
- `eslint.config.js` - ESLint 9+ flat config with custom rules
- `.prettierrc.json` - Code formatting rules
- `Makefile` - Development shortcuts

### Build & Development
- `esbuild.config.js` - Bundling configuration
- `scripts/build.js` - Main build orchestration
- `scripts/build_package.js` - Individual package builder
- `.env` - Environment variables (not committed)

## Enhanced Architecture Patterns

### Monorepo Conventions
- No relative imports between packages (enforced by custom ESLint rule)
- Shared dependencies managed at root level
- Each package has independent build/test/lint scripts
- Modular provider system for extensibility

### Advanced Code Organization

#### Bacterial Programming Pattern
- **Small Components**: Each module is self-contained and focused
- **Modular Design**: Easy to replace or extend individual components
- **Clear Interfaces**: Well-defined contracts between modules
- **Independent Testing**: Each component can be tested in isolation

#### OpenAI Hijacking System
- **Request Interception**: Transparent API call redirection
- **Format Conversion**: Bidirectional format transformation
- **Tool Call Parsing**: Multiple format support (JSON, descriptive, content isolation)
- **Provider Abstraction**: Pluggable AI model providers

#### Context Management Architecture
- **Layered Context**: Intelligent context prioritization and compression
- **RAG Integration**: Modular retrieval-augmented generation
- **Knowledge Graphs**: Project structure understanding and relationship mapping
- **Memory Systems**: Persistent and session-based memory management

#### Task Management System
- **State Tracking**: Complete task lifecycle management
- **Maintenance Mode**: Focused execution environment
- **Recovery Mechanisms**: Graceful failure handling
- **Progress Monitoring**: Real-time status updates

### Storage Architecture

#### Project Isolation Structure
```
~/.gemini/
├── config.json                    # Global configuration
├── models.json                    # Model priority and settings
├── openai.json                    # OpenAI mode configuration
├── globalrules/                   # Cross-project rules
├── memories/                      # Global memories
├── projects/{project-id}/         # Project-specific data
│   ├── project_meta.json         # Project metadata
│   ├── context.json              # Cached context (24h expiry)
│   ├── rag/{provider}/           # Modular RAG storage
│   │   ├── lightrag/            # LightRAG provider data
│   │   ├── llamaindex/          # LlamaIndex provider data
│   │   └── custom/              # Custom RAG implementations
│   └── knowledge-graph/{provider}/ # Modular graph storage
│       ├── graphology/          # Graphology provider
│       ├── neo4j/               # Neo4j provider
│       └── networkx/            # NetworkX provider
└── todos/{project-id}/            # Task management data
    ├── todo_context.json         # Task list and status
    └── current_task.txt          # Active task identifier
```

#### Configuration Hierarchy
```
Project Level (./.gemini/)
├── config.json                   # Project-specific overrides
├── models.json                   # Project model preferences
├── openai.json                   # Project OpenAI settings
├── localrules/                   # Project-specific rules
└── memories/                     # Project-specific memories

Global Level (~/.gemini/)
├── config.json                   # Global defaults
├── models.json                   # Global model configuration
├── openai.json                   # Global OpenAI settings
├── globalrules/                  # Universal rules
└── memories/                     # Cross-project memories
```

### Component Interaction Patterns

#### OpenAI Hijacking Flow
```
User Input → Message Processor → Context Injector → Model Router → Response Handler → Tool Parser → Tool Executor → Context Updater
```

#### Context Management Flow
```
User Input → Context Agent → RAG System → Knowledge Graph → Layered Context → Dynamic Injection → Model Context
```

#### Task Management Flow
```
Task Creation → Task Breakdown → Status Tracking → Progress Monitoring → Completion Handling → Context Update
```

### File Naming Conventions
- TypeScript files use `.ts` extension
- React components use `.tsx` extension  
- Test files use `.test.ts` or `.test.tsx`
- Integration tests use `.integration.test.ts`
- Provider implementations use `{provider}-{type}.ts` pattern
- Interface definitions use `I{Name}.ts` pattern

### Modular Provider System

#### RAG Providers
- **LightRAG**: Advanced semantic analysis with graph-based retrieval
- **LlamaIndex**: Document indexing and retrieval framework
- **Custom**: Extensible interface for custom implementations

#### Knowledge Graph Providers
- **Graphology**: In-memory graph processing
- **Neo4j**: Enterprise graph database
- **NetworkX**: Python-compatible graph analysis

#### Model Providers
- **OpenAI**: Official OpenAI API
- **Azure**: Azure OpenAI Service
- **Anthropic**: Claude API integration
- **Local**: LM Studio, Ollama, custom endpoints

## License & Headers
All source files must include Google's Apache 2.0 license header (enforced by ESLint).
source copyright under Jason Zhang

## Virtual Environment
Running locally under virtual environment ./venv
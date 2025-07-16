# Technology Stack

## Core Technologies

- **Runtime**: Node.js >=20.0.0 (development requires ~20.19.0)
- **Language**: TypeScript with ES2022 target, NodeNext modules
- **Package Manager**: npm with workspaces
- **Build System**: Custom build scripts + esbuild for bundling
- **Testing**: Vitest with coverage via @vitest/coverage-v8
- **Linting**: ESLint 9+ with TypeScript ESLint, React plugins
- **Formatting**: Prettier

## Enhanced Key Dependencies

### CLI Package (@google/gemini-cli)
- **UI Framework**: React 19+ with Ink for terminal UI
- **Mobile UI**: Responsive web components for mobile interface
- **Utilities**: yargs, shell-quote, glob, mime-types
- **Development**: React DevTools, Ink testing library

### Core Package (@google/gemini-cli-core)  
- **AI Integration**: @google/genai (Gemini API), openai, anthropic
- **OpenAI Hijacking**: Custom request interception and transformation
- **Context Management**: Advanced RAG and knowledge graph systems
- **Task Management**: Intelligent workflow automation
- **MCP Support**: @modelcontextprotocol/sdk
- **Telemetry**: OpenTelemetry SDK with OTLP exporters
- **Graph Processing**: graphology, neo4j-driver (optional)
- **Vector Storage**: Custom vector implementations, faiss-node (optional)
- **Utilities**: simple-git, micromatch, html-to-text

### Server Package (@google/gemini-cli-server) - Planned
- **Web Server**: Express.js or Fastify for HTTP/REST API
- **WebSocket**: ws or socket.io for real-time communication
- **TTY Virtualization**: node-pty for terminal emulation
- **Mobile Framework**: Progressive Web App (PWA) capabilities
- **Authentication**: JWT tokens, session management

## Enhanced Technology Features

### OpenAI Mode Hijacking
- **Request Interception**: Transparent API call redirection using custom middleware
- **Format Transformation**: Bidirectional conversion between Gemini and OpenAI formats
- **Tool Call Parsing**: Multi-format support (JSON, descriptive, content isolation)
- **Provider Abstraction**: Pluggable architecture for different AI providers
- **Debug Logging**: Comprehensive request/response tracking and analysis

### Advanced Context Management
- **RAG Integration**: Modular retrieval-augmented generation with provider abstraction
- **Knowledge Graphs**: Project structure analysis using graphology and optional Neo4j
- **Vector Storage**: Semantic search capabilities with custom and FAISS implementations
- **Layered Context**: Intelligent context prioritization and token budget management
- **Memory Systems**: Persistent global and project-specific memory storage

### Task Management System
- **State Tracking**: Complete task lifecycle with persistence
- **Maintenance Mode**: Focused execution environment for complex workflows
- **Recovery Mechanisms**: Graceful failure handling and alternative approaches
- **Progress Monitoring**: Real-time status updates and completion tracking
- **Workflow Templates**: Reusable task patterns and automation

### Configuration Management
- **Hierarchical Config**: Project-level overrides with global defaults
- **Environment Variables**: Flexible .env file support at multiple levels
- **Model Priority**: Automatic provider selection based on cost and capability
- **Provider Health Checks**: Automatic availability detection and failover

## Development Environment Setup

### Prerequisites
```bash
# Node.js version management
nvm install 20.19.0
nvm use 20.19.0

# Global dependencies
npm install -g typescript vitest eslint prettier

# Optional: Neo4j for advanced graph features
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/gemini123 \
  neo4j:latest
```

### Environment Configuration
```bash
# Copy example environment files
cp .env.example .env
cp .gemini/.env.example .gemini/.env

# Configure API keys
export OPENAI_API_KEY="your-openai-key"
export GEMINI_API_KEY="your-gemini-key"
export NEO4J_PASSWORD="gemini123"
```

### Common Commands

#### Development Workflow
```bash
# Install dependencies
npm install

# Build entire project
npm run build
npm run build:all  # includes sandbox and server

# Development server
npm start
npm run debug      # with debugger
npm run server     # start server mode (planned)

# Testing
npm run test                    # unit tests
npm run test:e2e               # integration tests
npm run test:integration:all   # all integration variants
npm run test:openai           # OpenAI hijacking tests
npm run test:context         # context management tests
npm run test:tasks           # task management tests

# Code Quality
npm run lint
npm run format
npm run preflight  # comprehensive check (clean, install, format, lint, build, typecheck, test)

# Utilities
npm run clean
npm run typecheck
npm run analyze   # bundle analysis
```

#### OpenAI Mode Testing
```bash
# Test different providers
npm run test:openai -- --provider=openai
npm run test:openai -- --provider=azure
npm run test:openai -- --provider=anthropic
npm run test:openai -- --provider=lmstudio

# Test tool call formats
npm run test:tools -- --format=json
npm run test:tools -- --format=descriptive
npm run test:tools -- --format=content-isolation
```

#### Context Management Testing
```bash
# Test RAG providers
npm run test:rag -- --provider=lightrag
npm run test:rag -- --provider=llamaindex
npm run test:rag -- --provider=custom

# Test knowledge graph providers
npm run test:graph -- --provider=graphology
npm run test:graph -- --provider=neo4j
npm run test:graph -- --provider=networkx
```

### Makefile Shortcuts
```bash
make install    # npm install
make build      # npm run build
make test       # npm run test
make lint       # npm run lint
make format     # npm run format
make preflight  # npm run preflight
make start      # npm start
make debug      # npm run debug
```

## Sandboxing Support

- **macOS**: Seatbelt (sandbox-exec) with configurable profiles
- **Cross-platform**: Docker/Podman container sandboxing
- **Profiles**: permissive/restrictive + open/closed/proxied combinations
- **Environment**: `GEMINI_SANDBOX=true|docker|podman`
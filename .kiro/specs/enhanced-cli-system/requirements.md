# Requirements Document / 需求文档

## Introduction / 简介

This document outlines the requirements for an enhanced command-line CLI system that extends the Gemini CLI with advanced capabilities including OpenAI mode hijacking, intelligent task management, and context-aware analysis. The system enables seamless integration between different AI models while providing sophisticated workflow automation and context understanding.

本文档概述了增强型命令行CLI系统的需求，该系统扩展了Gemini CLI，具备OpenAI模式劫持、智能任务管理和上下文感知分析等高级功能。系统能够在不同AI模型之间实现无缝集成，同时提供复杂的工作流自动化和上下文理解能力。

## Requirements / 需求

### Requirement 1: OpenAI Mode Hijacking and Format Support / 需求1：OpenAI模式劫持和格式支持 ✅ **已完成 COMPLETED**

**User Story:** As a developer, I want to use OpenAI-compatible models through the CLI system, so that I can leverage different AI providers while maintaining consistent tooling capabilities.

**用户故事：** 作为开发者，我希望通过CLI系统使用OpenAI兼容的模型，以便在保持一致工具功能的同时利用不同的AI提供商。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN a user enables --openai mode THEN the system SHALL intercept and transform requests to OpenAI-compatible format
   当用户启用--openai模式时，系统应拦截并将请求转换为OpenAI兼容格式
   **实现状态：** `OpenAIHijackAdapter` 类已实现完整的请求拦截和转换功能

2. ✅ WHEN the system receives OpenAI API calls THEN it SHALL convert them to the internal format while preserving all functionality
   当系统接收到OpenAI API调用时，应将其转换为内部格式同时保留所有功能
   **实现状态：** 已实现双向转换，支持完整的功能保留

3. ✅ WHEN using models that don't support tool calling THEN the system SHALL provide text-guided tool usage capabilities
   当使用不支持工具调用的模型时，系统应提供文本引导的工具使用功能
   **实现状态：** `generateToolGuidance()` 方法提供完整的文本引导功能

4. ✅ IF a model lacks native tool support THEN the system SHALL generate textual instructions for tool execution
   如果模型缺乏原生工具支持，系统应生成工具执行的文本指令
   **实现状态：** 多种解析格式支持，包括JSON、描述性和内容隔离格式

5. ✅ WHEN switching between Gemini and OpenAI modes THEN the system SHALL maintain session continuity and context
   当在Gemini和OpenAI模式之间切换时，系统应保持会话连续性和上下文
   **实现状态：** `ConversationHistoryManager` 维护会话连续性

### Requirement 2: Enhanced Task Management System / 需求2：增强任务管理系统 ✅ **已完成 COMPLETED**

**User Story:** As a user, I want an intelligent task management system that can organize and execute complex workflows, so that I can automate multi-step processes efficiently.

**用户故事：** 作为用户，我希望有一个智能任务管理系统，能够组织和执行复杂的工作流，以便高效地自动化多步骤流程。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN a user provides input in interactive mode THEN the system SHALL analyze and create appropriate task structures
   当用户在交互模式下提供输入时，系统应分析并创建适当的任务结构
   **实现状态：** `TodoTool` 和 `CreateTasksTool` 提供完整的任务创建和分析功能

2. ✅ WHEN tasks are created THEN the system SHALL organize them hierarchically with dependencies
   当任务被创建时，系统应按层次结构组织它们并处理依赖关系
   **实现状态：** `TaskListContext` 和 `TodoService` 支持层次化任务组织

3. ✅ WHEN executing tasks THEN the system SHALL track progress and handle failures gracefully
   当执行任务时，系统应跟踪进度并优雅地处理失败
   **实现状态：** 任务状态跟踪系统，支持 pending/in_progress/completed 状态

4. ✅ IF a task fails THEN the system SHALL provide recovery options and alternative approaches
   如果任务失败，系统应提供恢复选项和替代方法
   **实现状态：** 任务状态管理和错误恢复机制已实现

5. ✅ WHEN tasks are completed THEN the system SHALL update status and trigger dependent tasks
   当任务完成时，系统应更新状态并触发依赖任务
   **实现状态：** `FinishCurrentTaskTool` 和自动任务切换功能

6. ✅ WHEN multiple tasks exist THEN the system SHALL prioritize and schedule execution optimally
   当存在多个任务时，系统应优化优先级和执行调度
   **实现状态：** 任务维护模式和当前任务管理系统

### Requirement 3: Context-Aware Analysis and Management / 需求3：上下文感知分析和管理 ✅ **已完成 COMPLETED**

**User Story:** As a developer, I want the system to understand and maintain context across interactions, so that it can provide more relevant and accurate responses.

**用户故事：** 作为开发者，我希望系统能够理解并维护交互过程中的上下文，以便提供更相关和准确的响应。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN a user provides input THEN the context agent SHALL analyze the input for relevant context clues
   当用户提供输入时，上下文代理应分析输入中的相关上下文线索
   **实现状态：** `ContextAgent.injectContextIntoDynamicSystem()` 实现实时输入分析

2. ✅ WHEN the model generates responses THEN the system SHALL extract and store relevant context information
   当模型生成响应时，系统应提取并存储相关的上下文信息
   **实现状态：** `ContextInjector` 和 `MemoryStorageService` 提供响应分析和存储

3. ✅ WHEN context changes THEN the system SHALL update the knowledge graph and memory systems
   当上下文发生变化时，系统应更新知识图谱和记忆系统
   **实现状态：** `KnowledgeGraph` 和 RAG 系统支持动态更新

4. ✅ IF context becomes too large THEN the system SHALL intelligently summarize and compress information
   如果上下文变得过大，系统应智能地总结和压缩信息
   **实现状态：** `LayeredContextManager` 提供智能上下文压缩和分层管理

5. ✅ WHEN retrieving context THEN the system SHALL rank relevance and provide the most pertinent information
   当检索上下文时，系统应对相关性进行排序并提供最相关的信息
   **实现状态：** RAG 系统和语义分析服务提供相关性排序

6. ✅ WHEN working with codebases THEN the system SHALL maintain understanding of project structure and relationships
   当处理代码库时，系统应保持对项目结构和关系的理解
   **实现状态：** `FileScanner`、`StaticAnalyzer` 和知识图谱维护项目结构理解

### Requirement 4: Seamless Model Integration and Compatibility / 需求4：无缝模型集成和兼容性 ✅ **已完成 COMPLETED**

**User Story:** As a developer, I want to switch between different AI models seamlessly, so that I can choose the best model for each specific task.

**用户故事：** 作为开发者，我希望能够无缝切换不同的AI模型，以便为每个特定任务选择最佳模型。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN switching models THEN the system SHALL preserve conversation history and context
   当切换模型时，系统应保留对话历史和上下文
   **实现状态：** `ConversationHistoryManager` 和 `ContextManager` 维护跨模型的会话连续性

2. ✅ WHEN a model has different capabilities THEN the system SHALL adapt tool usage accordingly
   当模型具有不同功能时，系统应相应地调整工具使用
   **实现状态：** 动态工具指导生成，根据模型能力调整工具呈现方式

3. ✅ WHEN using text-only models THEN the system SHALL provide clear textual guidance for tool operations
   当使用纯文本模型时，系统应为工具操作提供清晰的文本指导
   **实现状态：** 多格式工具解析器支持文本引导的工具使用

4. ✅ IF model switching fails THEN the system SHALL fallback gracefully to the previous working model
   如果模型切换失败，系统应优雅地回退到之前工作的模型
   **实现状态：** 错误处理和回退机制已实现

5. ✅ WHEN models have different token limits THEN the system SHALL adjust context management strategies
   当模型具有不同的令牌限制时，系统应调整上下文管理策略
   **实现状态：** `LayeredContextManager` 提供基于令牌预算的上下文管理

### Requirement 5: Advanced Tool Integration and Execution / 需求5：高级工具集成和执行 ✅ **已完成 COMPLETED**

**User Story:** As a user, I want sophisticated tool integration that works across different model types, so that I can maintain consistent functionality regardless of the underlying AI model.

**用户故事：** 作为用户，我希望有复杂的工具集成功能，能够在不同模型类型下工作，以便无论底层AI模型如何都能保持一致的功能。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN tools are available THEN the system SHALL present them appropriately for each model type
   当工具可用时，系统应为每种模型类型适当地呈现它们
   **实现状态：** 动态工具指导生成，根据模型能力调整工具呈现

2. ✅ WHEN using tool-capable models THEN the system SHALL use native tool calling mechanisms
   当使用具备工具功能的模型时，系统应使用原生工具调用机制
   **实现状态：** 原生工具调用和文本引导双模式支持

3. ✅ WHEN using text-only models THEN the system SHALL generate clear instructions for manual tool execution
   当使用纯文本模型时，系统应生成清晰的手动工具执行指令
   **实现状态：** 多格式工具解析器（JSON、描述性、内容隔离）

4. ✅ IF tool execution fails THEN the system SHALL provide error handling and retry mechanisms
   如果工具执行失败，系统应提供错误处理和重试机制
   **实现状态：** 工具调用跟踪和错误处理机制

5. ✅ WHEN tools produce output THEN the system SHALL integrate results back into the conversation context
   当工具产生输出时，系统应将结果集成回对话上下文
   **实现状态：** 工具结果格式化和上下文集成

6. ✅ WHEN multiple tools are needed THEN the system SHALL coordinate execution and manage dependencies
   当需要多个工具时，系统应协调执行并管理依赖关系
   **实现状态：** 任务管理系统和工具执行协调

### Requirement 6: Interactive Mode Enhancement / 需求6：交互模式增强 🔄 **部分完成 PARTIALLY COMPLETED**

**User Story:** As a user, I want an enhanced interactive mode that provides intelligent assistance and workflow management, so that I can work more efficiently with complex tasks.

**用户故事：** 作为用户，我希望有一个增强的交互模式，提供智能辅助和工作流管理，以便更高效地处理复杂任务。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN entering interactive mode THEN the system SHALL provide contextual assistance and suggestions
   当进入交互模式时，系统应提供上下文辅助和建议
   **实现状态：** 上下文感知系统和工具指导已实现

2. 🔄 WHEN user input is ambiguous THEN the system SHALL ask clarifying questions
   当用户输入模糊时，系统应询问澄清问题
   **实现状态：** 部分实现，需要增强意图识别和澄清机制

3. ✅ WHEN complex workflows are detected THEN the system SHALL offer to break them into manageable tasks
   当检测到复杂工作流时，系统应提供将其分解为可管理任务的选项
   **实现状态：** 任务管理系统自动检测和分解复杂工作流

4. 🔄 IF the user needs help THEN the system SHALL provide relevant documentation and examples
   如果用户需要帮助，系统应提供相关文档和示例
   **实现状态：** 工具指导已实现，需要增强帮助系统

5. ✅ WHEN working on long-running tasks THEN the system SHALL provide progress updates and status information
   当处理长时间运行的任务时，系统应提供进度更新和状态信息
   **实现状态：** 任务状态跟踪和进度报告已实现

6. ✅ WHEN errors occur THEN the system SHALL provide clear explanations and suggested solutions
   当发生错误时，系统应提供清晰的解释和建议的解决方案
   **实现状态：** 错误处理和恢复机制已实现

### Requirement 7: System Hijacking and Request Transformation / 需求7：系统劫持和请求转换 ✅ **已完成 COMPLETED**

**User Story:** As a system integrator, I want the ability to intercept and transform API requests, so that I can provide compatibility layers between different AI service formats.

**用户故事：** 作为系统集成者，我希望能够拦截和转换API请求，以便在不同AI服务格式之间提供兼容层。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN OpenAI requests are made THEN the system SHALL intercept them before they reach external APIs
   当发出OpenAI请求时，系统应在它们到达外部API之前拦截它们
   **实现状态：** `OpenAIHijackAdapter` 完整实现请求拦截功能

2. ✅ WHEN transforming requests THEN the system SHALL preserve all semantic meaning and functionality
   当转换请求时，系统应保留所有语义含义和功能
   **实现状态：** 双向转换机制保持语义完整性

3. ✅ WHEN responses are received THEN the system SHALL transform them back to the expected format
   当接收到响应时，系统应将它们转换回预期格式
   **实现状态：** `ResponseHandler` 处理响应格式转换

4. ✅ IF transformation fails THEN the system SHALL log errors and provide fallback mechanisms
   如果转换失败，系统应记录错误并提供回退机制
   **实现状态：** 错误处理和回退机制已实现

5. ✅ WHEN debugging is enabled THEN the system SHALL provide detailed logs of all transformations
   当启用调试时，系统应提供所有转换的详细日志
   **实现状态：** `DebugLogger` 提供详细的转换日志

6. ✅ WHEN multiple request types are handled THEN the system SHALL route them to appropriate handlers
   当处理多种请求类型时，系统应将它们路由到适当的处理程序
   **实现状态：** 模块化架构支持多种请求类型路由

### Requirement 8: Context Agent Real-time Analysis / 需求8：上下文代理实时分析 ✅ **已完成 COMPLETED**

**User Story:** As a developer, I want real-time analysis of interactions to build comprehensive context understanding, so that the system can provide increasingly intelligent assistance.

**用户故事：** 作为开发者，我希望对交互进行实时分析以建立全面的上下文理解，以便系统能够提供越来越智能的辅助。

#### Acceptance Criteria / 验收标准

1. ✅ WHEN user input is received THEN the context agent SHALL analyze it in real-time
   当接收到用户输入时，上下文代理应实时分析它
   **实现状态：** `ContextAgent.injectContextIntoDynamicSystem()` 实现实时输入分析

2. ✅ WHEN model responses are generated THEN the system SHALL extract key information and relationships
   当生成模型响应时，系统应提取关键信息和关系
   **实现状态：** `ContextInjector.injectModelResponseContext()` 提取和分析模型响应

3. ✅ WHEN patterns are detected THEN the system SHALL update its understanding of user preferences and workflows
   当检测到模式时，系统应更新对用户偏好和工作流的理解
   **实现状态：** 知识图谱和RAG系统持续学习用户模式

4. ✅ IF context analysis reveals important insights THEN the system SHALL proactively share them
   如果上下文分析揭示重要见解，系统应主动分享它们
   **实现状态：** 上下文分析结果主动注入到对话中

5. ✅ WHEN working with code THEN the system SHALL understand project structure, dependencies, and patterns
   当处理代码时，系统应理解项目结构、依赖关系和模式
   **实现状态：** `StaticAnalyzer` 和 `FileScanner` 分析代码结构和依赖

6. ✅ WHEN context becomes stale THEN the system SHALL refresh and update relevant information
   当上下文变得陈旧时，系统应刷新和更新相关信息
   **实现状态：** 动态上下文清理和刷新机制已实现

### Requirement 9: Session History and Context Separation / 需求9：会话历史和上下文分离 � **需要完善 NEEDS  ENHANCEMENT**

**User Story:** As a developer, I want the system to clearly separate what should be saved as conversation history versus what should be used as contextual information, so that conversation history remains clean and focused while context provides rich background information.

**用户故事：** 作为开发者，我希望系统能够清晰地区分什么应该保存为对话历史，什么应该用作上下文信息，以便对话历史保持清洁和专注，而上下文提供丰富的背景信息。

#### Acceptance Criteria / 验收标准

1. ❌ WHEN processing system context THEN it SHALL NOT be saved as conversation history
   当处理系统上下文时，不应将其保存为对话历史
   **实现状态：** 需要实现严格的分离机制

2. ❌ WHEN processing static context THEN it SHALL NOT be saved as conversation history
   当处理静态上下文时，不应将其保存为对话历史
   **实现状态：** 需要实现严格的分离机制

3. ❌ WHEN processing dynamic context THEN it SHALL NOT be saved as conversation history
   当处理动态上下文时，不应将其保存为对话历史
   **实现状态：** 需要实现严格的分离机制

4. ✅ WHEN tasks are executed THEN task history SHALL be saved as part of conversation history
   当执行任务时，任务历史应保存为对话历史的一部分
   **实现状态：** 任务执行和状态更新已记录在对话中

5. ✅ WHEN tools are called THEN tool call history SHALL be saved as part of conversation history
   当调用工具时，工具调用历史应保存为对话历史的一部分
   **实现状态：** 工具调用和结果已记录在对话中

6. ✅ WHEN tool execution succeeds THEN success details SHALL be saved as conversation history
   当工具执行成功时，成功详情应保存为对话历史
   **实现状态：** 成功的工具执行结果已记录

7. ✅ WHEN tool execution fails THEN failure details SHALL be saved as conversation history
   当工具执行失败时，失败详情应保存为对话历史
   **实现状态：** 失败的工具执行错误已记录

#### Context vs History Classification / 上下文与历史分类

**Should NOT be in Conversation History / 不应在对话历史中:**
- System context (runtime environment, session info)
- Static context (project rules, memories, file structure)
- Dynamic context (real-time analysis, context injection results)
- RAG-generated context information
- Knowledge graph analysis results
- 系统上下文（运行环境、会话信息）
- 静态上下文（项目规则、记忆、文件结构）
- 动态上下文（实时分析、上下文注入结果）
- RAG生成的上下文信息
- 知识图谱分析结果

**Should be in Conversation History / 应在对话历史中:**
- User messages and model responses
- Task creation, updates, and completion
- Tool call requests and responses
- Tool execution success and failure details
- Error messages and recovery actions
- Workflow progress and status updates
- 用户消息和模型响应
- 任务创建、更新和完成
- 工具调用请求和响应
- 工具执行成功和失败详情
- 错误消息和恢复操作
- 工作流进度和状态更新

### Requirement 10: Configuration Management and Model Priority / 需求10：配置管理和模型优先级 🔄 **需要完善 NEEDS ENHANCEMENT**

**User Story:** As a developer, I want a clear configuration system that manages project-specific settings, model priorities, and OpenAI mode parameters, so that I can customize the system behavior for different projects and use cases.

**用户故事：** 作为开发者，我希望有一个清晰的配置系统来管理项目特定设置、模型优先级和OpenAI模式参数，以便为不同项目和用例定制系统行为。

#### Acceptance Criteria / 验收标准

1. ❌ WHEN the system starts THEN it SHALL load configuration from project-specific config files
   当系统启动时，应从项目特定的配置文件加载配置
   **实现状态：** 需要实现项目配置文件系统

2. ❌ WHEN multiple models are available THEN the system SHALL apply model priority rules
   当有多个模型可用时，系统应应用模型优先级规则
   **实现状态：** 需要实现模型优先级管理

3. ❌ WHEN OpenAI mode is enabled THEN the system SHALL use OpenAI-specific configuration parameters
   当启用OpenAI模式时，系统应使用OpenAI特定的配置参数
   **实现状态：** 需要完善OpenAI配置管理

4. ❌ WHEN configuration files are missing THEN the system SHALL create default configurations
   当配置文件缺失时，系统应创建默认配置
   **实现状态：** 需要实现默认配置生成

5. ❌ WHEN configuration is invalid THEN the system SHALL provide clear error messages and fallback options
   当配置无效时，系统应提供清晰的错误消息和回退选项
   **实现状态：** 需要实现配置验证和错误处理

#### Configuration File Structure / 配置文件结构

**Project Configuration Location / 项目配置文件位置:**
```
.gemini/
├── config.json              # 主配置文件
├── models.json              # 模型配置和优先级
├── openai.json              # OpenAI模式特定配置
├── localrules/              # 项目特定规则
└── memories/                # 项目特定记忆
```

**Global Configuration Location / 全局配置文件位置:**
```
~/.gemini/
├── config.json              # 全局配置文件
├── models.json              # 全局模型配置
├── openai.json              # 全局OpenAI配置
├── globalrules/             # 全局规则
└── memories/                # 全局记忆
```

#### Model Priority Configuration / 模型优先级配置

**models.json Structure / models.json 结构:**
```json
{
  "defaultModel": "gemini-pro",
  "modelPriority": [
    {
      "name": "gemini-pro",
      "provider": "google",
      "priority": 1,
      "capabilities": ["tool_calling", "multimodal"],
      "tokenLimit": 1000000,
      "costPerToken": 0.001
    },
    {
      "name": "gpt-4",
      "provider": "openai",
      "priority": 2,
      "capabilities": ["tool_calling"],
      "tokenLimit": 128000,
      "costPerToken": 0.03
    }
  ],
  "fallbackStrategy": "priority_order",
  "autoSwitching": {
    "enabled": true,
    "criteria": ["cost", "capability", "availability"]
  }
}
```

#### OpenAI Mode Configuration / OpenAI模式配置

**Project-Level .env Configuration / 项目级.env配置 (./.gemini/.env):**
```bash
# HIJACK Configuration / 劫持配置
HIJACK_ENABLED=true
HIJACK_ACTIVE_PROVIDER=OPENAI
HIJACK_FORCE_FUNCTION_CALLS=true
FORCE_JSON_TOOL_CALLS=false

# Gemini Integration / Gemini集成
GEMINI_CONTEXT_AGENT=true
DEFAULT_GEMINI_MODEL=gemini-2.5-pro

# OpenAI Provider Configuration / OpenAI提供者配置
OPENAI_API_ENDPOINT=https://api.openai.com/v1
OPENAI_ACTUAL_MODEL=gpt-4
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_PROVIDER=OpenAI
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
OPENAI_TIMEOUT=30000

# Azure OpenAI Configuration / Azure OpenAI配置
AZURE_API_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
AZURE_ACTUAL_MODEL=gpt-4
AZURE_API_KEY=${AZURE_OPENAI_API_KEY}
AZURE_PROVIDER=AzureOpenAI
AZURE_API_VERSION=2024-02-15-preview

# LM Studio Configuration / LM Studio配置
LMSTUDIO_API_ENDPOINT=http://localhost:1234/v1
LMSTUDIO_ACTUAL_MODEL=local-model
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_PROVIDER=LMStudio

# AI Studio Proxy Configuration / AI Studio代理配置
AIPROXY_API_ENDPOINT=http://127.0.0.1:2048/v1
AIPROXY_ACTUAL_MODEL=gemini-2.5-pro
AIPROXY_API_KEY=1234567890
AIPROXY_PROVIDER=AIStudioProxy

# Tool Integration Settings / 工具集成设置
DANGEROUS_TOOLS=run_shell_command,write_file,replace
COMPLEX_TOOLS=write_file,replace
CONTENT_ISOLATION_ENABLED=true
CONTENT_START_MARKER=<*#*#CONTENT#*#*>
CONTENT_END_MARKER=</*#*#CONTENT#*#*>

# GraphRAG Configuration / 图RAG配置
GRAPH_RAG_ENABLED=true
GRAPH_RAG_MODE=neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=${NEO4J_PASSWORD}
NEO4J_DATABASE=gemini

# Fallback Configuration / 回退配置
GRAPH_FALLBACK_ENABLED=true
GRAPH_FALLBACK_MODE=sqlite

# Performance Settings / 性能设置
GRAPH_BATCH_SIZE=1000
GRAPH_MAX_CONNECTIONS=50
GRAPH_TIMEOUT=30000

# Feature Flags / 功能标志
ENABLE_ADVANCED_ANALYTICS=true
ENABLE_REAL_TIME_UPDATES=false
ENABLE_GRAPH_VISUALIZATION=true
```

**Global-Level .env Configuration / 全局级.env配置 (~/.gemini/.env):**
```bash
# Global HIJACK Configuration / 全局劫持配置
HIJACK_ENABLED=true
HIJACK_DEFAULT_PROVIDER=OPENAI
HIJACK_FORCE_FUNCTION_CALLS=true
FORCE_JSON_TOOL_CALLS=false

# Global Gemini Settings / 全局Gemini设置
GEMINI_CONTEXT_AGENT=true
DEFAULT_GEMINI_MODEL=gemini-2.5-pro
GEMINI_API_KEY=${GEMINI_API_KEY}

# Global OpenAI Configuration / 全局OpenAI配置
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_ORG_ID=${OPENAI_ORG_ID}
OPENAI_DEFAULT_MODEL=gpt-4
OPENAI_DEFAULT_TEMPERATURE=0.7
OPENAI_DEFAULT_MAX_TOKENS=4096

# Global Azure Configuration / 全局Azure配置
AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Global Anthropic Configuration / 全局Anthropic配置
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

# Global Tool Settings / 全局工具设置
GLOBAL_DANGEROUS_TOOLS=run_shell_command,write_file,replace
GLOBAL_COMPLEX_TOOLS=write_file,replace
GLOBAL_CONTENT_ISOLATION=true

# Global GraphRAG Settings / 全局图RAG设置
GLOBAL_GRAPH_RAG_ENABLED=true
GLOBAL_GRAPH_RAG_PROVIDER=neo4j
GLOBAL_NEO4J_URI=bolt://localhost:7687
GLOBAL_NEO4J_USERNAME=neo4j
GLOBAL_NEO4J_PASSWORD=${NEO4J_PASSWORD}

# Global Performance Settings / 全局性能设置
GLOBAL_GRAPH_BATCH_SIZE=1000
GLOBAL_GRAPH_MAX_CONNECTIONS=50
GLOBAL_GRAPH_TIMEOUT=30000
GLOBAL_DEBUG_MODE=false
GLOBAL_VERBOSE_LOGGING=false

# Global Feature Flags / 全局功能标志
GLOBAL_ENABLE_ADVANCED_ANALYTICS=true
GLOBAL_ENABLE_REAL_TIME_UPDATES=false
GLOBAL_ENABLE_GRAPH_VISUALIZATION=true
GLOBAL_ENABLE_TELEMETRY=false
```

#### Provider Priority Configuration / 提供者优先级配置

**Supported Providers / 支持的提供者:**
- `OPENAI` - Official OpenAI API
- `AZURE` - Azure OpenAI Service
- `ANTHROPIC` - Anthropic Claude API
- `LMSTUDIO` - Local LM Studio instance
- `AIPROXY` - AI Studio Proxy for Gemini
- `OLLAMA` - Local Ollama instance
- `CUSTOM` - Custom provider endpoint

**Provider Selection Logic / 提供者选择逻辑:**
1. Project-level `HIJACK_ACTIVE_PROVIDER` overrides global setting
2. If provider fails, fallback to next available provider
3. If all providers fail, fallback to Gemini native mode
4. Provider health checks determine availability

**Environment Variable Priority / 环境变量优先级:**
1. Project-level `./.gemini/.env` (highest priority)
2. Global-level `~/.gemini/.env`
3. System environment variables
4. Default configuration values (lowest priority)
```

#### Main Configuration / 主配置

**config.json Structure / config.json 结构:**
```json
{
  "version": "1.0.0",
  "projectId": "auto-generated-from-path",
  "debugMode": false,
  "contextAgent": {
    "enabled": true,
    "ragProvider": "lightrag",
    "knowledgeGraphProvider": "graphology",
    "vectorProvider": "local",
    "analysisMode": "static"
  },
  "taskManagement": {
    "enabled": true,
    "maxTasks": 50,
    "autoTaskCreation": true,
    "maintenanceMode": false
  },
  "storage": {
    "projectDataPath": "~/.gemini/projects/{project-id}",
    "taskDataPath": "~/.gemini/todos/{project-id}",
    "cacheExpiration": 86400000
  },
  "ui": {
    "theme": "default",
    "language": "auto",
    "showProgress": true,
    "verboseLogging": false
  }
}
```

### Requirement 11: Project-Isolated Context Storage Structure / 需求11：项目隔离的上下文存储结构 🔄 **需要完善 NEEDS ENHANCEMENT**

**User Story:** As a developer working on multiple projects, I want each project's context data (RAG, knowledge graphs, tasks) to be stored in clearly organized, project-isolated directories under ~/.gemini, so that I can maintain clean separation between different projects and easily manage project-specific context.

**用户故事：** 作为处理多个项目的开发者，我希望每个项目的上下文数据（RAG、知识图谱、任务）都存储在~/.gemini下清晰组织的、项目隔离的目录中，以便在不同项目之间保持清晰的分离并轻松管理项目特定的上下文。

#### Acceptance Criteria / 验收标准

1. 🔄 WHEN the system processes a project THEN it SHALL create a unique project identifier based on the absolute project path
   当系统处理项目时，应基于项目绝对路径创建唯一的项目标识符
   **实现状态：** 部分实现，需要标准化项目标识符生成规则

2. 🔄 WHEN storing project context data THEN the system SHALL organize it under ~/.gemini with clear directory structure
   当存储项目上下文数据时，系统应在~/.gemini下以清晰的目录结构组织它们
   **实现状态：** 需要完善和标准化目录结构

3. ❌ WHEN storing RAG data THEN it SHALL be saved to ~/.gemini/projects/{project-id}/rag/{provider}/
   当存储RAG数据时，应保存到~/.gemini/projects/{project-id}/rag/{provider}/
   **实现状态：** 需要实现模块化RAG提供者结构

4. ❌ WHEN storing knowledge graphs THEN they SHALL be saved to ~/.gemini/projects/{project-id}/knowledge-graph/{provider}/
   当存储知识图谱时，应保存到~/.gemini/projects/{project-id}/knowledge-graph/{provider}/
   **实现状态：** 需要实现模块化提供者结构

5. ✅ WHEN storing task data THEN it SHALL be saved to ~/.gemini/todos/{project-id}/
   当存储任务数据时，应保存到~/.gemini/todos/{project-id}/
   **实现状态：** 已实现

6. ❌ WHEN storing project metadata THEN it SHALL include creation time, last access, and storage paths
   当存储项目元数据时，应包含创建时间、最后访问时间和存储路径
   **实现状态：** 需要完善元数据结构

#### Required Directory Structure / 必需的目录结构

```
~/.gemini/
├── config.json              # 全局主配置
├── models.json              # 全局模型配置
├── openai.json              # 全局OpenAI配置
├── globalrules/             # 全局规则目录
│   ├── coding-standards.md  # 编码标准
│   ├── project-conventions.md # 项目约定
│   └── security-guidelines.md # 安全指南
├── memories/                # 全局记忆
│   └── Memory.md            # 全局记忆文件
├── projects/                # 项目特定数据
│   └── {project-id}/        # 项目标识符目录 (基于绝对路径生成)
│       ├── project_meta.json # 项目元数据
│       │   # {
│       │   #   "projectPath": "/absolute/path/to/project",
│       │   #   "directoryName": "-absolute-path-to-project",
│       │   #   "createdAt": "2025-01-16T...",
│       │   #   "lastAccessAt": "2025-01-16T...",
│       │   #   "ragProvider": "lightrag",
│       │   #   "knowledgeGraphProvider": "graphology"
│       │   # }
│       ├── context.json     # 项目上下文缓存 (24小时过期)
│       ├── rag/             # RAG系统数据 (模块化提供者)
│       │   ├── lightrag/    # LightRAG提供者数据
│       │   │   ├── vectors/ # 向量存储
│       │   │   ├── graph/   # 图数据库
│       │   │   └── index/   # 索引文件
│       │   ├── llamaindex/  # LlamaIndex提供者数据
│       │   │   ├── storage/ # 存储目录
│       │   │   └── cache/   # 缓存目录
│       │   └── custom/      # 自定义RAG提供者
│       │       └── data/    # 自定义数据格式
│       └── knowledge-graph/ # 知识图谱 (模块化提供者)
│           ├── graphology/  # Graphology提供者
│           │   ├── nodes.json    # 节点数据
│           │   ├── edges.json    # 边数据
│           │   └── statistics.json # 统计信息
│           ├── neo4j/       # Neo4j提供者
│           │   ├── dump.cypher   # Cypher导出
│           │   └── config.json   # 连接配置
│           └── networkx/    # NetworkX提供者
│               ├── graph.pickle  # 序列化图数据
│               └── metadata.json # 元数据
└── todos/                   # 任务管理数据
    └── {project-id}/        # 项目任务目录
        ├── todo_context.json # 任务列表
        │   # [
        │   #   {
        │   #     "id": "task_...",
        │   #     "description": "任务描述",
        │   #     "status": "pending|in_progress|completed",
        │   #     "createdAt": "2025-01-16T...",
        │   #     "completedAt": "2025-01-16T..."
        │   #   }
        │   # ]
        └── current_task.txt  # 当前任务ID
```

#### Project Configuration Structure / 项目配置结构

**Project-Level Configuration / 项目级配置:**
```
{project-root}/
└── .gemini/
    ├── config.json         # 项目主配置 (覆盖全局配置)
    ├── models.json         # 项目模型配置
    ├── openai.json         # 项目OpenAI配置
    ├── localrules/         # 项目特定规则
    │   ├── architecture.md # 架构规范
    │   ├── workflow.md     # 工作流程
    │   └── team-standards.md # 团队标准
    └── memories/           # 项目特定记忆
        └── Memory.md       # 项目记忆文件
```

#### Provider Configuration Examples / 提供者配置示例

**RAG Provider Configuration / RAG提供者配置:**
```json
{
  "ragProvider": {
    "type": "lightrag",
    "config": {
      "vectorDimension": 1536,
      "chunkSize": 512,
      "chunkOverlap": 50,
      "indexType": "faiss",
      "embeddingModel": "text-embedding-ada-002"
    },
    "fallback": {
      "type": "simple",
      "config": {
        "maxResults": 10,
        "similarityThreshold": 0.7
      }
    }
  }
}
```

**Knowledge Graph Provider Configuration / 知识图谱提供者配置:**
```json
{
  "knowledgeGraphProvider": {
    "type": "graphology",
    "config": {
      "directed": true,
      "allowSelfLoops": false,
      "type": "mixed",
      "indexing": ["name", "type", "filePath"]
    },
    "fallback": {
      "type": "memory",
      "config": {
        "maxNodes": 10000,
        "maxEdges": 50000
      }
    }
  }
}
```

## Context Processing Architecture / 上下文处理架构

### Context Flow Overview / 上下文流程概览

The system implements a sophisticated multi-layered context processing architecture that handles user input and model responses through several integrated components:

系统实现了复杂的多层上下文处理架构，通过多个集成组件处理用户输入和模型响应：

#### 1. Input Processing Pipeline / 输入处理管道

```
用户输入 → MessageProcessor → ContextAgent → ContextInjector → 增强系统提示
User Input → MessageProcessor → ContextAgent → ContextInjector → Enhanced System Prompt
```

**Components / 组件:**
- **MessageProcessor**: Preprocesses user messages, detects complex workflows, filters thinking content
  **消息处理器**: 预处理用户消息，检测复杂工作流，过滤思考内容
- **ContextAgent**: Real-time analysis and context injection into dynamic system
  **上下文代理**: 实时分析并将上下文注入动态系统
- **ContextInjector**: Manages context injection for both user input and model responses
  **上下文注入器**: 管理用户输入和模型响应的上下文注入

#### 2. Context Structure Hierarchy / 上下文结构层次

The system organizes context into four distinct layers managed by `StandardContextIntegrator`:

系统将上下文组织为由`StandardContextIntegrator`管理的四个不同层次：

```typescript
interface StandardContext {
  system: SystemContext;      // 系统上下文 - 运行环境和会话状态
  static: StaticContext;      // 静态上下文 - 项目文件、规则、记忆
  dynamic: DynamicContext;    // 动态上下文 - 运行时状态和操作历史
  task: TaskContext;          // 任务上下文 - 当前任务管理状态
}
```

**System Context / 系统上下文:**
- Working directory, session ID, timestamp
- Available tools and capabilities
- Runtime environment information
- 工作目录、会话ID、时间戳
- 可用工具和功能
- 运行时环境信息

**Static Context / 静态上下文:**
- Global and project-specific rules
- Global and project-specific memories
- Project structure, dependencies, documentation
- Git status and configuration files
- 全局和项目特定规则
- 全局和项目特定记忆
- 项目结构、依赖、文档
- Git状态和配置文件

**Dynamic Context / 动态上下文:**
- Recent operations and runtime information
- Error history and user instructions
- ContextAgent-generated layered content
- Real-time analysis results
- 最近操作和运行时信息
- 错误历史和用户指令
- ContextAgent生成的分层内容
- 实时分析结果

**Task Context / 任务上下文:**
- Current task and workflow template
- Task list with progress tracking
- Maintenance mode status
- Task completion guidance
- 当前任务和工作流模板
- 带进度跟踪的任务列表
- 维护模式状态
- 任务完成指导

#### 3. Context Enhancement Process / 上下文增强过程

```
基础系统提示 → 静态上下文注入 → 动态上下文注入 → 任务上下文注入 → 工具指导 → 最终提示
Base System Prompt → Static Context → Dynamic Context → Task Context → Tool Guidance → Final Prompt
```

**Implementation / 实现:**
- `getEnhancedSystemPromptIfAvailable()` orchestrates the entire enhancement process
- `PromptEnhancer` and `ContextWrapper` manage prompt building
- `StandardContextIntegrator` formats context for model consumption
- Debug mode saves memory context snapshots for analysis

## Multi-Turn Conversation Drive Mode / 多轮会话驱动模式

### Conversation Flow Architecture / 会话流程架构

The system implements a sophisticated multi-turn conversation management system with different handling modes for user messages and tool responses:

系统实现了复杂的多轮会话管理系统，对用户消息和工具响应采用不同的处理模式：

#### 1. Turn-Based Processing / 基于轮次的处理

```
轮次开始 → 请求分类 → 上下文注入 → 模型调用 → 响应处理 → 轮次结束
Turn Start → Request Classification → Context Injection → Model Call → Response Processing → Turn End
```

**Turn Management / 轮次管理:**
- Each interaction generates a unique turn ID for tracking
- Debug logging captures complete turn lifecycle
- Context state is maintained across turns
- Tool call tracking spans multiple turns
- 每次交互生成唯一的轮次ID进行跟踪
- 调试日志捕获完整的轮次生命周期
- 上下文状态在轮次间保持
- 工具调用跟踪跨越多个轮次

#### 2. Request Classification / 请求分类

The system automatically classifies incoming requests into two main categories:

系统自动将传入请求分类为两个主要类别：

**User Message Flow / 用户消息流程:**
```typescript
async *handleUserMessage(request, signal, prompt_id) {
  // 1. Clear processed tool calls
  // 2. Generate turn ID and preprocess message
  // 3. Add to conversation history
  // 4. Inject user input context
  // 5. Build enhanced messages
  // 6. Handle model response
  // 7. Finalize turn
}
```

**Tool Response Flow / 工具响应流程:**
```typescript
async *handleToolResponse(request, signal, prompt_id) {
  // 1. Extract tool results
  // 2. Log tool execution
  // 3. Process tool call completion
  // 4. Format results for model
  // 5. Build continuation messages
  // 6. Handle model response
  // 7. Finalize turn
}
```

#### 3. Context Injection Strategy / 上下文注入策略

**For User Messages / 用户消息:**
- Real-time context analysis via ContextAgent
- Dynamic context clearing and regeneration
- Project-specific context loading
- Task-aware context enhancement
- 通过ContextAgent进行实时上下文分析
- 动态上下文清理和重新生成
- 项目特定上下文加载
- 任务感知的上下文增强

**For Tool Responses / 工具响应:**
- Tool result integration into context
- Post-processing via ToolCallInterceptor
- Context state updates based on tool outcomes
- Continuation context preparation
- 工具结果集成到上下文中
- 通过ToolCallInterceptor进行后处理
- 基于工具结果的上下文状态更新
- 延续上下文准备

#### 4. Conversation History Management / 对话历史管理

**ConversationHistoryManager Features / 对话历史管理器功能:**
- Automatic history trimming with configurable limits
- Thinking content filtering for clean history
- Role-based message organization
- Statistics tracking and analysis
- 可配置限制的自动历史修剪
- 思考内容过滤以保持历史清洁
- 基于角色的消息组织
- 统计跟踪和分析

**History Preservation Strategy / 历史保存策略:**
- System messages are preserved during trimming
- Recent user and assistant messages are prioritized
- Context-relevant information is maintained
- Cross-turn tool call relationships are tracked
- 修剪期间保留系统消息
- 优先保留最近的用户和助手消息
- 维护上下文相关信息
- 跟踪跨轮次工具调用关系

#### 5. State Management Across Turns / 跨轮次状态管理

**Persistent State / 持久状态:**
- Task management state (maintenance mode, current task)
- Project context cache (24-hour expiration)
- Tool call processing history
- User preferences and workflow patterns
- 任务管理状态（维护模式、当前任务）
- 项目上下文缓存（24小时过期）
- 工具调用处理历史
- 用户偏好和工作流模式

**Session State / 会话状态:**
- Conversation history and context
- Active tool calls and their results
- Debug logging and performance metrics
- Model-specific adaptation settings
- 对话历史和上下文
- 活跃工具调用及其结果
- 调试日志和性能指标
- 模型特定适应设置
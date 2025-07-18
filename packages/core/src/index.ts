/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export config
export * from './config/config.js';

// Export Core Logic
export * from './core/client.js';
export * from './core/contentGenerator.js';
export * from './core/geminiChat.js';
export * from './core/logger.js';
export * from './core/prompts.js';
export * from './core/tokenLimits.js';
export * from './core/turn.js';
export * from './core/geminiRequest.js';
export * from './core/coreToolScheduler.js';
export * from './core/nonInteractiveToolExecutor.js';

export * from './code_assist/codeAssist.js';
export * from './code_assist/oauth2.js';
export * from './code_assist/server.js';
export * from './code_assist/types.js';

// Export utilities
export * from './utils/paths.js';
export * from './utils/schemaValidator.js';
export * from './utils/errors.js';
export * from './utils/getFolderStructure.js';
export * from './utils/memoryDiscovery.js';
export * from './utils/gitIgnoreParser.js';
export * from './utils/editor.js';
export * from './utils/quotaErrorDetection.js';

// Export services
export * from './services/fileDiscoveryService.js';
export * from './services/gitService.js';

// Export base tool definitions
export * from './tools/tool-registry.js';
// Export specific types from tools.js to avoid conflicts
export { 
  Tool, 
  ToolResult, 
  ToolConfirmationOutcome, 
  ToolCallConfirmationDetails, 
  ToolExecuteConfirmationDetails, 
  ToolMcpConfirmationDetails, 
  ToolConfirmationPayload, 
  ToolResultDisplay,
  BaseTool
} from './tools/tools.js';

// Export specific tool logic
export * from './tools/read-file.js';
export * from './tools/ls.js';
export * from './tools/grep.js';
export * from './tools/glob.js';
export * from './tools/edit.js';
export * from './tools/write-file.js';
export * from './tools/web-fetch.js';
export * from './tools/memoryTool.js';
export * from './tools/shell.js';
export * from './tools/web-search.js';
export * from './tools/read-many-files.js';
export * from './tools/mcp-client.js';
export * from './tools/mcp-tool.js';
export * from './tools/create_tasks.js';
export * from './tools/get_current_task.js';
export * from './tools/finish_current_task.js';
export * from './tools/get_next_task.js';
export * from './tools/insert_task.js';
export * from './tools/modify_task.js';
export * from './tools/workflow_template.js';
export * from './tools/migrate_project_data.js';
export * from './tools/save_memory.js';
export * from './tools/view_memories.js';
export * from './tools/todo.js';

// Export telemetry functions
export * from './telemetry/index.js';
export { sessionId } from './utils/session.js';

// Export session history management
export * from './context/sessionHistory.js';
export * from './context/sessionRestorer.js';

// Export context system
export * from './context/contextAgent.js';

// Export bacterial programming modules (with explicit naming to avoid conflicts)
export {
  OpenAIHijackConfig,
  ToolCall as OpenAIToolCall,
  ConversationMessage,
  ContentMarkers,
  PathMapping,
  ToolCategories,
  ContentIsolator,
  ToolClassifier,
  PathProcessor,
  ToolParser,
  ConversationManager,
  ResponseProcessor,
  StreamAdapter,
  OpenAIClient,
  ToolFormatter as OpenAIToolFormatter
} from './openai/modules/index.js';

export {
  PromptBuilder,
  ToolFormatter as GuidanceToolFormatter,
  SyntaxValidator,
  ValidationResult,
  ToolCallExtraction,
  ValidationSummary,
  DevelopmentStrategy,
  AnalysisStrategy,
  WorkflowStrategy
} from './tools/guidance/index.js';

// Export slim implementations
export * from './openai/hijack-slim.js';
export * from './core/prompts-slim.js';

// Main System Coordinator
export * from './system/SystemCoordinator.js';

// Unified Context Management
export * from './context/UnifiedContextManager.js';
export * from './context/ContextHistorySeparator.js';
export * from './context/IntegratedContextManager.js';

// Unified Tool System
export * from './tools/UnifiedToolSystem.js';
export * from './tools/ToolManager.js';

// Task Management
export * from './tasks/TaskManager.js';

// Unified System Orchestrator
export * from './system/UnifiedSystemOrchestrator.js';

// Individual Tools - Note: These are the new unified tools
// export * from './tools/CreateTasksTool.js';
// export * from './tools/GetCurrentTaskTool.js';
// export * from './tools/FinishCurrentTaskTool.js';
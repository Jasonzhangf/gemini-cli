/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';
import { UnifiedSystemOrchestrator, SystemModule } from './UnifiedSystemOrchestrator.js';
import { UnifiedContextManager } from '../context/UnifiedContextManager.js';
import { UnifiedToolSystem, ToolCallFormat } from '../tools/UnifiedToolSystem.js';
import { ContextualMessage, ContextType } from '../context/ContextHistorySeparator.js';
import { SystemPromptCleaner } from '../context/SystemPromptCleaner.js';
import { Config } from '../config/config.js';

/**
 * System state
 */
export interface SystemState {
  isInMaintenanceMode: boolean;
  currentTask?: any;
  availableTools: string[];
  conversationLength: number;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  systemContext: string;
  userContext: string;
  toolCalls: any[];
  toolResults: any[];
  state: SystemState;
}

/**
 * SystemCoordinator class
 * Coordinates context management and tool execution through UnifiedSystemOrchestrator
 */
export class SystemCoordinator extends EventEmitter {
  private orchestrator: UnifiedSystemOrchestrator;
  private contextManager: UnifiedContextManager;
  private toolSystem: UnifiedToolSystem;
  private conversation: ContextualMessage[] = [];
  private projectId: string;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private config: Config;
  
  constructor(projectId: string, config: Config) {
    super();
    this.projectId = projectId;
    this.config = config;
    
    // Initialize the unified orchestrator as the single entry point
    this.orchestrator = new UnifiedSystemOrchestrator(config);
    
    // Initialize legacy systems for backward compatibility
    this.contextManager = new UnifiedContextManager(projectId);
    this.toolSystem = new UnifiedToolSystem(projectId);
    
    // Disable RAG explanations by default (now handled by orchestrator)
    this.contextManager.setIncludeRagExplanations(false);
    
    // Set up event forwarding
    this.setupEventForwarding();
  }
  
  /**
   * Initialize the system coordinator
   * @param projectDir Project directory
   * @param sessionId Session ID
   */
  async initialize(projectDir: string, sessionId: string): Promise<void> {
    try {
      // Initialize the unified orchestrator
      await this.orchestrator.initialize(projectDir, sessionId);
      
      // Get initialized subsystems from orchestrator
      const contextAgent = this.orchestrator.getContextAgent();
      const toolSystem = this.orchestrator.getToolSystem();
      
      // Update references if available
      if (toolSystem) {
        this.toolSystem = toolSystem;
      }
      
      this.emit('initialized', { projectDir, sessionId });
    } catch (error) {
      console.error('[SystemCoordinator] 初始化失败:', error);
      this.emit('initializationFailed', { error });
      throw error;
    }
  }
  
  /**
   * Process user input
   * @param input User input
   * @returns Processing result
   */
  public async processInput(input: string): Promise<ProcessingResult> {
    if (this.isProcessing) {
      throw new Error("Already processing input. Call stopProcessing() first.");
    }
    
    this.isProcessing = true;
    this.shouldStop = false;
    
    try {
      // Add user message to conversation
      const userMessage: ContextualMessage = {
        role: 'user',
        content: input,
        contextType: ContextType.USER,
      };
      
      this.conversation.push(userMessage);
      
      // Use unified orchestrator to generate complete system context
      let systemContext = '';
      let userContext = input;
      
      if (this.orchestrator.isSystemInitialized()) {
        try {
          // Generate unified system context using the orchestrator
          systemContext = await this.orchestrator.generateSystemContext(input, this.conversation);
          
          if (this.config.getDebugMode()) {
            console.log('[SystemCoordinator] 使用统一编排器生成系统上下文');
          }
        } catch (error) {
          console.warn('[SystemCoordinator] 统一编排器失败，回退到传统上下文管理:', error);
          
          // Fallback to legacy context manager
          const contextResult = await this.contextManager.processInput(input, this.conversation);
          systemContext = contextResult.systemContext;
          userContext = contextResult.userContext;
          this.conversation = contextResult.history;
        }
      } else {
        console.warn('[SystemCoordinator] 统一编排器未初始化，使用传统上下文管理');
        
        // Fallback to legacy context manager
        const contextResult = await this.contextManager.processInput(input, this.conversation);
        systemContext = contextResult.systemContext;
        userContext = contextResult.userContext;
        this.conversation = contextResult.history;
      }
      
      // Get current system state
      const state = this.getSystemState();
      
      return {
        systemContext,
        userContext,
        toolCalls: [],
        toolResults: [],
        state,
      };
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process model response
   * @param response Model response
   * @param format Tool call format
   * @returns Processing result with executed tools
   */
  public async processModelResponse(
    response: string,
    format: ToolCallFormat = ToolCallFormat.JSON
  ): Promise<ProcessingResult> {
    if (this.isProcessing) {
      throw new Error("Already processing response. Call stopProcessing() first.");
    }
    
    this.isProcessing = true;
    this.shouldStop = false;
    
    try {
      // Add model message to conversation
      const modelMessage: ContextualMessage = {
        role: 'assistant',
        content: response,
        contextType: ContextType.MODEL,
      };
      
      this.conversation.push(modelMessage);
      
      // Extract context from model response
      await this.contextManager.processModelResponse(response);
      
      // Parse tool calls
      const toolCalls = this.toolSystem.parseToolCalls(response, format);
      
      // Execute tools
      const toolResults = [];
      
      for (const toolCall of toolCalls) {
        if (this.shouldStop) {
          break;
        }
        
        const { name, parameters } = toolCall;
        
        // Create tool call message
        const toolCallMessage: ContextualMessage = {
          role: 'function',
          content: JSON.stringify({ name, arguments: parameters }),
          contextType: ContextType.TOOL_CALL,
        };
        
        this.conversation.push(toolCallMessage);
        
        // Execute tool
        const result = await this.toolSystem.executeTool(name, parameters);
        
        // Create tool result message
        const toolResultMessage: ContextualMessage = {
          role: 'tool',
          content: JSON.stringify(result),
          contextType: ContextType.TOOL_RESULT,
        };
        
        this.conversation.push(toolResultMessage);
        toolResults.push(result);
      }
      
      // Get current system state
      const state = this.getSystemState();
      
      // Process context again to ensure it's up to date
      const contextResult = await this.contextManager.processInput('', this.conversation);
      
      return {
        systemContext: contextResult.systemContext,
        userContext: contextResult.userContext,
        toolCalls,
        toolResults,
        state,
      };
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Stop processing
   */
  public stopProcessing(): void {
    this.shouldStop = true;
    this.emit('processingStop');
  }
  
  /**
   * Get current system state
   * @returns System state
   */
  public getSystemState(): SystemState {
    const taskManager = this.toolSystem.getTaskManager();
    const isInMaintenanceMode = taskManager.isMaintenanceMode();
    
    return {
      isInMaintenanceMode,
      currentTask: taskManager.getCurrentTask(),
      availableTools: this.toolSystem.getToolDefinitions().map(t => t.name),
      conversationLength: this.conversation.length,
    };
  }
  
  /**
   * Clear conversation history
   */
  public clearConversation(): void {
    this.conversation = [];
    this.emit('conversationCleared');
  }
  
  /**
   * Set up event forwarding from child components
   */
  private setupEventForwarding(): void {
    // Forward orchestrator events
    this.orchestrator.on('initialized', (data) => {
      this.emit('orchestratorInitialized', data);
    });
    
    this.orchestrator.on('contextGenerated', (data) => {
      this.emit('contextGenerated', data);
    });
    
    this.orchestrator.on('moduleStatusChanged', (data) => {
      this.emit('moduleStatusChanged', data);
    });
    
    this.orchestrator.on('configurationUpdated', (data) => {
      this.emit('configurationUpdated', data);
    });
    
    // Forward context manager events (legacy support)
    this.contextManager.on('contextGenerated', (data) => {
      this.emit('legacyContextGenerated', data);
    });
    
    this.contextManager.on('error', (data) => {
      this.emit('contextError', data);
    });
    
    // Forward tool system events
    this.toolSystem.on('toolExecuted', (data) => {
      this.emit('toolExecuted', data);
    });
    
    this.toolSystem.on('toolAvailabilityChanged', (data) => {
      this.emit('toolAvailabilityChanged', data);
    });
    
    this.toolSystem.on('maintenanceModeEntered', (data) => {
      this.emit('maintenanceModeEntered', data);
    });
    
    this.toolSystem.on('maintenanceModeExited', (data) => {
      this.emit('maintenanceModeExited', data);
    });
    
    this.toolSystem.on('error', (data) => {
      this.emit('toolError', data);
    });
  }
  
  /**
   * Get the context manager
   * @returns Unified context manager
   */
  public getContextManager(): UnifiedContextManager {
    return this.contextManager;
  }
  
  /**
   * Get the tool system
   * @returns Unified tool system
   */
  public getToolSystem(): UnifiedToolSystem {
    return this.toolSystem;
  }
  
  /**
   * Get the unified system orchestrator
   * @returns Unified system orchestrator
   */
  public getOrchestrator(): UnifiedSystemOrchestrator {
    return this.orchestrator;
  }
  
  /**
   * Enable/disable a system module
   * @param module System module
   * @param enabled Whether to enable the module
   */
  public setModuleEnabled(module: SystemModule, enabled: boolean): void {
    this.orchestrator.setModuleEnabled(module, enabled);
    this.emit('moduleStatusChanged', { module, enabled });
  }
  
  /**
   * Check if a module is enabled
   * @param module System module
   * @returns Whether the module is enabled
   */
  public isModuleEnabled(module: SystemModule): boolean {
    return this.orchestrator.isModuleEnabled(module);
  }
  
  /**
   * Get enabled modules
   * @returns List of enabled modules
   */
  public getEnabledModules(): SystemModule[] {
    return this.orchestrator.getEnabledModules();
  }
  
  /**
   * Clear module cache
   */
  public clearModuleCache(): void {
    this.orchestrator.clearModuleCache();
    this.emit('moduleCacheCleared');
  }
}
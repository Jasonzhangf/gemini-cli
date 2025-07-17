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
import { UnifiedContextManager } from '../context/UnifiedContextManager.js';
import { UnifiedToolSystem, ToolCallFormat } from '../tools/UnifiedToolSystem.js';
import { ContextualMessage, ContextType } from '../context/ContextHistorySeparator.js';
import { SystemPromptCleaner } from '../context/SystemPromptCleaner.js';

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
 * Coordinates context management and tool execution
 */
export class SystemCoordinator extends EventEmitter {
  private contextManager: UnifiedContextManager;
  private toolSystem: UnifiedToolSystem;
  private conversation: ContextualMessage[] = [];
  private projectId: string;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  
  constructor(projectId: string) {
    super();
    this.projectId = projectId;
    this.contextManager = new UnifiedContextManager(projectId);
    this.toolSystem = new UnifiedToolSystem(projectId);
    
    // Disable RAG explanations by default
    this.contextManager.setIncludeRagExplanations(false);
    
    // Set up event forwarding
    this.setupEventForwarding();
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
      
      // Process input with context manager
      const contextResult = await this.contextManager.processInput(input, this.conversation);
      
      // Update conversation with processed history
      this.conversation = contextResult.history;
      
      // Get current system state
      const state = this.getSystemState();
      
      return {
        systemContext: contextResult.systemContext,
        userContext: contextResult.userContext,
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
    // Forward context manager events
    this.contextManager.on('contextGenerated', (data) => {
      this.emit('contextGenerated', data);
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
}
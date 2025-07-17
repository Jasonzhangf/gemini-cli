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
import { TaskManager } from '../tasks/TaskManager';
import { CreateTasksTool } from './CreateTasksTool';
import { GetCurrentTaskTool } from './GetCurrentTaskTool';
import { FinishCurrentTaskTool } from './FinishCurrentTaskTool';

/**
 * Tool interface
 */
export interface Tool {
  execute(input: any): Promise<any>;
  getDefinition(): any;
}

/**
 * Tool availability mode
 */
export enum ToolAvailabilityMode {
  NORMAL = 'normal',
  MAINTENANCE = 'maintenance',
  ALWAYS = 'always',
}

/**
 * Tool registration
 */
export interface ToolRegistration {
  tool: Tool;
  availabilityMode: ToolAvailabilityMode;
}

/**
 * ToolManager class
 * Manages tool availability based on system state
 */
export class ToolManager extends EventEmitter {
  private tools: Map<string, ToolRegistration> = new Map();
  private taskManager: TaskManager;
  
  constructor(taskManager: TaskManager) {
    super();
    this.taskManager = taskManager;
    
    // Register built-in task management tools
    this.registerTaskTools();
    
    // Set up event listeners for maintenance mode changes
    this.setupEventListeners();
  }
  
  /**
   * Register a tool
   * @param name Tool name
   * @param tool Tool instance
   * @param availabilityMode When the tool is available
   */
  public registerTool(
    name: string,
    tool: Tool,
    availabilityMode: ToolAvailabilityMode = ToolAvailabilityMode.ALWAYS
  ): void {
    this.tools.set(name, {
      tool,
      availabilityMode,
    });
    
    this.emit('toolRegistered', { name, availabilityMode });
  }
  
  /**
   * Get available tools based on current system state
   * @returns Available tools
   */
  public getAvailableTools(): Tool[] {
    const isMaintenanceMode = this.taskManager.isMaintenanceMode();
    const availableTools: Tool[] = [];
    
    for (const [name, registration] of this.tools.entries()) {
      const { tool, availabilityMode } = registration;
      
      // Check if tool is available in current mode
      if (
        availabilityMode === ToolAvailabilityMode.ALWAYS ||
        (isMaintenanceMode && availabilityMode === ToolAvailabilityMode.MAINTENANCE) ||
        (!isMaintenanceMode && availabilityMode === ToolAvailabilityMode.NORMAL)
      ) {
        availableTools.push(tool);
      }
    }
    
    return availableTools;
  }
  
  /**
   * Get tool definitions for OpenAI function calling
   * @returns Tool definitions
   */
  public getToolDefinitions(): any[] {
    return this.getAvailableTools().map(tool => tool.getDefinition());
  }
  
  /**
   * Execute a tool by name
   * @param name Tool name
   * @param input Tool input
   * @returns Tool result
   */
  public async executeTool(name: string, input: any): Promise<any> {
    const registration = this.tools.get(name);
    
    if (!registration) {
      throw new Error(`Tool "${name}" not found`);
    }
    
    const { tool, availabilityMode } = registration;
    const isMaintenanceMode = this.taskManager.isMaintenanceMode();
    
    // Check if tool is available in current mode
    if (
      availabilityMode !== ToolAvailabilityMode.ALWAYS &&
      ((isMaintenanceMode && availabilityMode !== ToolAvailabilityMode.MAINTENANCE) ||
       (!isMaintenanceMode && availabilityMode !== ToolAvailabilityMode.NORMAL))
    ) {
      throw new Error(
        `Tool "${name}" is not available in ${isMaintenanceMode ? 'maintenance' : 'normal'} mode`
      );
    }
    
    try {
      const result = await tool.execute(input);
      this.emit('toolExecuted', { name, input, result, success: true });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('toolExecuted', { 
        name, 
        input, 
        error: errorMessage, 
        success: false 
      });
      throw error;
    }
  }
  
  /**
   * Register built-in task management tools
   */
  private registerTaskTools(): void {
    // Create tasks tool - only available in normal mode
    this.registerTool(
      'create_tasks',
      new CreateTasksTool(this.taskManager),
      ToolAvailabilityMode.NORMAL
    );
    
    // Get current task tool - always available
    this.registerTool(
      'get_current_task',
      new GetCurrentTaskTool(this.taskManager),
      ToolAvailabilityMode.ALWAYS
    );
    
    // Finish current task tool - only available in maintenance mode
    this.registerTool(
      'finish_current_task',
      new FinishCurrentTaskTool(this.taskManager),
      ToolAvailabilityMode.MAINTENANCE
    );
  }
  
  /**
   * Set up event listeners for maintenance mode changes
   */
  private setupEventListeners(): void {
    // Listen for maintenance mode changes to update tool availability
    this.taskManager.on('maintenanceModeEntered', () => {
      this.emit('toolAvailabilityChanged', { 
        mode: 'maintenance',
        availableTools: this.getToolDefinitions().map(t => t.name)
      });
    });
    
    this.taskManager.on('maintenanceModeExited', () => {
      this.emit('toolAvailabilityChanged', { 
        mode: 'normal',
        availableTools: this.getToolDefinitions().map(t => t.name)
      });
    });
  }
}
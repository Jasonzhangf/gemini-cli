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
import { TaskManager } from '../tasks/TaskManager.js';
import { ToolManager, Tool, ToolAvailabilityMode } from './ToolManager.js';
// Legacy system - consider for removal
// import { CreateTasksTool } from './create_tasks.js';
// Legacy imports - tools removed, use main config-registered tools instead
// import { GetCurrentTaskTool } from './GetCurrentTaskTool.js';
// import { FinishCurrentTaskTool } from './FinishCurrentTaskTool.js';

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  result: any;
  error?: string;
}

/**
 * Tool call format
 */
export enum ToolCallFormat {
  JSON = 'json',
  DESCRIPTIVE = 'descriptive',
  CONTENT_ISOLATION = 'content_isolation',
}

/**
 * UnifiedToolSystem class
 * Single entry point for all tool operations
 */
export class UnifiedToolSystem extends EventEmitter {
  private toolManager: ToolManager;
  private taskManager: TaskManager;
  
  constructor(projectId: string) {
    super();
    this.taskManager = new TaskManager(projectId);
    this.toolManager = new ToolManager(this.taskManager);
    
    // Forward events from the tool manager
    this.toolManager.on('toolRegistered', (data) => {
      this.emit('toolRegistered', data);
    });
    
    this.toolManager.on('toolExecuted', (data) => {
      this.emit('toolExecuted', data);
    });
    
    this.toolManager.on('toolAvailabilityChanged', (data) => {
      this.emit('toolAvailabilityChanged', data);
    });
    
    // Forward events from the task manager
    this.taskManager.on('maintenanceModeEntered', (data) => {
      this.emit('maintenanceModeEntered', data);
    });
    
    this.taskManager.on('maintenanceModeExited', (data) => {
      this.emit('maintenanceModeExited', data);
    });
    
    this.taskManager.on('taskCreated', (data) => {
      this.emit('taskCreated', data);
    });
    
    this.taskManager.on('taskUpdated', (data) => {
      this.emit('taskUpdated', data);
    });
    
    this.taskManager.on('currentTaskSet', (data) => {
      this.emit('currentTaskSet', data);
    });
  }
  
  /**
   * Register a custom tool
   * @param name Tool name
   * @param tool Tool implementation
   * @param availabilityMode When the tool is available
   */
  public registerTool(
    name: string,
    tool: Tool,
    availabilityMode: ToolAvailabilityMode = ToolAvailabilityMode.ALWAYS
  ): void {
    this.toolManager.registerTool(name, tool, availabilityMode);
  }
  
  /**
   * Get available tool definitions for the current mode
   * @returns Tool definitions
   */
  public getToolDefinitions(): any[] {
    return this.toolManager.getToolDefinitions();
  }
  
  /**
   * Execute a tool by name
   * @param name Tool name
   * @param input Tool input
   * @returns Tool execution result
   */
  public async executeTool(name: string, input: any): Promise<ToolExecutionResult> {
    try {
      const result = await this.toolManager.executeTool(name, input);
      return {
        success: true,
        toolName: name,
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        toolName: name,
        result: null,
        error: errorMessage,
      };
    }
  }
  
  /**
   * Parse tool calls from model response
   * LEGACY: This method is deprecated, use OpenAI ToolCallParser instead
   * @param content Model response content
   * @param format Tool call format
   * @returns Parsed tool calls
   */
  public parseToolCalls(content: string, format: ToolCallFormat = ToolCallFormat.JSON): any[] {
    console.warn('[UnifiedToolSystem] DEPRECATED: Use OpenAI ToolCallParser for tool parsing');
    // Legacy fallback implementation
    return [];
  }
  
  /**
   * Parse JSON format tool calls
   * LEGACY: Deprecated, use OpenAI ToolCallParser
   * @param content Model response content
   * @returns Parsed tool calls
   */
  private parseJsonToolCalls(content: string): any[] {
    try {
      // Try to extract JSON object from content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonContent = JSON.parse(jsonMatch[0]);
        if (jsonContent.tool_calls) {
          return jsonContent.tool_calls;
        }
      }
      
      // Check for function_call format
      const functionMatch = content.match(/"function_call"\s*:\s*\{[\s\S]*?\}/);
      if (functionMatch) {
        const functionContent = JSON.parse(`{${functionMatch[0]}}`);
        if (functionContent.function_call) {
          const { name, arguments: args } = functionContent.function_call;
          return [{
            name,
            parameters: typeof args === 'string' ? JSON.parse(args) : args,
          }];
        }
      }
      
      return [];
    } catch (error) {
      this.emit('error', { type: 'parse_json_tool_calls', error });
      return [];
    }
  }
  
  /**
   * Parse descriptive format tool calls
   * @param content Model response content
   * @returns Parsed tool calls
   */
  private parseDescriptiveToolCalls(content: string): any[] {
    try {
      const toolCalls = [];
      
      // Look for tool call patterns like "Tool: tool_name\nParam1: value1\nParam2: value2"
      const toolMatches = content.match(/Tool:\s*([^\n]+)(?:\n(?:[^:]+):\s*([^\n]+))*/g);
      
      if (toolMatches) {
        for (const match of toolMatches) {
          const nameMatch = match.match(/Tool:\s*([^\n]+)/);
          if (!nameMatch) continue;
          
          const name = nameMatch[1].trim();
          const parameters: Record<string, any> = {};
          
          // Extract parameters
          const paramMatches = match.matchAll(/([^:]+):\s*([^\n]+)/g);
          for (const paramMatch of paramMatches) {
            const paramName = paramMatch[1].trim();
            if (paramName.toLowerCase() === 'tool') continue;
            
            const paramValue = paramMatch[2].trim();
            parameters[paramName] = paramValue;
          }
          
          toolCalls.push({ name, parameters });
        }
      }
      
      // Also look for [tool_call: tool_name] format
      const bracketMatches = content.match(/\[tool_call:\s*([^\]]+)\s+for\s+([^\]]+)\]/g);
      if (bracketMatches) {
        for (const match of bracketMatches) {
          const parts = match.match(/\[tool_call:\s*([^\]]+)\s+for\s+([^\]]+)\]/);
          if (!parts) continue;
          
          const name = parts[1].trim();
          const paramString = parts[2].trim();
          
          try {
            // Try to parse parameters as JSON
            const parameters = JSON.parse(paramString);
            toolCalls.push({ name, parameters });
          } catch (e) {
            // If not valid JSON, add as raw string
            toolCalls.push({ name, parameters: { input: paramString } });
          }
        }
      }
      
      return toolCalls;
    } catch (error) {
      this.emit('error', { type: 'parse_descriptive_tool_calls', error });
      return [];
    }
  }
  
  /**
   * Parse content isolation format tool calls
   * @param content Model response content
   * @returns Parsed tool calls
   */
  private parseContentIsolationToolCalls(content: string): any[] {
    try {
      const toolCalls = [];
      
      // Look for content isolation markers
      const isolationMatches = content.match(/<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g);
      
      if (isolationMatches) {
        for (const match of isolationMatches) {
          const contentMatch = match.match(/<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/);
          if (!contentMatch) continue;
          
          const isolatedContent = contentMatch[1].trim();
          
          try {
            // Try to parse as JSON
            const parsedContent = JSON.parse(isolatedContent);
            const { tool, ...parameters } = parsedContent;
            
            if (tool) {
              toolCalls.push({ name: tool, parameters });
            }
          } catch (e) {
            // If not valid JSON, try to extract tool name and parameters
            const toolMatch = isolatedContent.match(/tool:\s*([^\n]+)/i);
            if (toolMatch) {
              const name = toolMatch[1].trim();
              const parameters: Record<string, any> = {};
              
              // Extract parameters
              const paramMatches = isolatedContent.matchAll(/([^:]+):\s*([^\n]+)/g);
              for (const paramMatch of paramMatches) {
                const paramName = paramMatch[1].trim();
                if (paramName.toLowerCase() === 'tool') continue;
                
                const paramValue = paramMatch[2].trim();
                parameters[paramName] = paramValue;
              }
              
              toolCalls.push({ name, parameters });
            }
          }
        }
      }
      
      return toolCalls;
    } catch (error) {
      this.emit('error', { type: 'parse_content_isolation_tool_calls', error });
      return [];
    }
  }
  
  /**
   * Check if the system is in maintenance mode
   * @returns True if in maintenance mode, false otherwise
   */
  public isInMaintenanceMode(): boolean {
    return this.taskManager.isMaintenanceMode();
  }
  
  /**
   * Get the task manager
   * @returns Task manager
   */
  public getTaskManager(): TaskManager {
    return this.taskManager;
  }
  
  /**
   * Get the tool manager
   * @returns Tool manager
   */
  public getToolManager(): ToolManager {
    return this.toolManager;
  }
}
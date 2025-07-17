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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolManager, Tool, ToolAvailabilityMode } from './ToolManager';
import { TaskManager } from '../tasks/TaskManager';

// Mock tool implementation
class MockTool implements Tool {
  constructor(private name: string, private result: any = { success: true }) {}
  
  async execute(input: any): Promise<any> {
    return { ...this.result, input };
  }
  
  getDefinition() {
    return {
      name: this.name,
      description: `Mock tool: ${this.name}`,
      parameters: {
        type: 'object',
        properties: {
          test: {
            type: 'string',
            description: 'Test parameter',
          },
        },
      },
    };
  }
}

describe('ToolManager', () => {
  let taskManager: TaskManager;
  let toolManager: ToolManager;
  
  beforeEach(() => {
    taskManager = new TaskManager('test-project');
    toolManager = new ToolManager(taskManager);
    
    // Register some mock tools
    toolManager.registerTool(
      'always_tool',
      new MockTool('always_tool'),
      ToolAvailabilityMode.ALWAYS
    );
    
    toolManager.registerTool(
      'normal_tool',
      new MockTool('normal_tool'),
      ToolAvailabilityMode.NORMAL
    );
    
    toolManager.registerTool(
      'maintenance_tool',
      new MockTool('maintenance_tool'),
      ToolAvailabilityMode.MAINTENANCE
    );
  });
  
  describe('Tool Registration', () => {
    it('should register tools', () => {
      const eventHandler = vi.fn();
      toolManager.on('toolRegistered', eventHandler);
      
      toolManager.registerTool(
        'new_tool',
        new MockTool('new_tool'),
        ToolAvailabilityMode.ALWAYS
      );
      
      expect(eventHandler).toHaveBeenCalledWith({
        name: 'new_tool',
        availabilityMode: ToolAvailabilityMode.ALWAYS,
      });
    });
    
    it('should register built-in task tools', () => {
      const tools = toolManager.getToolDefinitions();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).toContain('create_tasks');
      expect(toolNames).toContain('get_current_task');
      expect(toolNames).toContain('finish_current_task');
    });
  });
  
  describe('Tool Availability', () => {
    it('should provide correct tools in normal mode', () => {
      // Default is normal mode
      const tools = toolManager.getAvailableTools();
      const toolDefinitions = toolManager.getToolDefinitions();
      const toolNames = toolDefinitions.map(t => t.name);
      
      // Should include ALWAYS and NORMAL tools
      expect(toolNames).toContain('always_tool');
      expect(toolNames).toContain('normal_tool');
      expect(toolNames).toContain('create_tasks');
      expect(toolNames).toContain('get_current_task');
      
      // Should not include MAINTENANCE tools
      expect(toolNames).not.toContain('maintenance_tool');
      expect(toolNames).not.toContain('finish_current_task');
    });
    
    it('should provide correct tools in maintenance mode', async () => {
      // Enter maintenance mode
      await taskManager.createTasks(['Test task']);
      
      const tools = toolManager.getAvailableTools();
      const toolDefinitions = toolManager.getToolDefinitions();
      const toolNames = toolDefinitions.map(t => t.name);
      
      // Should include ALWAYS and MAINTENANCE tools
      expect(toolNames).toContain('always_tool');
      expect(toolNames).toContain('maintenance_tool');
      expect(toolNames).toContain('get_current_task');
      expect(toolNames).toContain('finish_current_task');
      
      // Should not include NORMAL tools
      expect(toolNames).not.toContain('normal_tool');
      expect(toolNames).not.toContain('create_tasks');
    });
    
    it('should emit event when tool availability changes', async () => {
      const eventHandler = vi.fn();
      toolManager.on('toolAvailabilityChanged', eventHandler);
      
      // Enter maintenance mode
      await taskManager.createTasks(['Test task']);
      
      expect(eventHandler).toHaveBeenCalledWith({ mode: 'maintenance' });
      
      // Exit maintenance mode
      taskManager.exitMaintenanceMode();
      
      expect(eventHandler).toHaveBeenCalledWith({ mode: 'normal' });
    });
  });
  
  describe('Tool Execution', () => {
    it('should execute available tools', async () => {
      const result = await toolManager.executeTool('always_tool', { test: 'value' });
      
      expect(result).toEqual({
        success: true,
        input: { test: 'value' },
      });
    });
    
    it('should emit event when tool is executed', async () => {
      const eventHandler = vi.fn();
      toolManager.on('toolExecuted', eventHandler);
      
      await toolManager.executeTool('always_tool', { test: 'value' });
      
      expect(eventHandler).toHaveBeenCalledWith({
        name: 'always_tool',
        input: { test: 'value' },
        result: expect.objectContaining({ success: true }),
        success: true,
      });
    });
    
    it('should throw error when executing unavailable tool', async () => {
      // Enter maintenance mode
      await taskManager.createTasks(['Test task']);
      
      // Try to execute a normal mode tool in maintenance mode
      await expect(toolManager.executeTool('normal_tool', {})).rejects.toThrow(
        'Tool "normal_tool" is not available in maintenance mode'
      );
    });
    
    it('should throw error when executing unknown tool', async () => {
      await expect(toolManager.executeTool('unknown_tool', {})).rejects.toThrow(
        'Tool "unknown_tool" not found'
      );
    });
    
    it('should handle tool execution errors', async () => {
      // Register a failing tool
      const failingTool: Tool = {
        execute: async () => { throw new Error('Tool execution failed'); },
        getDefinition: () => ({ name: 'failing_tool' }),
      };
      
      toolManager.registerTool('failing_tool', failingTool);
      
      const eventHandler = vi.fn();
      toolManager.on('toolExecuted', eventHandler);
      
      await expect(toolManager.executeTool('failing_tool', {})).rejects.toThrow(
        'Tool execution failed'
      );
      
      expect(eventHandler).toHaveBeenCalledWith({
        name: 'failing_tool',
        input: {},
        error: 'Tool execution failed',
        success: false,
      });
    });
  });
});
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

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../tasks/TaskManager';
import { ToolManager } from '../tools/ToolManager';
import { IntegratedContextManager } from '../context/IntegratedContextManager';
import { ContextHistorySeparator, ContextType, ContextualMessage } from '../context/ContextHistorySeparator';

describe('Task Workflow Integration', () => {
  let taskManager: TaskManager;
  let toolManager: ToolManager;
  let contextManager: IntegratedContextManager;
  let contextSeparator: ContextHistorySeparator;
  
  beforeEach(() => {
    taskManager = new TaskManager('test-project');
    toolManager = new ToolManager(taskManager);
    contextManager = new IntegratedContextManager('test-project');
    contextSeparator = new ContextHistorySeparator();
  });
  
  it('should handle complete task workflow with context separation', async () => {
    // Step 1: Initial state - normal mode
    expect(taskManager.isMaintenanceMode()).toBe(false);
    
    // Get available tools in normal mode
    let tools = toolManager.getToolDefinitions();
    let toolNames = tools.map(t => t.name);
    
    // Should include create_tasks but not finish_current_task
    expect(toolNames).toContain('create_tasks');
    expect(toolNames).not.toContain('finish_current_task');
    
    // Step 2: Create tasks
    const createTasksResult = await toolManager.executeTool('create_tasks', {
      tasks: [
        'Research requirements',
        'Design solution',
        'Implement code',
      ],
    });
    
    expect(createTasksResult.success).toBe(true);
    expect(createTasksResult.tasks).toHaveLength(3);
    
    // Step 3: Verify we're in maintenance mode
    expect(taskManager.isMaintenanceMode()).toBe(true);
    
    // Get available tools in maintenance mode
    tools = toolManager.getToolDefinitions();
    toolNames = tools.map(t => t.name);
    
    // Should include finish_current_task but not create_tasks
    expect(toolNames).not.toContain('create_tasks');
    expect(toolNames).toContain('finish_current_task');
    
    // Step 4: Get current task
    const getCurrentTaskResult = await toolManager.executeTool('get_current_task', {});
    
    expect(getCurrentTaskResult.success).toBe(true);
    expect(getCurrentTaskResult.currentTask).toBeDefined();
    expect(getCurrentTaskResult.currentTask?.description).toBe('Research requirements');
    
    // Step 5: Finish current task
    const finishTaskResult = await toolManager.executeTool('finish_current_task', {
      success: true,
      message: 'Completed research',
    });
    
    expect(finishTaskResult.success).toBe(true);
    expect(finishTaskResult.completedTask?.description).toBe('Research requirements');
    expect(finishTaskResult.nextTask?.description).toBe('Design solution');
    
    // Step 6: Verify next task is current
    const getNextTaskResult = await toolManager.executeTool('get_current_task', {});
    
    expect(getNextTaskResult.success).toBe(true);
    expect(getNextTaskResult.currentTask?.description).toBe('Design solution');
    
    // Step 7: Finish all remaining tasks
    await toolManager.executeTool('finish_current_task', {
      success: true,
      message: 'Completed design',
    });
    
    const finalTaskResult = await toolManager.executeTool('finish_current_task', {
      success: true,
      message: 'Completed implementation',
    });
    
    expect(finalTaskResult.success).toBe(true);
    expect(finalTaskResult.nextTask).toBeUndefined();
    expect(finalTaskResult.maintenanceModeExited).toBe(true);
    
    // Step 8: Verify we're back in normal mode
    expect(taskManager.isMaintenanceMode()).toBe(false);
    
    // Get available tools in normal mode again
    tools = toolManager.getToolDefinitions();
    toolNames = tools.map(t => t.name);
    
    // Should include create_tasks but not finish_current_task
    expect(toolNames).toContain('create_tasks');
    expect(toolNames).not.toContain('finish_current_task');
  });
  
  it('should properly separate context from conversation history', async () => {
    // Create a conversation with mixed context and history
    const messages: ContextualMessage[] = [
      // System context
      {
        role: 'system',
        content: 'System instructions',
        contextType: ContextType.SYSTEM,
      },
      // RAG results
      {
        role: 'system',
        content: 'RAG results: relevant information',
        contextType: ContextType.RAG,
      },
      // User message
      {
        role: 'user',
        content: 'Create tasks for implementing a feature',
        contextType: ContextType.USER,
      },
      // Model response
      {
        role: 'assistant',
        content: 'I will help you create tasks',
        contextType: ContextType.MODEL,
      },
      // Tool call
      {
        role: 'function',
        content: JSON.stringify({
          name: 'create_tasks',
          arguments: { tasks: ['Task 1', 'Task 2'] },
        }),
        contextType: ContextType.TOOL_CALL,
      },
      // Tool result
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          message: 'Created 2 tasks',
        }),
        contextType: ContextType.TOOL_RESULT,
      },
      // Dynamic context
      {
        role: 'system',
        content: 'Dynamic context information',
        contextType: ContextType.DYNAMIC,
      },
    ];
    
    // Process messages
    const { history, context } = contextSeparator.processMessages(messages);
    
    // Verify history contains only user messages, model responses, and tool interactions
    expect(history).toHaveLength(4);
    expect(history.map(m => m.contextType)).toEqual([
      ContextType.USER,
      ContextType.MODEL,
      ContextType.TOOL_CALL,
      ContextType.TOOL_RESULT,
    ]);
    
    // Verify context contains only system, RAG, and dynamic context
    expect(context).toHaveLength(3);
    expect(context.map(m => m.contextType)).toEqual([
      ContextType.SYSTEM,
      ContextType.RAG,
      ContextType.DYNAMIC,
    ]);
  });
  
  it('should integrate context management with task workflow', async () => {
    // Step 1: Process user input to generate context
    const userInput = 'I need to implement a feature with authentication';
    const contextResult = await contextManager.processUserInput(userInput);
    
    expect(contextResult.relevantContext).toBeDefined();
    
    // Step 2: Create context message
    const contextMessage = contextManager.createContextMessage(
      contextResult.relevantContext,
      ContextType.DYNAMIC
    );
    
    expect(contextMessage.role).toBe('system');
    expect(contextMessage.contextType).toBe(ContextType.DYNAMIC);
    
    // Step 3: Create tasks
    const createTasksResult = await toolManager.executeTool('create_tasks', {
      tasks: [
        'Research authentication requirements',
        'Design authentication flow',
        'Implement authentication',
        'Test authentication',
      ],
    });
    
    expect(createTasksResult.success).toBe(true);
    expect(taskManager.isMaintenanceMode()).toBe(true);
    
    // Step 4: Create conversation with context and task information
    const messages: ContextualMessage[] = [
      // Context message
      contextMessage,
      // User message
      {
        role: 'user',
        content: userInput,
        contextType: ContextType.USER,
      },
      // Model response
      {
        role: 'assistant',
        content: 'I will help you implement authentication',
        contextType: ContextType.MODEL,
      },
      // Tool call
      {
        role: 'function',
        content: JSON.stringify({
          name: 'create_tasks',
          arguments: { tasks: createTasksResult.tasks.map(t => t.description) },
        }),
        contextType: ContextType.TOOL_CALL,
      },
      // Tool result
      {
        role: 'tool',
        content: JSON.stringify(createTasksResult),
        contextType: ContextType.TOOL_RESULT,
      },
    ];
    
    // Step 5: Process conversation to separate context from history
    const { history, context } = contextSeparator.processMessages(messages);
    
    // Verify context is separated correctly
    expect(history).toHaveLength(4);
    expect(context).toHaveLength(1);
    expect(context[0].contextType).toBe(ContextType.DYNAMIC);
    
    // Step 6: Complete a task
    const finishTaskResult = await toolManager.executeTool('finish_current_task', {
      success: true,
      message: 'Completed research on authentication requirements',
    });
    
    expect(finishTaskResult.success).toBe(true);
    expect(finishTaskResult.nextTask?.description).toBe('Design authentication flow');
    
    // Step 7: Add task result to conversation
    const updatedMessages = [
      ...messages,
      // Model message about task completion
      {
        role: 'assistant',
        content: 'I have completed the research on authentication requirements',
        contextType: ContextType.MODEL,
      },
      // Tool call
      {
        role: 'function',
        content: JSON.stringify({
          name: 'finish_current_task',
          arguments: {
            success: true,
            message: 'Completed research on authentication requirements',
          },
        }),
        contextType: ContextType.TOOL_CALL,
      },
      // Tool result
      {
        role: 'tool',
        content: JSON.stringify(finishTaskResult),
        contextType: ContextType.TOOL_RESULT,
      },
    ];
    
    // Step 8: Process updated conversation
    const updatedProcessed = contextSeparator.processMessages(updatedMessages);
    
    // Verify history includes task completion
    expect(updatedProcessed.history).toHaveLength(7);
    expect(updatedProcessed.context).toHaveLength(1);
    
    // The last items in history should be the task completion
    const lastThreeItems = updatedProcessed.history.slice(-3);
    expect(lastThreeItems[0].contextType).toBe(ContextType.MODEL);
    expect(lastThreeItems[1].contextType).toBe(ContextType.TOOL_CALL);
    expect(lastThreeItems[2].contextType).toBe(ContextType.TOOL_RESULT);
  });
});
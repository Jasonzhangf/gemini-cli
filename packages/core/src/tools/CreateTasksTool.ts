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

import { TaskManager, Task, TaskCreationOptions } from '../tasks/TaskManager';

/**
 * CreateTasksTool input interface
 */
export interface CreateTasksToolInput {
  tasks?: string[];
  templateId?: string;
  parentTaskId?: string;
  metadata?: Record<string, any>;
}

/**
 * CreateTasksTool result interface
 */
export interface CreateTasksToolResult {
  success: boolean;
  message: string;
  tasks?: Task[];
  error?: string;
}

/**
 * CreateTasksTool class
 * Tool for creating tasks from user input
 */
export class CreateTasksTool {
  private taskManager: TaskManager;
  
  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
  }
  
  /**
   * Execute the tool
   * @param input Tool input
   * @returns Tool result
   */
  public async execute(input: CreateTasksToolInput | string): Promise<CreateTasksToolResult> {
    try {
      // Check if we're in maintenance mode
      if (this.taskManager.isMaintenanceMode()) {
        return {
          success: false,
          message: "Cannot create new tasks in maintenance mode. Use getCurrentTask() to continue with existing tasks.",
          error: "MAINTENANCE_MODE_ACTIVE",
        };
      }
      
      // Handle string input (for backward compatibility or direct string input)
      let parsedInput: CreateTasksToolInput = typeof input === 'string' 
        ? this.parseStringInput(input) 
        : input;
      
      // Validate input
      if (!parsedInput.tasks && !parsedInput.templateId) {
        return {
          success: false,
          message: "Must provide task list or template ID",
          error: "INVALID_INPUT",
        };
      }
      
      // Prepare options
      const options: TaskCreationOptions = {
        templateId: parsedInput.templateId,
        parentTaskId: parsedInput.parentTaskId,
        metadata: parsedInput.metadata,
      };
      
      // Create tasks
      let tasks: Task[];
      if (parsedInput.templateId) {
        tasks = await this.taskManager.createTasks(`template:${parsedInput.templateId}`, options);
      } else if (parsedInput.tasks) {
        tasks = await this.taskManager.createTasks(parsedInput.tasks, options);
      } else {
        // This should never happen due to validation above
        throw new Error("Invalid input: must provide tasks or templateId");
      }
      
      return {
        success: true,
        message: `Created ${tasks.length} tasks successfully. Entered maintenance mode.`,
        tasks,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create tasks: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Parse string input into CreateTasksToolInput
   * Handles various string formats that might be passed to the tool
   */
  private parseStringInput(input: string): CreateTasksToolInput {
    // Handle the specific format from the logs
    if (input.includes('tasks [') && input.includes('"}')) {
      // Fix the malformed JSON by adding the missing closing bracket
      const fixedInput = input.replace('"}', '"]"}');
      try {
        return JSON.parse(fixedInput) as CreateTasksToolInput;
      } catch (e) {
        // If still fails, continue with other parsing methods
      }
    }
    
    // Try to parse as JSON first
    try {
      return JSON.parse(input) as CreateTasksToolInput;
    } catch (e) {
      // Not valid JSON, try other formats
    }
    
    // Check if it's a string that starts with "tasks [" or similar
    const tasksMatch = input.match(/tasks\s*\[(.*?)(?:\]|$)/i);
    if (tasksMatch && tasksMatch[1]) {
      try {
        // Try to parse the array part
        const tasksArray = JSON.parse(`[${tasksMatch[1]}]`);
        return { tasks: tasksArray };
      } catch (e) {
        // If parsing fails, split by commas
        const tasks = tasksMatch[1]
          .split(',')
          .map(t => t.trim().replace(/^["']|["']$/g, '')); // Remove quotes
        return { tasks };
      }
    }
    
    // Check if input contains an array directly
    const arrayMatch = input.match(/\[(.*?)\]/);
    if (arrayMatch && arrayMatch[1]) {
      try {
        const tasksArray = JSON.parse(`[${arrayMatch[1]}]`);
        return { tasks: tasksArray };
      } catch (e) {
        // If parsing fails, continue
      }
    }
    
    // Check if it's a template ID
    if (input.match(/template:(\w+)/i)) {
      return { templateId: input.match(/template:(\w+)/i)![1] };
    }
    
    // If all else fails, treat as a single task
    return { tasks: [input] };
  }
  
  /**
   * Get tool definition for OpenAI function calling
   */
  public getDefinition() {
    return {
      name: "create_tasks",
      description: "Create tasks for a complex workflow. This will enter maintenance mode where the system focuses on completing these tasks.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "List of task descriptions to create",
            items: {
              type: "string",
            },
          },
          templateId: {
            type: "string",
            description: "ID of a task template to use (e.g., 'basic', 'feature', 'bugfix')",
          },
          parentTaskId: {
            type: "string",
            description: "Optional ID of a parent task if these are subtasks",
          },
          metadata: {
            type: "object",
            description: "Optional metadata to attach to the tasks",
          },
        },
        required: [],
      },
    };
  }
}
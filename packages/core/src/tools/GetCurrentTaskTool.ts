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

import { TaskManager, Task } from '../tasks/TaskManager';

/**
 * GetCurrentTaskTool input interface
 */
export interface GetCurrentTaskToolInput {
  includeAllTasks?: boolean;
}

/**
 * GetCurrentTaskTool result interface
 */
export interface GetCurrentTaskToolResult {
  success: boolean;
  message: string;
  currentTask?: Task;
  allTasks?: Task[];
  isInMaintenanceMode: boolean;
  error?: string;
}

/**
 * GetCurrentTaskTool class
 * Tool for retrieving the current task
 */
export class GetCurrentTaskTool {
  private taskManager: TaskManager;
  
  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
  }
  
  /**
   * Execute the tool
   * @param input Tool input
   * @returns Tool result
   */
  public async execute(input: GetCurrentTaskToolInput = {}): Promise<GetCurrentTaskToolResult> {
    try {
      const currentTask = await this.taskManager.getCurrentTask();
      const isInMaintenanceMode = this.taskManager.isMaintenanceMode();
      
      let allTasks: Task[] | undefined;
      if (input.includeAllTasks) {
        allTasks = await this.taskManager.getAllTasks();
      }
      
      if (!currentTask) {
        if (isInMaintenanceMode) {
          return {
            success: true,
            message: "No current task, but system is in maintenance mode. All tasks may be completed.",
            isInMaintenanceMode,
            allTasks,
          };
        } else {
          return {
            success: true,
            message: "No tasks have been created yet. Use create_tasks to start a workflow.",
            isInMaintenanceMode,
            allTasks: allTasks || [],
          };
        }
      }
      
      return {
        success: true,
        message: `Current task: ${currentTask.description}`,
        currentTask,
        allTasks,
        isInMaintenanceMode,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get current task: ${error instanceof Error ? error.message : String(error)}`,
        isInMaintenanceMode: this.taskManager.isMaintenanceMode(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Get tool definition for OpenAI function calling
   */
  public getDefinition() {
    return {
      name: "get_current_task",
      description: "Get the current active task in the workflow",
      parameters: {
        type: "object",
        properties: {
          includeAllTasks: {
            type: "boolean",
            description: "Whether to include all tasks in the response, not just the current one",
          },
        },
        required: [],
      },
    };
  }
}
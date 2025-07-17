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

import { TaskManager, Task, TaskResult } from '../tasks/TaskManager';

/**
 * FinishCurrentTaskTool input interface
 */
export interface FinishCurrentTaskToolInput {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * FinishCurrentTaskTool result interface
 */
export interface FinishCurrentTaskToolResult {
  success: boolean;
  message: string;
  completedTask?: Task;
  nextTask?: Task;
  maintenanceModeExited?: boolean;
  error?: string;
}

/**
 * FinishCurrentTaskTool class
 * Tool for completing the current task and moving to the next one
 */
export class FinishCurrentTaskTool {
  private taskManager: TaskManager;
  
  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
  }
  
  /**
   * Execute the tool
   * @param input Tool input
   * @returns Tool result
   */
  public async execute(input: FinishCurrentTaskToolInput): Promise<FinishCurrentTaskToolResult> {
    try {
      // Check if we're in maintenance mode
      if (!this.taskManager.isMaintenanceMode()) {
        return {
          success: false,
          message: "Not in maintenance mode. No active tasks to finish.",
          error: "NOT_IN_MAINTENANCE_MODE",
        };
      }
      
      // Get current task before finishing it
      const currentTask = await this.taskManager.getCurrentTask();
      
      if (!currentTask) {
        return {
          success: false,
          message: "No current task to finish.",
          error: "NO_CURRENT_TASK",
        };
      }
      
      // Prepare task result
      const taskResult: TaskResult = {
        success: input.success,
        message: input.message,
        data: input.data,
      };
      
      // Finish current task and get next task
      const nextTask = await this.taskManager.finishCurrentTask(taskResult);
      
      // Check if we exited maintenance mode
      const wasInMaintenanceMode = this.taskManager.isMaintenanceMode();
      const maintenanceModeExited = !wasInMaintenanceMode;
      
      if (nextTask) {
        return {
          success: true,
          message: `Task "${currentTask.description}" completed. Moving to next task: "${nextTask.description}"`,
          completedTask: currentTask,
          nextTask,
          maintenanceModeExited,
        };
      } else {
        return {
          success: true,
          message: `Task "${currentTask.description}" completed. No more tasks remaining.`,
          completedTask: currentTask,
          maintenanceModeExited: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to finish current task: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Get tool definition for OpenAI function calling
   */
  public getDefinition() {
    return {
      name: "finish_current_task",
      description: "Mark the current task as completed and move to the next task in the workflow",
      parameters: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "Whether the task was completed successfully",
          },
          message: {
            type: "string",
            description: "Message describing the task completion or failure",
          },
          data: {
            type: "object",
            description: "Optional data related to the task completion",
          },
        },
        required: ["success", "message"],
      },
    };
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single step in a task plan
 */
export interface TaskStep {
  stepNumber: number;
  description: string;
  toolCalls: string[];
  expectedTools: string[];
  completed: boolean;
  result?: string;
  error?: string;
}

/**
 * Represents a complete task plan with progress tracking
 */
export interface TaskPlan {
  id: string;
  originalRequest: string;
  totalSteps: number;
  currentStep: number;
  steps: TaskStep[];
  completed: boolean;
  startTime: number;
  endTime?: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'paused';
}

/**
 * Sequential thinking response format
 */
export interface SequentialThinkingResponse {
  thought: string;
  nextThoughtNeeded: boolean;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

/**
 * Task execution context
 */
export interface TaskExecutionContext {
  currentPlan: TaskPlan | null;
  isWaitingForPlanning: boolean;
  isExecutingStep: boolean;
  lastResponse?: string;
}

/**
 * Task planner interface for managing complex multi-step tasks
 */
export interface ITaskPlanner {
  /**
   * Check if a user request requires task planning
   */
  requiresTaskPlanning(request: string): boolean;
  
  /**
   * Request model to create a task plan using sequential thinking
   */
  requestTaskPlanning(request: string): Promise<string>;
  
  /**
   * Parse sequential thinking responses to build task plan
   */
  parseSequentialThinking(response: SequentialThinkingResponse): TaskPlan | null;
  
  /**
   * Get current task execution context
   */
  getExecutionContext(): TaskExecutionContext;
  
  /**
   * Execute the next step in current plan
   */
  executeNextStep(): Promise<string>;
  
  /**
   * Mark current step as completed
   */
  completeCurrentStep(result: string): void;
  
  /**
   * Mark current step as failed
   */
  failCurrentStep(error: string): void;
  
  /**
   * Check if should continue execution
   */
  shouldContinueExecution(): boolean;
  
  /**
   * Get progress summary
   */
  getProgressSummary(): string;
  
  /**
   * Reset current plan
   */
  resetPlan(): void;
}
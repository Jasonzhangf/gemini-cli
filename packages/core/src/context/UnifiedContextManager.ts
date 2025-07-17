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
import { ContextHistorySeparator, ContextType, ContextualMessage } from './ContextHistorySeparator.js';
import { IntegratedContextManager } from './IntegratedContextManager.js';
import { SystemPromptCleaner } from './SystemPromptCleaner.js';

/**
 * Context processing result
 */
export interface ContextProcessingResult {
  userContext: string;
  systemContext: string;
  history: ContextualMessage[];
  context: ContextualMessage[];
}

/**
 * UnifiedContextManager class
 * Single entry point for all context management operations
 */
export class UnifiedContextManager extends EventEmitter {
  private contextManager: IntegratedContextManager;
  private contextSeparator: ContextHistorySeparator;
  private projectId: string;
  
  // Flag to control whether RAG explanations are included
  private includeRagExplanations: boolean = false;
  
  constructor(projectId: string) {
    super();
    this.projectId = projectId;
    this.contextManager = new IntegratedContextManager(projectId);
    this.contextSeparator = new ContextHistorySeparator();
    
    // Forward events from the integrated context manager
    this.contextManager.on('contextGenerated', (data) => {
      this.emit('contextGenerated', data);
    });
    
    this.contextManager.on('error', (data) => {
      this.emit('error', data);
    });
  }
  
  /**
   * Process user input to generate context
   * @param input Original user input
   * @param conversation Current conversation history
   * @returns Processed context
   */
  public async processInput(
    input: string,
    conversation: ContextualMessage[] = []
  ): Promise<ContextProcessingResult> {
    // Extract original user input (remove any processing artifacts)
    const originalInput = this.extractOriginalUserInput(input);
    
    // Process with RAG system
    const analysisResult = await this.contextManager.processUserInput(originalInput);
    
    // Create context message with RAG results
    const contextMessage = this.contextManager.createContextMessage(
      this.formatContextWithoutRagExplanation(analysisResult.relevantContext),
      ContextType.DYNAMIC
    );
    
    // Add context message to conversation
    const updatedConversation = [...conversation, contextMessage];
    
    // Separate context from history
    const { history, context } = this.contextSeparator.processMessages(updatedConversation);
    
    // Format system context (without RAG explanations)
    const systemContext = context
      .map(msg => msg.content)
      .join('\n\n')
      .trim();
    
    return {
      userContext: analysisResult.relevantContext,
      systemContext,
      history,
      context,
    };
  }
  
  /**
   * Process model response
   * @param response Model response
   * @returns Processed context from response
   */
  public async processModelResponse(response: string): Promise<any> {
    return this.contextManager.processModelResponse(response);
  }
  
  /**
   * Extract original user input from potentially processed input
   * @param input Potentially processed input
   * @returns Original user input
   */
  private extractOriginalUserInput(input: string): string {
    // Check if input is wrapped in markdown code blocks
    const codeBlockMatch = input.match(/```(?:\w+)?\s*([\s\S]*?)```/g);
    if (codeBlockMatch && codeBlockMatch.length > 0) {
      input = codeBlockMatch.join(' ').replace(/```(?:\w+)?|```/g, '').trim();
    }
    
    // Check if input contains task planning prefix
    const taskPlanningMatch = input.match(/请先为以下请求制定详细的任务计划："(.+?)"/);
    if (taskPlanningMatch && taskPlanningMatch[1]) {
      return taskPlanningMatch[1];
    }
    
    // Check for other task planning formats
    const taskPlanningMatch2 = input.match(/"([^"]+)"请首先创建任务列表/);
    if (taskPlanningMatch2 && taskPlanningMatch2[1]) {
      return taskPlanningMatch2[1];
    }
    
    // Check if input contains tool call information
    const toolCallMatch = input.match(/\[tool_call:.+?\]/g);
    if (toolCallMatch && toolCallMatch.length > 0) {
      // Remove all tool call information
      let cleanedInput = input;
      for (const match of toolCallMatch) {
        cleanedInput = cleanedInput.replace(match, '');
      }
      return cleanedInput.trim();
    }
    
    // Return original input if no processing detected
    return input;
  }
  
  /**
   * Format context without RAG explanations
   * @param context Context with potential RAG explanations
   * @returns Clean context
   */
  private formatContextWithoutRagExplanation(context: string): string {
    if (!this.includeRagExplanations) {
      // Use the SystemPromptCleaner to remove all RAG explanations
      return SystemPromptCleaner.cleanRagExplanations(context);
    }
    
    return context.trim();
  }
  
  /**
   * Set whether to include RAG explanations in context
   * @param include Whether to include RAG explanations
   */
  public setIncludeRagExplanations(include: boolean): void {
    this.includeRagExplanations = include;
  }
  
  /**
   * Get the underlying context manager
   * @returns Integrated context manager
   */
  public getContextManager(): IntegratedContextManager {
    return this.contextManager;
  }
  
  /**
   * Get the context separator
   * @returns Context separator
   */
  public getContextSeparator(): ContextHistorySeparator {
    return this.contextSeparator;
  }
}
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

/**
 * Message types that should be filtered from conversation history
 */
export enum ContextType {
  SYSTEM = 'system',
  STATIC = 'static',
  DYNAMIC = 'dynamic',
  RAG = 'rag',
  KNOWLEDGE_GRAPH = 'knowledge_graph',
  USER = 'user',
  MODEL = 'model',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
}

/**
 * Message interface with context type
 */
export interface ContextualMessage {
  role: string;
  content: string;
  contextType?: ContextType;
  metadata?: Record<string, any>;
}

/**
 * ContextHistorySeparator class
 * Responsible for separating context information from conversation history
 */
export class ContextHistorySeparator {
  /**
   * Filter context messages from conversation history
   * @param messages Array of messages to filter
   * @returns Filtered messages without context information
   */
  public filterContextFromHistory(messages: ContextualMessage[]): ContextualMessage[] {
    return messages.filter(message => this.shouldIncludeInHistory(message));
  }

  /**
   * Determine if a message should be included in conversation history
   * @param message Message to check
   * @returns True if message should be included in history, false otherwise
   */
  private shouldIncludeInHistory(message: ContextualMessage): boolean {
    // If no contextType is specified, default behavior depends on role
    if (!message.contextType) {
      // Default behavior: include user messages, model responses, and tool interactions
      return ['user', 'assistant', 'tool', 'function'].includes(message.role);
    }

    // Explicitly filter out context types that should not be in history
    const excludedTypes = [
      ContextType.SYSTEM,
      ContextType.STATIC,
      ContextType.DYNAMIC,
      ContextType.RAG,
      ContextType.KNOWLEDGE_GRAPH,
    ];

    return !excludedTypes.includes(message.contextType);
  }

  /**
   * Mark message with appropriate context type
   * @param message Message to mark
   * @param type Context type
   * @returns Marked message
   */
  public markMessageWithContextType(
    message: ContextualMessage, 
    type: ContextType
  ): ContextualMessage {
    return {
      ...message,
      contextType: type,
    };
  }

  /**
   * Classify message type based on content and metadata
   * @param message Message to classify
   * @returns Classified message with contextType
   */
  public classifyMessageType(message: ContextualMessage): ContextualMessage {
    // If already classified, return as is
    if (message.contextType) {
      return message;
    }

    // Classify based on role and content patterns
    if (message.role === 'system') {
      // Check for RAG results in system messages
      if (message.content.includes('RAG results:') || 
          message.metadata?.source === 'rag') {
        return this.markMessageWithContextType(message, ContextType.RAG);
      }
      
      // Check for knowledge graph information
      if (message.content.includes('Knowledge Graph:') || 
          message.metadata?.source === 'knowledge_graph') {
        return this.markMessageWithContextType(message, ContextType.KNOWLEDGE_GRAPH);
      }
      
      // Default system messages to SYSTEM type
      return this.markMessageWithContextType(message, ContextType.SYSTEM);
    }

    // Classify user messages
    if (message.role === 'user') {
      return this.markMessageWithContextType(message, ContextType.USER);
    }

    // Classify assistant/model messages
    if (message.role === 'assistant') {
      return this.markMessageWithContextType(message, ContextType.MODEL);
    }

    // Classify tool calls and results
    if (message.role === 'function' || message.role === 'tool') {
      const type = message.role === 'function' ? ContextType.TOOL_CALL : ContextType.TOOL_RESULT;
      return this.markMessageWithContextType(message, type);
    }

    // Default to DYNAMIC for unclassified messages
    return this.markMessageWithContextType(message, ContextType.DYNAMIC);
  }

  /**
   * Process an array of messages to classify and filter
   * @param messages Array of messages to process
   * @returns Object containing filtered history and context
   */
  public processMessages(messages: ContextualMessage[]): {
    history: ContextualMessage[];
    context: ContextualMessage[];
  } {
    // First classify all messages
    const classifiedMessages = messages.map(msg => this.classifyMessageType(msg));
    
    // Then separate into history and context
    const history = this.filterContextFromHistory(classifiedMessages);
    const context = classifiedMessages.filter(msg => !this.shouldIncludeInHistory(msg));
    
    return { history, context };
  }
}
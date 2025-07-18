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

/**
 * RAG result interface
 */
export interface RAGResult {
  content: string;
  source: string;
  relevance: number;
  metadata?: Record<string, any>;
}

/**
 * Knowledge graph result interface
 */
export interface KnowledgeGraphResult {
  nodes: any[];
  edges: any[];
  insights: string[];
}

/**
 * Context analysis result
 */
export interface ContextAnalysisResult {
  relevantContext: string;
  entities: string[];
  topics: string[];
  insights: string[];
  ragResults: RAGResult[];
  graphResults?: KnowledgeGraphResult;
}

/**
 * RAG provider interface
 */
export interface RAGProvider {
  name: string;
  query(input: string, limit?: number): Promise<RAGResult[]>;
  indexDocument(document: any): Promise<void>;
  updateIndex(): Promise<void>;
}

/**
 * Knowledge graph provider interface
 */
export interface KnowledgeGraphProvider {
  name: string;
  query(input: string): Promise<KnowledgeGraphResult>;
  addNode(node: any): Promise<void>;
  addEdge(edge: any): Promise<void>;
  updateGraph(): Promise<void>;
}

/**
 * Context layer interface
 */
export interface ContextLayer {
  name: string;
  priority: number;
  getContext(query: string, tokenBudget: number): Promise<string>;
}

/**
 * IntegratedContextManager class
 * Provides unified context management with RAG and knowledge graph integration
 */
export class IntegratedContextManager extends EventEmitter {
  private ragProvider: RAGProvider | null = null;
  private graphProvider: KnowledgeGraphProvider | null = null;
  private contextLayers: ContextLayer[] = [];
  private contextSeparator: ContextHistorySeparator;
  private projectId: string;
  private tokenBudget: number = 4000;
  private contextCache: Map<string, { result: ContextAnalysisResult, timestamp: number }> = new Map();
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
    this.contextSeparator = new ContextHistorySeparator();
  }

  /**
   * Set RAG provider
   * @param provider RAG provider
   */
  public setRAGProvider(provider: RAGProvider): void {
    this.ragProvider = provider;
    this.emit('providerSet', { type: 'rag', name: provider.name });
  }

  /**
   * Set knowledge graph provider
   * @param provider Knowledge graph provider
   */
  public setGraphProvider(provider: KnowledgeGraphProvider): void {
    this.graphProvider = provider;
    this.emit('providerSet', { type: 'graph', name: provider.name });
  }

  /**
   * Add context layer
   * @param layer Context layer
   */
  public addContextLayer(layer: ContextLayer): void {
    this.contextLayers.push(layer);
    // Sort layers by priority (higher priority first)
    this.contextLayers.sort((a, b) => b.priority - a.priority);
    this.emit('layerAdded', { name: layer.name, priority: layer.priority });
  }

  /**
   * Set token budget
   * @param budget Token budget
   */
  public setTokenBudget(budget: number): void {
    this.tokenBudget = budget;
  }

  /**
   * Process user input to generate context
   * @param input User input
   * @returns Context analysis result
   */
  public async processUserInput(input: string): Promise<ContextAnalysisResult> {
    // Extract the original user input without any processing
    const originalInput = this.extractOriginalUserInput(input);
    
    // Check cache first
    const cacheKey = `${this.projectId}:${originalInput}`;
    const cachedResult = this.contextCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp) < this.cacheTTL) {
      this.emit('cacheHit', { input: originalInput });
      return cachedResult.result;
    }

    // 1. First perform RAG query with raw original input
    const ragResults = await this.performRAGQuery(originalInput);
    
    // 2. Then query knowledge graph
    const graphResults = await this.queryKnowledgeGraph(originalInput);
    
    // 3. Extract entities and topics
    const entities = this.extractEntities(originalInput, ragResults);
    const topics = this.extractTopics(originalInput, ragResults);
    
    // 4. Generate insights
    const insights = this.generateInsights(ragResults, graphResults);
    
    // 5. Build layered context
    const relevantContext = await this.buildLayeredContext(originalInput, ragResults, graphResults);
    
    // Create result
    const result: ContextAnalysisResult = {
      relevantContext,
      entities,
      topics,
      insights,
      ragResults,
      graphResults,
    };
    
    // Cache result
    this.contextCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
    
    this.emit('contextGenerated', {
      inputLength: originalInput.length,
      resultLength: relevantContext.length,
      ragResultCount: ragResults.length,
    });
    
    return result;
  }
  
  /**
   * Extract original user input from potentially processed input
   * @param input Potentially processed input
   * @returns Original user input
   */
  private extractOriginalUserInput(input: string): string {
    // Check if input is wrapped in markdown code blocks
    const codeBlockMatch = input.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      input = codeBlockMatch[1].trim();
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
    const toolCallMatch = input.match(/\[tool_call:.+?\]/);
    if (toolCallMatch) {
      // Remove tool call information
      return input.replace(toolCallMatch[0], '').trim();
    }
    
    // Return original input if no processing detected
    return input;
  }

  /**
   * Process model response to extract context
   * @param response Model response
   * @returns Extracted context
   */
  public async processModelResponse(response: string): Promise<any> {
    // Extract entities, code snippets, etc. from model response
    const entities = this.extractEntities(response, []);
    const codeSnippets = this.extractCodeSnippets(response);
    
    // Update knowledge graph with new information
    if (this.graphProvider) {
      for (const entity of entities) {
        await this.graphProvider.addNode({
          type: 'entity',
          name: entity,
          source: 'model_response',
        });
      }
      
      await this.graphProvider.updateGraph();
    }
    
    return {
      entities,
      codeSnippets,
    };
  }

  /**
   * Process conversation history to separate context from history
   * @param messages Conversation messages
   * @returns Processed messages
   */
  public processConversationHistory(messages: ContextualMessage[]): {
    history: ContextualMessage[];
    context: ContextualMessage[];
  } {
    return this.contextSeparator.processMessages(messages);
  }

  /**
   * Perform RAG query
   * @param input User input
   * @returns RAG results
   */
  private async performRAGQuery(input: string): Promise<RAGResult[]> {
    if (!this.ragProvider) {
      return [];
    }
    
    try {
      const results = await this.ragProvider.query(input, 5);
      return results;
    } catch (error) {
      this.emit('error', { type: 'rag_query', error });
      return [];
    }
  }

  /**
   * Query knowledge graph
   * @param input User input
   * @returns Knowledge graph results
   */
  private async queryKnowledgeGraph(input: string): Promise<KnowledgeGraphResult | undefined> {
    if (!this.graphProvider) {
      return undefined;
    }
    
    try {
      const results = await this.graphProvider.query(input);
      return results;
    } catch (error) {
      this.emit('error', { type: 'graph_query', error });
      return undefined;
    }
  }

  /**
   * Extract entities from input and RAG results
   * @param input User input
   * @param ragResults RAG results
   * @returns Extracted entities
   */
  private extractEntities(input: string, ragResults: RAGResult[]): string[] {
    // Simple entity extraction (in a real implementation, this would be more sophisticated)
    const entities = new Set<string>();
    
    // Extract from input
    const inputMatches = input.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (inputMatches) {
      inputMatches.forEach(match => entities.add(match));
    }
    
    // Extract from RAG results
    for (const result of ragResults) {
      const resultMatches = result.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (resultMatches) {
        resultMatches.forEach(match => entities.add(match));
      }
    }
    
    return Array.from(entities);
  }

  /**
   * Extract topics from input and RAG results
   * @param input User input
   * @param ragResults RAG results
   * @returns Extracted topics
   */
  private extractTopics(input: string, ragResults: RAGResult[]): string[] {
    // Simple topic extraction (in a real implementation, this would be more sophisticated)
    const topics = new Set<string>();
    
    // Common programming topics
    const topicPatterns = [
      /\b(?:javascript|typescript|python|java|c\+\+|ruby|go|rust)\b/gi,
      /\b(?:react|angular|vue|svelte)\b/gi,
      /\b(?:node\.js|express|fastify|koa)\b/gi,
      /\b(?:database|sql|nosql|mongodb|postgresql)\b/gi,
      /\b(?:api|rest|graphql|grpc)\b/gi,
      /\b(?:docker|kubernetes|container)\b/gi,
      /\b(?:cloud|aws|azure|gcp)\b/gi,
      /\b(?:test|unit test|integration test|e2e)\b/gi,
    ];
    
    // Extract from input
    for (const pattern of topicPatterns) {
      const matches = input.match(pattern);
      if (matches) {
        matches.forEach(match => topics.add(match.toLowerCase()));
      }
    }
    
    // Extract from RAG results
    for (const result of ragResults) {
      for (const pattern of topicPatterns) {
        const matches = result.content.match(pattern);
        if (matches) {
          matches.forEach(match => topics.add(match.toLowerCase()));
        }
      }
    }
    
    return Array.from(topics);
  }

  /**
   * Extract code snippets from text
   * @param text Text to extract from
   * @returns Extracted code snippets
   */
  private extractCodeSnippets(text: string): string[] {
    const codeBlocks: string[] = [];
    
    // Match markdown code blocks
    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match[1]) {
        codeBlocks.push(match[1].trim());
      }
    }
    
    // Match inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    while ((match = inlineCodeRegex.exec(text)) !== null) {
      if (match[1]) {
        codeBlocks.push(match[1].trim());
      }
    }
    
    return codeBlocks;
  }

  /**
   * Generate insights from RAG and graph results
   * @param ragResults RAG results
   * @param graphResults Knowledge graph results
   * @returns Generated insights
   */
  private generateInsights(
    ragResults: RAGResult[],
    graphResults?: KnowledgeGraphResult
  ): string[] {
    const insights: string[] = [];
    
    // Add insights from RAG results
    if (ragResults.length > 0) {
      insights.push(`Found ${ragResults.length} relevant documents`);
      
      // Group by source
      const sourceGroups = new Map<string, number>();
      for (const result of ragResults) {
        const count = sourceGroups.get(result.source) || 0;
        sourceGroups.set(result.source, count + 1);
      }
      
      for (const [source, count] of sourceGroups.entries()) {
        insights.push(`${count} results from ${source}`);
      }
    }
    
    // Add insights from graph results
    if (graphResults) {
      insights.push(`Found ${graphResults.nodes.length} related entities`);
      
      if (graphResults.insights && graphResults.insights.length > 0) {
        insights.push(...graphResults.insights);
      }
    }
    
    return insights;
  }

  /**
   * Build layered context from all sources
   * @param query User input
   * @param ragResults RAG results
   * @param graphResults Knowledge graph results
   * @returns Layered context
   */
  private async buildLayeredContext(
    query: string,
    ragResults: RAGResult[],
    graphResults?: KnowledgeGraphResult
  ): Promise<string> {
    let remainingTokens = this.tokenBudget;
    let context = '';
    
    // Add context from layers
    for (const layer of this.contextLayers) {
      if (remainingTokens <= 0) break;
      
      const layerContext = await layer.getContext(query, remainingTokens);
      if (layerContext) {
        context += layerContext + '\n\n';
        // Approximate token count (in a real implementation, use a proper tokenizer)
        remainingTokens -= layerContext.length / 4;
      }
    }
    
    // Add RAG results
    if (ragResults.length > 0 && remainingTokens > 0) {
      const ragContext = this.formatRAGResults(ragResults, remainingTokens);
      context += ragContext + '\n\n';
      // Approximate token count
      remainingTokens -= ragContext.length / 4;
    }
    
    // Add graph insights
    if (graphResults && graphResults.insights && graphResults.insights.length > 0 && remainingTokens > 0) {
      const graphContext = graphResults.insights.join('\n');
      context += graphContext + '\n\n';
      // Approximate token count
      remainingTokens -= graphContext.length / 4;
    }
    
    return context.trim();
  }

  /**
   * Format RAG results into context string
   * @param results RAG results
   * @param tokenBudget Token budget
   * @returns Formatted RAG results
   */
  private formatRAGResults(results: RAGResult[], tokenBudget: number): string {
    // Sort by relevance
    const sortedResults = [...results].sort((a, b) => b.relevance - a.relevance);
    
    let context = '';
    let tokensUsed = 0;
    
    // Don't add any RAG system explanation, just the relevant content
    for (const result of sortedResults) {
      // Approximate token count (in a real implementation, use a proper tokenizer)
      const resultTokens = result.content.length / 4;
      
      if (tokensUsed + resultTokens > tokenBudget) {
        // If adding this result would exceed budget, summarize or truncate
        const availableTokens = tokenBudget - tokensUsed;
        if (availableTokens > 50) { // Only add if we have enough tokens for a meaningful snippet
          const truncatedContent = result.content.substring(0, availableTokens * 4);
          context += `${truncatedContent}...\n\n`;
        }
        break;
      }
      
      // Add content directly without mentioning RAG system
      context += `${result.content}\n\n`;
      tokensUsed += resultTokens;
    }
    
    return context.trim();
  }

  /**
   * Clear context cache
   */
  public clearCache(): void {
    this.contextCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Create context message
   * @param content Context content
   * @param type Context type
   * @returns Context message
   */
  public createContextMessage(content: string, type: ContextType): ContextualMessage {
    return {
      role: 'system',
      content,
      contextType: type,
    };
  }
}
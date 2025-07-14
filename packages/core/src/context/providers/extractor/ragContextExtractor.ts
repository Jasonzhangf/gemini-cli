/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IContextExtractor, 
  IKnowledgeGraphProvider, 
  IVectorSearchProvider,
  ContextQuery, 
  ExtractedContext 
} from '../../interfaces/contextProviders.js';

interface RAGExtractorConfig {
  maxResults?: number;
  threshold?: number;
  combineStrategies?: boolean;
  enableSemanticAnalysis?: boolean;
  debugMode?: boolean;
}

/**
 * RAG-based context extractor
 * Uses both knowledge graph and vector search for comprehensive context extraction
 */
export class RAGContextExtractor implements IContextExtractor {
  private config: RAGExtractorConfig;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;
  private isInitialized = false;

  constructor(
    config: RAGExtractorConfig = {},
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ) {
    this.config = {
      maxResults: 8,
      threshold: 0.1,
      combineStrategies: true,
      enableSemanticAnalysis: true,
      debugMode: false,
      ...config
    };
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize both providers
    await Promise.all([
      this.graphProvider.initialize(),
      this.vectorProvider.initialize()
    ]);

    this.isInitialized = true;
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    // Extract semantic information from user input
    const semantic = await this.extractSemanticContext(query.userInput);
    
    // Extract code context using both graph and vector search
    const code = await this.extractCodeContext(query.userInput, semantic);
    
    // Analyze conversation context
    const conversation = this.extractConversationContext(query.conversationHistory || []);
    
    // Extract operational context
    const operational = this.extractOperationalContext(query.recentOperations || []);

    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] Context extraction completed in ${Date.now() - startTime}ms`);
    }

    return {
      semantic,
      code,
      conversation,
      operational
    };
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
    // Update providers with new information
    switch (update.type) {
      case 'file_change':
        await this.handleFileChange(update.data);
        break;
      case 'tool_execution':
        await this.handleToolExecution(update.data);
        break;
      case 'conversation_turn':
        await this.handleConversationTurn(update.data);
        break;
    }
  }

  async getConfig(): Promise<{
    provider: string;
    version: string;
    capabilities: string[];
  }> {
    return {
      provider: 'RAGContextExtractor',
      version: '1.0.0',
      capabilities: [
        'semantic_analysis',
        'graph_query',
        'vector_search',
        'conversation_tracking',
        'operational_context'
      ]
    };
  }

  async dispose(): Promise<void> {
    await Promise.all([
      this.graphProvider.dispose(),
      this.vectorProvider.dispose()
    ]);
    this.isInitialized = false;
  }

  private async extractSemanticContext(userInput: string): Promise<ExtractedContext['semantic']> {
    if (!this.config.enableSemanticAnalysis) {
      return {
        intent: 'general',
        confidence: 0.5,
        entities: [],
        concepts: []
      };
    }

    const intent = this.extractIntent(userInput);
    const entities = this.extractEntities(userInput);
    const concepts = this.extractConcepts(userInput);
    const confidence = this.calculateConfidence(userInput, intent, entities);

    return {
      intent,
      confidence,
      entities,
      concepts
    };
  }

  private async extractCodeContext(
    userInput: string, 
    semantic: ExtractedContext['semantic']
  ): Promise<ExtractedContext['code']> {
    const results = {
      relevantFiles: [] as ExtractedContext['code']['relevantFiles'],
      relevantFunctions: [] as ExtractedContext['code']['relevantFunctions'],
      relatedPatterns: [] as ExtractedContext['code']['relatedPatterns']
    };

    try {
      // Use vector search for semantic similarity
      const vectorResults = await this.vectorProvider.search({
        text: userInput,
        topK: this.config.maxResults! * 2,
        threshold: this.config.threshold!
      });

      // Use graph search for structural relationships
      const graphResults = await this.graphProvider.query({
        searchTerm: userInput,
        maxResults: this.config.maxResults! * 2,
        includeNeighbors: true
      });

      // Combine and categorize results
      const combinedResults = this.combineSearchResults(vectorResults.results, graphResults.nodes);

      // Categorize by type
      for (const result of combinedResults) {
        switch (result.type) {
          case 'file':
            results.relevantFiles.push({
              path: result.metadata.filePath || result.id,
              relevance: result.relevance,
              summary: result.summary || result.content.substring(0, 100)
            });
            break;
          case 'function':
            results.relevantFunctions.push({
              name: result.name,
              filePath: result.metadata.filePath || '',
              relevance: result.relevance,
              signature: result.metadata.signature
            });
            break;
          case 'concept':
            results.relatedPatterns.push({
              pattern: result.name,
              description: result.content,
              examples: result.metadata.examples || []
            });
            break;
        }
      }

      // Limit results
      results.relevantFiles = results.relevantFiles.slice(0, Math.ceil(this.config.maxResults! * 0.4));
      results.relevantFunctions = results.relevantFunctions.slice(0, Math.ceil(this.config.maxResults! * 0.4));
      results.relatedPatterns = results.relatedPatterns.slice(0, Math.ceil(this.config.maxResults! * 0.2));

    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Code context extraction failed:', error);
      }
    }

    return results;
  }

  private extractConversationContext(
    history: ContextQuery['conversationHistory']
  ): ExtractedContext['conversation'] {
    const topicProgression: string[] = [];
    const userGoals: string[] = [];
    const contextContinuity: string[] = [];

    if (!history || history.length === 0) {
      return { topicProgression, userGoals, contextContinuity };
    }

    // Analyze recent conversation for patterns
    const recentMessages = history.slice(-10);
    
    for (const message of recentMessages) {
      if (message.role === 'user') {
        // Extract topics
        const topics = this.extractTopicsFromMessage(message.content);
        topicProgression.push(...topics);
        
        // Extract goals
        const goals = this.extractGoalsFromMessage(message.content);
        userGoals.push(...goals);
      }
      
      // Track context continuity
      if (message.content.length > 20) {
        contextContinuity.push(message.content.substring(0, 50) + '...');
      }
    }

    return {
      topicProgression: [...new Set(topicProgression)].slice(0, 5),
      userGoals: [...new Set(userGoals)].slice(0, 5),
      contextContinuity: contextContinuity.slice(-5)
    };
  }

  private extractOperationalContext(
    operations: ContextQuery['recentOperations']
  ): ExtractedContext['operational'] {
    const recentActions: string[] = [];
    const errorContext: ExtractedContext['operational']['errorContext'] = [];
    const workflowSuggestions: string[] = [];

    if (!operations || operations.length === 0) {
      return { recentActions, errorContext, workflowSuggestions };
    }

    // Analyze recent operations
    for (const operation of operations.slice(-10)) {
      // Track recent actions
      recentActions.push(this.formatOperationDescription(operation));
      
      // Extract error context
      if (operation.type === 'error') {
        errorContext.push({
          error: operation.description,
          context: operation.metadata?.context || 'Unknown context',
          suggestions: operation.metadata?.suggestions || []
        });
      }
    }

    // Generate workflow suggestions based on operations
    workflowSuggestions.push(...this.generateWorkflowSuggestions(operations));

    return {
      recentActions: recentActions.slice(-5),
      errorContext: errorContext.slice(-3),
      workflowSuggestions: workflowSuggestions.slice(0, 3)
    };
  }

  private combineSearchResults(vectorResults: any[], graphNodes: any[]): any[] {
    const combined: any[] = [];
    const seen = new Set<string>();

    // Add vector results
    for (const result of vectorResults) {
      if (!seen.has(result.id)) {
        combined.push({
          id: result.id,
          name: result.content.split(' ')[0] || result.id,
          content: result.content,
          relevance: result.score,
          type: result.metadata?.type || 'concept',
          metadata: result.metadata || {}
        });
        seen.add(result.id);
      }
    }

    // Add graph results
    for (const node of graphNodes) {
      if (!seen.has(node.id)) {
        combined.push({
          id: node.id,
          name: node.name,
          content: node.content || '',
          relevance: 0.7, // Default relevance for graph results
          type: node.type,
          metadata: node.metadata
        });
        seen.add(node.id);
      }
    }

    // Sort by relevance
    return combined.sort((a, b) => b.relevance - a.relevance);
  }

  private extractIntent(input: string): string {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('文档') || lowerInput.includes('总结') || lowerInput.includes('markdown')) {
      return 'documentation';
    }
    if (lowerInput.includes('分析') && !lowerInput.includes('实现')) {
      return 'analysis';
    }
    if (lowerInput.includes('实现') || lowerInput.includes('开发') || lowerInput.includes('创建')) {
      return 'development';
    }
    if (lowerInput.includes('修复') || lowerInput.includes('调试') || lowerInput.includes('error')) {
      return 'debugging';
    }
    if (lowerInput.includes('测试') || lowerInput.includes('验证')) {
      return 'testing';
    }
    if (lowerInput.includes('优化') || lowerInput.includes('重构')) {
      return 'refactoring';
    }
    
    return 'general';
  }

  private extractEntities(input: string): string[] {
    const entities: string[] = [];
    
    // File extensions
    const fileExtensions = input.match(/\.\w+/g) || [];
    entities.push(...fileExtensions);
    
    // Technical terms
    const techTerms = input.match(/\b(API|HTTP|JSON|XML|SQL|React|Vue|Node|Express|TypeScript|JavaScript|Python|Java|Docker|Git|npm|yarn|webpack|eslint|jest|markdown)\b/gi) || [];
    entities.push(...techTerms);
    
    // Project-specific terms
    const projectTerms = ['contextagent', 'hijack', 'adapter', 'openai', 'gemini'];
    for (const term of projectTerms) {
      if (input.toLowerCase().includes(term)) {
        entities.push(term);
      }
    }
    
    return [...new Set(entities)];
  }

  private extractConcepts(input: string): string[] {
    const concepts: string[] = [];
    
    // Development concepts
    const devConcepts = input.match(/\b(architecture|design|pattern|framework|library|component|module|service|middleware|authentication|testing|deployment|performance|optimization|security)\b/gi) || [];
    concepts.push(...devConcepts);
    
    // Project concepts
    const projectConcepts = input.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter)\b/gi) || [];
    concepts.push(...projectConcepts);
    
    return [...new Set(concepts)];
  }

  private calculateConfidence(input: string, intent: string, entities: string[]): number {
    let confidence = 0.5;
    
    // Clear action words increase confidence
    const actionWords = ['实现', '创建', '修复', '分析', '测试', '重构', '优化', '文档'];
    const hasActionWords = actionWords.some(word => input.includes(word));
    if (hasActionWords) confidence += 0.2;
    
    // Technical entities increase confidence
    if (entities.length > 0) confidence += Math.min(0.2, entities.length * 0.05);
    
    // Specific intent patterns increase confidence
    if (intent !== 'general') confidence += 0.1;
    
    // Length and detail increase confidence
    if (input.length > 50) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }

  private extractTopicsFromMessage(content: string): string[] {
    const topics: string[] = [];
    
    // Extract technical terms
    const techTerms = content.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter|openai|gemini|cli|architecture|design|pattern|framework|library|component|module|service)\b/gi) || [];
    topics.push(...techTerms);
    
    return [...new Set(topics)];
  }

  private extractGoalsFromMessage(content: string): string[] {
    const goals: string[] = [];
    
    // Look for action-oriented phrases
    const actionPatterns = [
      /实现(.+?)(?:[。，]|$)/g,
      /创建(.+?)(?:[。，]|$)/g,
      /开发(.+?)(?:[。，]|$)/g,
      /修复(.+?)(?:[。，]|$)/g,
      /分析(.+?)(?:[。，]|$)/g,
      /优化(.+?)(?:[。，]|$)/g,
      /需要(.+?)(?:[。，]|$)/g
    ];
    
    for (const pattern of actionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        goals.push(...matches.map(match => match.trim()));
      }
    }
    
    return goals;
  }

  private formatOperationDescription(operation: ContextQuery['recentOperations'][0]): string {
    const timestamp = new Date(operation.timestamp).toLocaleTimeString();
    return `[${timestamp}] ${operation.type}: ${operation.description}`;
  }

  private generateWorkflowSuggestions(operations: ContextQuery['recentOperations']): string[] {
    const suggestions: string[] = [];
    
    // Analyze operation patterns
    const operationTypes = operations.map(op => op.type);
    const hasErrors = operationTypes.includes('error');
    const hasFileChanges = operationTypes.includes('file_change');
    const hasToolCalls = operationTypes.includes('tool_call');
    
    if (hasErrors) {
      suggestions.push('Review error logs and debug information');
    }
    
    if (hasFileChanges) {
      suggestions.push('Consider running tests after file changes');
    }
    
    if (hasToolCalls) {
      suggestions.push('Verify tool call results and handle any failures');
    }
    
    return suggestions;
  }

  private async handleFileChange(data: Record<string, any>): Promise<void> {
    // Index changed file in vector search
    if (data.filePath && data.content) {
      await this.vectorProvider.indexDocument(data.filePath, data.content, {
        type: 'file',
        filePath: data.filePath,
        lastModified: new Date().toISOString()
      });
    }
  }

  private async handleToolExecution(data: Record<string, any>): Promise<void> {
    // Could update knowledge graph with tool execution results
    // For now, just log the execution
    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] Tool execution: ${data.toolName}`);
    }
  }

  private async handleConversationTurn(data: Record<string, any>): Promise<void> {
    // Index conversation content for future reference
    if (data.content) {
      await this.vectorProvider.indexDocument(
        `conversation_${Date.now()}`,
        data.content,
        {
          type: 'conversation',
          role: data.role,
          timestamp: new Date().toISOString()
        }
      );
    }
  }
}
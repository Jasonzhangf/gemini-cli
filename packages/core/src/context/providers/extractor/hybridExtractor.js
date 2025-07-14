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

import { RAGContextExtractor } from './ragContextExtractor.js';
import { RuleBasedContextExtractor } from './ruleBasedExtractor.js';

interface HybridExtractorConfig {
  ragWeight?: number;
  ruleWeight?: number;
  maxResults?: number;
  enableFallback?: boolean;
  combineStrategies?: 'weighted' | 'consensus' | 'best_first';
  debugMode?: boolean;
}

/**
 * Hybrid context extractor
 * Combines RAG-based and rule-based approaches for optimal context extraction
 */
export class HybridContextExtractor implements IContextExtractor {
  private config: HybridExtractorConfig;
  private ragExtractor: RAGContextExtractor;
  private ruleBasedExtractor: RuleBasedContextExtractor;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;

  constructor(
    config: HybridExtractorConfig = {},
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ) {
    this.config = {
      ragWeight: 0.7,
      ruleWeight: 0.3,
      maxResults: 10,
      enableFallback: true,
      combineStrategies: 'weighted',
      debugMode: false,
      ...config
    };
    
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    
    // Initialize sub-extractors
    this.ragExtractor = new RAGContextExtractor(
      {
        maxResults: Math.ceil(this.config.maxResults! * this.config.ragWeight!),
        threshold: 0.1,
        debugMode: this.config.debugMode
      },
      graphProvider,
      vectorProvider
    );
    
    this.ruleBasedExtractor = new RuleBasedContextExtractor(
      {
        maxResults: Math.ceil(this.config.maxResults! * this.config.ruleWeight!),
        debugMode: this.config.debugMode
      },
      graphProvider,
      vectorProvider
    );
  }

  async initialize(): Promise<void> {
    // Initialize both extractors
    await Promise.all([
      this.ragExtractor.initialize(),
      this.ruleBasedExtractor.initialize()
    ]);
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    const startTime = Date.now();
    
    try {
      // Extract context using both approaches
      const [ragContext, ruleContext] = await Promise.allSettled([
        this.ragExtractor.extractContext(query),
        this.ruleBasedExtractor.extractContext(query)
      ]);

      // Combine results based on strategy
      const combinedContext = await this.combineContexts(
        ragContext.status === 'fulfilled' ? ragContext.value : null,
        ruleContext.status === 'fulfilled' ? ruleContext.value : null,
        query
      );

      if (this.config.debugMode) {
        console.log(`[HybridExtractor] Context extraction completed in ${Date.now() - startTime}ms`);
        console.log(`[HybridExtractor] RAG status: ${ragContext.status}, Rule status: ${ruleContext.status}`);
      }

      return combinedContext;
    } catch (error) {
      if (this.config.debugMode) {
        console.error('[HybridExtractor] Context extraction failed:', error);
      }
      
      // Return empty context on failure
      return this.createEmptyContext();
    }
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
    // Update both extractors
    await Promise.all([
      this.ragExtractor.updateContext(update),
      this.ruleBasedExtractor.updateContext(update)
    ]);
  }

  async getConfig(): Promise<{
    provider: string;
    version: string;
    capabilities: string[];
  }> {
    const [ragConfig, ruleConfig] = await Promise.all([
      this.ragExtractor.getConfig(),
      this.ruleBasedExtractor.getConfig()
    ]);

    return {
      provider: 'HybridContextExtractor',
      version: '1.0.0',
      capabilities: [
        'hybrid_extraction',
        'weighted_combination',
        'fallback_support',
        ...ragConfig.capabilities,
        ...ruleConfig.capabilities
      ]
    };
  }

  async dispose(): Promise<void> {
    await Promise.all([
      this.ragExtractor.dispose(),
      this.ruleBasedExtractor.dispose()
    ]);
  }

  private async combineContexts(
    ragContext: ExtractedContext | null,
    ruleContext: ExtractedContext | null,
    query: ContextQuery
  ): Promise<ExtractedContext> {
    // Handle fallback scenarios
    if (!ragContext && !ruleContext) {
      return this.createEmptyContext();
    }
    
    if (!ragContext && this.config.enableFallback) {
      return ruleContext!;
    }
    
    if (!ruleContext && this.config.enableFallback) {
      return ragContext!;
    }

    // Both contexts available - combine based on strategy
    switch (this.config.combineStrategies) {
      case 'weighted':
        return this.combineWeighted(ragContext!, ruleContext!);
      case 'consensus':
        return this.combineConsensus(ragContext!, ruleContext!);
      case 'best_first':
        return this.combineBestFirst(ragContext!, ruleContext!, query);
      default:
        return this.combineWeighted(ragContext!, ruleContext!);
    }
  }

  private combineWeighted(ragContext: ExtractedContext, ruleContext: ExtractedContext): ExtractedContext {
    const ragWeight = this.config.ragWeight!;
    const ruleWeight = this.config.ruleWeight!;

    return {
      semantic: {
        intent: this.selectBestIntent(ragContext.semantic, ruleContext.semantic),
        confidence: this.combineConfidence(ragContext.semantic.confidence, ruleContext.semantic.confidence, ragWeight, ruleWeight),
        entities: this.combineArrays(ragContext.semantic.entities, ruleContext.semantic.entities, ragWeight, ruleWeight),
        concepts: this.combineArrays(ragContext.semantic.concepts, ruleContext.semantic.concepts, ragWeight, ruleWeight)
      },
      code: {
        relevantFiles: this.combineCodeResults(ragContext.code.relevantFiles, ruleContext.code.relevantFiles, ragWeight, ruleWeight),
        relevantFunctions: this.combineCodeResults(ragContext.code.relevantFunctions, ruleContext.code.relevantFunctions, ragWeight, ruleWeight),
        relatedPatterns: this.combineCodeResults(ragContext.code.relatedPatterns, ruleContext.code.relatedPatterns, ragWeight, ruleWeight)
      },
      conversation: {
        topicProgression: this.combineArrays(ragContext.conversation.topicProgression, ruleContext.conversation.topicProgression, ragWeight, ruleWeight),
        userGoals: this.combineArrays(ragContext.conversation.userGoals, ruleContext.conversation.userGoals, ragWeight, ruleWeight),
        contextContinuity: this.combineArrays(ragContext.conversation.contextContinuity, ruleContext.conversation.contextContinuity, ragWeight, ruleWeight)
      },
      operational: {
        recentActions: this.combineArrays(ragContext.operational.recentActions, ruleContext.operational.recentActions, ragWeight, ruleWeight),
        errorContext: this.combineArrays(ragContext.operational.errorContext, ruleContext.operational.errorContext, ragWeight, ruleWeight),
        workflowSuggestions: this.combineArrays(ragContext.operational.workflowSuggestions, ruleContext.operational.workflowSuggestions, ragWeight, ruleWeight)
      }
    };
  }

  private combineConsensus(ragContext: ExtractedContext, ruleContext: ExtractedContext): ExtractedContext {
    // Take items that appear in both contexts with higher priority
    return {
      semantic: {
        intent: this.selectBestIntent(ragContext.semantic, ruleContext.semantic),
        confidence: Math.max(ragContext.semantic.confidence, ruleContext.semantic.confidence),
        entities: this.findConsensusItems(ragContext.semantic.entities, ruleContext.semantic.entities),
        concepts: this.findConsensusItems(ragContext.semantic.concepts, ruleContext.semantic.concepts)
      },
      code: {
        relevantFiles: this.findConsensusCodeResults(ragContext.code.relevantFiles, ruleContext.code.relevantFiles),
        relevantFunctions: this.findConsensusCodeResults(ragContext.code.relevantFunctions, ruleContext.code.relevantFunctions),
        relatedPatterns: this.findConsensusCodeResults(ragContext.code.relatedPatterns, ruleContext.code.relatedPatterns)
      },
      conversation: {
        topicProgression: this.findConsensusItems(ragContext.conversation.topicProgression, ruleContext.conversation.topicProgression),
        userGoals: this.findConsensusItems(ragContext.conversation.userGoals, ruleContext.conversation.userGoals),
        contextContinuity: this.findConsensusItems(ragContext.conversation.contextContinuity, ruleContext.conversation.contextContinuity)
      },
      operational: {
        recentActions: this.findConsensusItems(ragContext.operational.recentActions, ruleContext.operational.recentActions),
        errorContext: this.findConsensusItems(ragContext.operational.errorContext, ruleContext.operational.errorContext),
        workflowSuggestions: this.findConsensusItems(ragContext.operational.workflowSuggestions, ruleContext.operational.workflowSuggestions)
      }
    };
  }

  private combineBestFirst(ragContext: ExtractedContext, ruleContext: ExtractedContext, query: ContextQuery): ExtractedContext {
    // Choose the best context based on confidence and relevance
    const ragScore = this.calculateContextScore(ragContext, query);
    const ruleScore = this.calculateContextScore(ruleContext, query);
    
    if (ragScore > ruleScore) {
      // Augment RAG context with rule-based insights
      return this.augmentContext(ragContext, ruleContext);
    } else {
      // Augment rule-based context with RAG insights
      return this.augmentContext(ruleContext, ragContext);
    }
  }

  private selectBestIntent(ragSemantic: ExtractedContext['semantic'], ruleSemantic: ExtractedContext['semantic']): string {
    // Handle null or undefined semantics
    if (!ragSemantic || ragSemantic.confidence === undefined) {
      return ruleSemantic?.intent || 'general';
    }
    if (!ruleSemantic || ruleSemantic.confidence === undefined) {
      return ragSemantic.intent || 'general';
    }
    
    // Choose intent with higher confidence
    if (ragSemantic.confidence > ruleSemantic.confidence) {
      return ragSemantic.intent;
    } else if (ruleSemantic.confidence > ragSemantic.confidence) {
      return ruleSemantic.intent;
    } else {
      // If confidence is equal, prefer more specific intents
      const intentPriority = {
        'debugging': 6,
        'testing': 5,
        'documentation': 4,
        'development': 3,
        'analysis': 2,
        'refactoring': 1,
        'general': 0
      };
      
      const ragPriority = intentPriority[ragSemantic.intent as keyof typeof intentPriority] || 0;
      const rulePriority = intentPriority[ruleSemantic.intent as keyof typeof intentPriority] || 0;
      
      return ragPriority > rulePriority ? ragSemantic.intent : ruleSemantic.intent;
    }
  }

  private combineConfidence(ragConf: number, ruleConf: number, ragWeight: number, ruleWeight: number): number {
    return ragConf * ragWeight + ruleConf * ruleWeight;
  }

  private combineArrays<T>(ragArray: T[], ruleArray: T[], ragWeight: number, ruleWeight: number): T[] {
    const combined: T[] = [];
    const ragCount = Math.ceil(ragArray.length * ragWeight);
    const ruleCount = Math.ceil(ruleArray.length * ruleWeight);
    
    // Add items from RAG results
    combined.push(...ragArray.slice(0, ragCount));
    
    // Add items from rule results that aren't already included
    for (const item of ruleArray.slice(0, ruleCount)) {
      if (!combined.includes(item)) {
        combined.push(item);
      }
    }
    
    return combined.slice(0, this.config.maxResults!);
  }

  private combineCodeResults<T extends { path?: string; name?: string; pattern?: string }>(
    ragResults: T[], 
    ruleResults: T[], 
    ragWeight: number, 
    ruleWeight: number
  ): T[] {
    const combined: T[] = [];
    const ragCount = Math.ceil(ragResults.length * ragWeight);
    const ruleCount = Math.ceil(ruleResults.length * ruleWeight);
    
    // Add items from RAG results
    combined.push(...ragResults.slice(0, ragCount));
    
    // Add items from rule results that aren't already included
    for (const item of ruleResults.slice(0, ruleCount)) {
      const exists = combined.some(existing => 
        (existing.path && item.path && existing.path === item.path) ||
        (existing.name && item.name && existing.name === item.name) ||
        (existing.pattern && item.pattern && existing.pattern === item.pattern)
      );
      
      if (!exists) {
        combined.push(item);
      }
    }
    
    return combined.slice(0, this.config.maxResults!);
  }

  private findConsensusItems<T>(ragItems: T[], ruleItems: T[]): T[] {
    const consensus: T[] = [];
    const remaining: T[] = [];
    
    // Find items that appear in both lists
    for (const ragItem of ragItems) {
      if (ruleItems.includes(ragItem)) {
        consensus.push(ragItem);
      } else {
        remaining.push(ragItem);
      }
    }
    
    // Add remaining items from rule results
    for (const ruleItem of ruleItems) {
      if (!consensus.includes(ruleItem)) {
        remaining.push(ruleItem);
      }
    }
    
    // Return consensus items first, then remaining
    return [...consensus, ...remaining].slice(0, this.config.maxResults!);
  }

  private findConsensusCodeResults<T extends { path?: string; name?: string; pattern?: string }>(
    ragResults: T[], 
    ruleResults: T[]
  ): T[] {
    const consensus: T[] = [];
    const remaining: T[] = [];
    
    // Find items that appear in both lists
    for (const ragItem of ragResults) {
      const exists = ruleResults.some(ruleItem => 
        (ragItem.path && ruleItem.path && ragItem.path === ruleItem.path) ||
        (ragItem.name && ruleItem.name && ragItem.name === ruleItem.name) ||
        (ragItem.pattern && ruleItem.pattern && ragItem.pattern === ruleItem.pattern)
      );
      
      if (exists) {
        consensus.push(ragItem);
      } else {
        remaining.push(ragItem);
      }
    }
    
    // Add remaining items from rule results
    for (const ruleItem of ruleResults) {
      const exists = consensus.some(consensusItem => 
        (consensusItem.path && ruleItem.path && consensusItem.path === ruleItem.path) ||
        (consensusItem.name && ruleItem.name && consensusItem.name === ruleItem.name) ||
        (consensusItem.pattern && ruleItem.pattern && consensusItem.pattern === ruleItem.pattern)
      );
      
      if (!exists) {
        remaining.push(ruleItem);
      }
    }
    
    return [...consensus, ...remaining].slice(0, this.config.maxResults!);
  }

  private calculateContextScore(context: ExtractedContext, query: ContextQuery): number {
    let score = 0;
    
    // Semantic score
    score += context.semantic.confidence * 0.3;
    score += context.semantic.entities.length * 0.05;
    score += context.semantic.concepts.length * 0.05;
    
    // Code context score
    score += context.code.relevantFiles.length * 0.1;
    score += context.code.relevantFunctions.length * 0.1;
    score += context.code.relatedPatterns.length * 0.05;
    
    // Conversation score
    score += context.conversation.userGoals.length * 0.1;
    score += context.conversation.topicProgression.length * 0.05;
    
    // Operational score
    score += context.operational.recentActions.length * 0.05;
    score += context.operational.workflowSuggestions.length * 0.05;
    
    return score;
  }

  private augmentContext(primaryContext: ExtractedContext, secondaryContext: ExtractedContext): ExtractedContext {
    return {
      semantic: {
        intent: primaryContext.semantic.intent,
        confidence: primaryContext.semantic.confidence,
        entities: [...new Set([...primaryContext.semantic.entities, ...secondaryContext.semantic.entities])].slice(0, 10),
        concepts: [...new Set([...primaryContext.semantic.concepts, ...secondaryContext.semantic.concepts])].slice(0, 10)
      },
      code: {
        relevantFiles: [...primaryContext.code.relevantFiles, ...secondaryContext.code.relevantFiles].slice(0, this.config.maxResults!),
        relevantFunctions: [...primaryContext.code.relevantFunctions, ...secondaryContext.code.relevantFunctions].slice(0, this.config.maxResults!),
        relatedPatterns: [...primaryContext.code.relatedPatterns, ...secondaryContext.code.relatedPatterns].slice(0, this.config.maxResults!)
      },
      conversation: {
        topicProgression: [...new Set([...primaryContext.conversation.topicProgression, ...secondaryContext.conversation.topicProgression])].slice(0, 8),
        userGoals: [...new Set([...primaryContext.conversation.userGoals, ...secondaryContext.conversation.userGoals])].slice(0, 8),
        contextContinuity: [...new Set([...primaryContext.conversation.contextContinuity, ...secondaryContext.conversation.contextContinuity])].slice(0, 8)
      },
      operational: {
        recentActions: [...new Set([...primaryContext.operational.recentActions, ...secondaryContext.operational.recentActions])].slice(0, 8),
        errorContext: [...primaryContext.operational.errorContext, ...secondaryContext.operational.errorContext].slice(0, 5),
        workflowSuggestions: [...new Set([...primaryContext.operational.workflowSuggestions, ...secondaryContext.operational.workflowSuggestions])].slice(0, 5)
      }
    };
  }

  private createEmptyContext(): ExtractedContext {
    return {
      semantic: {
        intent: 'general',
        confidence: 0.1,
        entities: [],
        concepts: []
      },
      code: {
        relevantFiles: [],
        relevantFunctions: [],
        relatedPatterns: []
      },
      conversation: {
        topicProgression: [],
        userGoals: [],
        contextContinuity: []
      },
      operational: {
        recentActions: [],
        errorContext: [],
        workflowSuggestions: []
      }
    };
  }

  /**
   * Update extraction weights
   */
  updateWeights(ragWeight: number, ruleWeight: number): void {
    this.config.ragWeight = ragWeight;
    this.config.ruleWeight = ruleWeight;
  }

  /**
   * Change combination strategy
   */
  setCombinationStrategy(strategy: 'weighted' | 'consensus' | 'best_first'): void {
    this.config.combineStrategies = strategy;
  }

  /**
   * Get extraction statistics
   */
  async getExtractionStats(): Promise<{
    ragExtractor: any;
    ruleExtractor: any;
    hybridConfig: HybridExtractorConfig;
  }> {
    const [ragConfig, ruleConfig] = await Promise.all([
      this.ragExtractor.getConfig(),
      this.ruleBasedExtractor.getConfig()
    ]);

    return {
      ragExtractor: ragConfig,
      ruleExtractor: ruleConfig,
      hybridConfig: this.config
    };
  }
}
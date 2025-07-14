/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { KnowledgeGraph } from './knowledgeGraph.js';
import { CodeNode, CodeRelation } from './staticAnalyzer.js';

/**
 * Context Layers (L0-L3) as defined in Milestone 4
 */
export interface L0CoreContext {
  level: 'L0';
  coreEntities: string[];
  directRelations: CodeRelation[];
  priority: number;
  estimatedTokens: number;
}

export interface L1ImmediateContext {
  level: 'L1';
  relatedEntities: string[];
  oneHopRelations: CodeRelation[];
  priority: number;
  estimatedTokens: number;
}

export interface L2ExtendedContext {
  level: 'L2';
  neighboringEntities: string[];
  twoHopRelations: CodeRelation[];
  priority: number;
  estimatedTokens: number;
}

export interface L3GlobalContext {
  level: 'L3';
  projectSummary: string;
  globalStatistics: any;
  priority: number;
  estimatedTokens: number;
}

export type ContextLayer = L0CoreContext | L1ImmediateContext | L2ExtendedContext | L3GlobalContext;

export interface TokenBudget {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

export interface LayeredContextResult {
  layers: ContextLayer[];
  totalTokens: number;
  truncated: boolean;
  truncationDetails?: string;
}

/**
 * Layered Context Manager for Milestone 4
 * Implements intelligent context layering with token budget management
 */
export class LayeredContextManager {
  private knowledgeGraph: KnowledgeGraph;
  private defaultMaxTokens: number = 8000; // Conservative token budget

  constructor(knowledgeGraph: KnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Generate layered context based on user input with intelligent prioritization
   * 
   * 为确保功能完整性和最佳上下文分析效果，禁用Token预算限制，强制启用核心上下文注入。
   */
  async generateLayeredContext(
    userInput: string,
    maxTokens: number = this.defaultMaxTokens
  ): Promise<LayeredContextResult> {
    // 禁用Token预算限制，设置为非常高的值以确保完整上下文
    const unlimitedTokens = 100000; // 实际上的无限制
    const budget: TokenBudget = {
      maxTokens: unlimitedTokens,
      usedTokens: 0,
      remainingTokens: unlimitedTokens
    };

    const layers: ContextLayer[] = [];
    let truncated = false;
    let truncationDetails = '';

    try {
      // 步骤 1: 生成 L0 (核心上下文) - 最高优先级，必须包含
      const l0Context = await this.generateL0Context(userInput, budget);
      if (l0Context) {
        // L0 始终被包含，不受预算限制
        layers.push(l0Context);
        this.consumeBudget(l0Context.estimatedTokens, budget);
        
        console.log(`[LayeredContextManager] L0 context generated with ${l0Context.coreEntities.length} entities and ${l0Context.directRelations.length} relations`);
      } else {
        // 如果 L0 上下文生成失败，强制创建一个最小的
        const fallbackEntities = this.extractCoreEntitiesFromInput(userInput);
        const fallbackL0: L0CoreContext = {
          level: 'L0',
          coreEntities: fallbackEntities,
          directRelations: [],
          priority: 4,
          estimatedTokens: 100
        };
        layers.push(fallbackL0);
        this.consumeBudget(fallbackL0.estimatedTokens, budget);
        console.log(`[LayeredContextManager] Created fallback L0 context with ${fallbackEntities.length} entities`);
      }

      // 步骤 2: 生成 L1 (直接上下文) - 高优先级，无预算约束
      const l1Context = await this.generateL1Context(userInput, l0Context?.coreEntities || [], budget);
      if (l1Context) {
        layers.push(l1Context);
        this.consumeBudget(l1Context.estimatedTokens, budget);
        console.log(`[LayeredContextManager] L1 context added with ${l1Context.relatedEntities.length} related entities`);
      }

      // 步骤 3: 生成 L2 (扩展上下文) - 中等优先级，无预算约束
      const allEntities = [
        ...(l0Context?.coreEntities || []),
        ...(layers.find(l => l.level === 'L1') as L1ImmediateContext)?.relatedEntities || []
      ];
      const l2Context = await this.generateL2Context(userInput, allEntities, budget);
      if (l2Context) {
        layers.push(l2Context);
        this.consumeBudget(l2Context.estimatedTokens, budget);
        console.log(`[LayeredContextManager] L2 context added with ${l2Context.neighboringEntities.length} neighboring entities`);
      }

      // 步骤 4: 生成 L3 (全局上下文) - 最低优先级，无预算约束
      const l3Context = await this.generateL3Context(budget);
      if (l3Context) {
        layers.push(l3Context);
        this.consumeBudget(l3Context.estimatedTokens, budget);
        console.log(`[LayeredContextManager] L3 context added with project summary`);
      }

    } catch (error) {
      console.error('[LayeredContextManager] Error generating layered context:', error);
    }

    console.log(`[LayeredContextManager] Context generation complete: ${layers.length} layers, ${budget.usedTokens} tokens`);

    return {
      layers,
      totalTokens: budget.usedTokens,
      truncated: false, // 由于采用无限制预算，不会被截断
      truncationDetails: undefined
    };
  }

  /**
   * Generate L0 Core Context - entities directly relevant to user input
   */
  private async generateL0Context(userInput: string, budget: TokenBudget): Promise<L0CoreContext | null> {
    const coreEntities = this.extractCoreEntitiesFromInput(userInput);
    if (coreEntities.length === 0) {
      return null;
    }

    const directRelations = await this.getDirectRelations(coreEntities);
    const estimatedTokens = this.estimateTokensForContext(coreEntities, directRelations);

    return {
      level: 'L0',
      coreEntities,
      directRelations,
      priority: 4, // Highest priority
      estimatedTokens
    };
  }

  /**
   * Generate L1 Immediate Context - one-hop neighbors of core entities
   */
  private async generateL1Context(
    userInput: string,
    coreEntities: string[],
    budget: TokenBudget
  ): Promise<L1ImmediateContext | null> {
    if (coreEntities.length === 0) {
      return null;
    }

    const relatedEntities = await this.getOneHopNeighbors(coreEntities);
    const oneHopRelations = await this.getRelationsBetween(coreEntities, relatedEntities);
    const estimatedTokens = this.estimateTokensForContext(relatedEntities, oneHopRelations);

    return {
      level: 'L1',
      relatedEntities,
      oneHopRelations,
      priority: 3,
      estimatedTokens
    };
  }

  /**
   * Generate L2 Extended Context - two-hop neighbors and broader patterns
   */
  private async generateL2Context(
    userInput: string,
    knownEntities: string[],
    budget: TokenBudget
  ): Promise<L2ExtendedContext | null> {
    const neighboringEntities = await this.getTwoHopNeighbors(knownEntities);
    const twoHopRelations = await this.getRelationsBetween(knownEntities, neighboringEntities);
    const estimatedTokens = this.estimateTokensForContext(neighboringEntities, twoHopRelations);

    return {
      level: 'L2',
      neighboringEntities,
      twoHopRelations,
      priority: 2,
      estimatedTokens
    };
  }

  /**
   * Generate L3 Global Context - project overview and statistics
   */
  private async generateL3Context(budget: TokenBudget): Promise<L3GlobalContext | null> {
    const stats = this.knowledgeGraph.getStatistics();
    if (!stats) {
      return null;
    }

    const projectSummary = this.generateProjectSummary(stats);
    const estimatedTokens = this.estimateTokensForText(projectSummary) + 200; // Stats overhead

    return {
      level: 'L3',
      projectSummary,
      globalStatistics: stats,
      priority: 1, // Lowest priority
      estimatedTokens
    };
  }

  /**
   * Extract core entities from user input using keyword matching and patterns
   * Enhanced to be more permissive and extract meaningful entities from general input
   */
  private extractCoreEntitiesFromInput(userInput: string): string[] {
    const entities: string[] = [];
    const input = userInput.toLowerCase();

    // Extract file patterns
    const filePatterns = input.match(/[\w-]+\.(ts|js|jsx|tsx|py|java|c|cpp|h|hpp)/gi);
    if (filePatterns) {
      entities.push(...filePatterns.map(p => `file:${p}`));
    }

    // Extract function/class patterns
    const functionPatterns = input.match(/\b(?:function|class|method|api)\s+(\w+)/gi);
    if (functionPatterns) {
      entities.push(...functionPatterns.map(p => p.split(/\s+/)[1]));
    }

    // Extract quoted entities
    const quotedPatterns = input.match(/['"`]([^'"`]+)['"`]/g);
    if (quotedPatterns) {
      entities.push(...quotedPatterns.map(p => p.slice(1, -1)));
    }

    // Extract camelCase/PascalCase identifiers
    const identifierPatterns = input.match(/\b[A-Z][a-zA-Z0-9]*\b/g);
    if (identifierPatterns) {
      entities.push(...identifierPatterns);
    }

    // Enhanced: Extract meaningful words as potential entities
    const meaningfulWords = input.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g);
    if (meaningfulWords) {
      // Filter out common stop words but keep programming-relevant terms
      const stopWords = new Set(['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'some', 'like', 'into', 'make', 'time', 'than', 'only', 'come', 'could', 'also', 'your', 'would', 'there', 'their', 'about', 'which', 'other', 'after', 'first', 'well', 'work', 'such', 'make', 'them', 'want', 'here', 'just', 'over', 'think', 'through', 'back', 'much', 'before', 'need', 'should', 'very', 'still', 'more', 'even', 'being', 'under', 'between', 'again', 'never', 'every', 'above', 'below', 'during', 'within', 'without', 'might', 'since', 'while', 'where', 'whether', 'these', 'those', 'same', 'different', 'another', 'many', 'most', 'several', 'each', 'either', 'neither', 'both', 'all', 'any', 'some', 'none', 'few', 'little', 'much', 'more', 'most', 'less', 'least', 'enough', 'quite', 'rather', 'too', 'very', 'really', 'actually', 'probably', 'possibly', 'certainly', 'definitely', 'maybe', 'perhaps', 'almost', 'nearly', 'hardly', 'scarcely', 'barely', 'already', 'still', 'yet', 'soon', 'later', 'now', 'then', 'today', 'tomorrow', 'yesterday', 'always', 'never', 'sometimes', 'often', 'usually', 'frequently', 'rarely', 'occasionally', 'normally', 'generally', 'typically', 'particularly', 'especially', 'mainly', 'mostly', 'largely', 'partly', 'completely', 'entirely', 'totally', 'fully', 'exactly', 'precisely', 'approximately', 'roughly', 'about', 'around', 'nearly', 'almost', 'quite', 'fairly', 'rather', 'pretty', 'very', 'really', 'extremely', 'incredibly', 'amazingly', 'absolutely', 'completely', 'totally', 'entirely', 'perfectly', 'exactly', 'precisely', 'definitely', 'certainly', 'surely', 'obviously', 'clearly', 'apparently', 'presumably', 'supposedly', 'allegedly', 'reportedly', 'seemingly', 'evidently', 'probably', 'likely', 'possibly', 'maybe', 'perhaps', 'potentially', 'hopefully', 'unfortunately', 'fortunately', 'luckily', 'unluckily', 'surprisingly', 'interestingly', 'importantly', 'significantly', 'notably', 'particularly', 'especially', 'specifically', 'generally', 'usually', 'normally', 'typically', 'commonly', 'frequently', 'regularly', 'consistently', 'constantly', 'continuously', 'repeatedly', 'occasionally', 'sometimes', 'rarely', 'seldom', 'hardly', 'barely', 'scarcely', 'never', 'always', 'forever', 'permanently', 'temporarily', 'briefly', 'quickly', 'slowly', 'gradually', 'suddenly', 'immediately', 'instantly', 'directly', 'indirectly', 'clearly', 'obviously', 'apparently', 'seemingly', 'evidently', 'presumably', 'supposedly', 'allegedly', 'reportedly', 'actually', 'really', 'truly', 'indeed', 'certainly', 'definitely', 'surely', 'undoubtedly', 'obviously', 'clearly', 'plainly', 'simply', 'basically', 'essentially', 'fundamentally', 'primarily', 'mainly', 'chiefly', 'principally', 'largely', 'mostly', 'generally', 'typically', 'usually', 'normally', 'commonly', 'frequently', 'regularly', 'consistently', 'constantly', 'continuously', 'repeatedly', 'occasionally', 'sometimes', 'rarely', 'seldom', 'hardly', 'barely', 'scarcely']);
      
      const filtered = meaningfulWords.filter(word => 
        !stopWords.has(word) && 
        word.length >= 3 && 
        word.length <= 30
      );
      entities.push(...filtered);
    }

    // If no entities found, use the entire input as a fallback entity
    if (entities.length === 0 && userInput.trim().length > 0) {
      entities.push(userInput.trim());
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  /**
   * Get direct relations for given entities
   */
  private async getDirectRelations(entities: string[]): Promise<CodeRelation[]> {
    const relations: CodeRelation[] = [];
    
    for (const entity of entities) {
      const entityRelations = await this.knowledgeGraph.getRelationsForEntity(entity);
      relations.push(...entityRelations);
    }

    return relations;
  }

  /**
   * Get one-hop neighbors of given entities
   */
  private async getOneHopNeighbors(entities: string[]): Promise<string[]> {
    const neighbors = new Set<string>();
    
    for (const entity of entities) {
      const entityNeighbors = await this.knowledgeGraph.getNeighbors(entity);
      entityNeighbors.forEach(neighbor => neighbors.add(neighbor));
    }

    // Remove original entities from neighbors
    entities.forEach(entity => neighbors.delete(entity));
    
    return Array.from(neighbors).slice(0, 20); // Limit to prevent explosion
  }

  /**
   * Get two-hop neighbors of given entities
   */
  private async getTwoHopNeighbors(entities: string[]): Promise<string[]> {
    const oneHopNeighbors = await this.getOneHopNeighbors(entities);
    const twoHopNeighbors = new Set<string>();
    
    for (const neighbor of oneHopNeighbors) {
      const secondHopNeighbors = await this.knowledgeGraph.getNeighbors(neighbor);
      secondHopNeighbors.forEach(secondNeighbor => {
        if (!entities.includes(secondNeighbor) && !oneHopNeighbors.includes(secondNeighbor)) {
          twoHopNeighbors.add(secondNeighbor);
        }
      });
    }
    
    return Array.from(twoHopNeighbors).slice(0, 15); // Limit to prevent explosion
  }

  /**
   * Get relations between two sets of entities
   */
  private async getRelationsBetween(entitiesA: string[], entitiesB: string[]): Promise<CodeRelation[]> {
    const relations: CodeRelation[] = [];
    
    for (const entityA of entitiesA) {
      const entityRelations = await this.knowledgeGraph.getRelationsForEntity(entityA);
      const relevantRelations = entityRelations.filter(rel => 
        entitiesB.includes(rel.to) || entitiesB.includes(rel.from)
      );
      relations.push(...relevantRelations);
    }

    return relations;
  }

  /**
   * Generate project summary from statistics - SIMPLIFIED
   */
  private generateProjectSummary(stats: any): string {
    return `${stats.fileNodes}f/${stats.functionNodes}fn/${stats.classNodes}c`;
  }

  /**
   * Estimate token count for context elements
   */
  private estimateTokensForContext(entities: string[], relations: CodeRelation[]): number {
    // Rough estimation: 
    // - Each entity: ~20 tokens
    // - Each relation: ~15 tokens
    // - Formatting overhead: ~50 tokens
    return (entities.length * 20) + (relations.length * 15) + 50;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokensForText(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if context fits in remaining budget
   */
  private fitsInBudget(context: ContextLayer, budget: TokenBudget): boolean {
    return context.estimatedTokens <= budget.remainingTokens;
  }

  /**
   * Consume tokens from budget
   */
  private consumeBudget(tokens: number, budget: TokenBudget): void {
    budget.usedTokens += tokens;
    budget.remainingTokens = budget.maxTokens - budget.usedTokens;
  }

  /**
   * Format layered context for model consumption - SIMPLIFIED VERSION
   */
  formatLayeredContextForModel(result: LayeredContextResult): string {
    const sections: string[] = [];

    // Add layers in priority order - simplified format
    const sortedLayers = result.layers.sort((a, b) => b.priority - a.priority);

    for (const layer of sortedLayers) {
      const formatted = this.formatContextLayer(layer);
      if (formatted.trim()) {
        sections.push(formatted);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Format individual context layer
   */
  private formatContextLayer(layer: ContextLayer): string {
    switch (layer.level) {
      case 'L0':
        return this.formatL0Context(layer);
      case 'L1':
        return this.formatL1Context(layer);
      case 'L2':
        return this.formatL2Context(layer);
      case 'L3':
        return this.formatL3Context(layer);
      default:
        return '';
    }
  }

  private formatL0Context(layer: L0CoreContext): string {
    const parts: string[] = [];

    if (layer.coreEntities.length > 0) {
      parts.push('Core: ' + layer.coreEntities.slice(0, 5).join(', '));
    }

    if (layer.directRelations.length > 0) {
      const relations = layer.directRelations.slice(0, 3).map(rel => 
        `${rel.from}→${rel.to}`
      );
      parts.push('Relations: ' + relations.join(', '));
    }

    return parts.join(' | ');
  }

  private formatL1Context(layer: L1ImmediateContext): string {
    if (layer.relatedEntities.length === 0) return '';
    return 'Related: ' + layer.relatedEntities.slice(0, 6).join(', ');
  }

  private formatL2Context(layer: L2ExtendedContext): string {
    if (layer.neighboringEntities.length === 0) return '';
    return 'Extended: ' + layer.neighboringEntities.slice(0, 4).join(', ');
  }

  private formatL3Context(layer: L3GlobalContext): string {
    return 'Project: ' + layer.projectSummary;
  }
}
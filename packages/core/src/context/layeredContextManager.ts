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
   */
  async generateLayeredContext(
    userInput: string,
    maxTokens: number = this.defaultMaxTokens
  ): Promise<LayeredContextResult> {
    const budget: TokenBudget = {
      maxTokens,
      usedTokens: 0,
      remainingTokens: maxTokens
    };

    const layers: ContextLayer[] = [];
    let truncated = false;
    let truncationDetails = '';

    try {
      // Step 1: Generate L0 (Core Context) - highest priority
      const l0Context = await this.generateL0Context(userInput, budget);
      if (l0Context && this.fitsInBudget(l0Context, budget)) {
        layers.push(l0Context);
        this.consumeBudget(l0Context.estimatedTokens, budget);
      } else {
        truncated = true;
        truncationDetails += 'L0 context exceeds budget; ';
      }

      // Step 2: Generate L1 (Immediate Context) - high priority
      if (budget.remainingTokens > 0) {
        const l1Context = await this.generateL1Context(userInput, l0Context?.coreEntities || [], budget);
        if (l1Context && this.fitsInBudget(l1Context, budget)) {
          layers.push(l1Context);
          this.consumeBudget(l1Context.estimatedTokens, budget);
        } else {
          truncated = true;
          truncationDetails += 'L1 context exceeds remaining budget; ';
        }
      }

      // Step 3: Generate L2 (Extended Context) - medium priority
      if (budget.remainingTokens > 0) {
        const allEntities = [
          ...(l0Context?.coreEntities || []),
          ...(layers.find(l => l.level === 'L1') as L1ImmediateContext)?.relatedEntities || []
        ];
        const l2Context = await this.generateL2Context(userInput, allEntities, budget);
        if (l2Context && this.fitsInBudget(l2Context, budget)) {
          layers.push(l2Context);
          this.consumeBudget(l2Context.estimatedTokens, budget);
        } else {
          truncated = true;
          truncationDetails += 'L2 context exceeds remaining budget; ';
        }
      }

      // Step 4: Generate L3 (Global Context) - lowest priority
      if (budget.remainingTokens > 0) {
        const l3Context = await this.generateL3Context(budget);
        if (l3Context && this.fitsInBudget(l3Context, budget)) {
          layers.push(l3Context);
          this.consumeBudget(l3Context.estimatedTokens, budget);
        } else {
          truncated = true;
          truncationDetails += 'L3 context exceeds remaining budget';
        }
      }

    } catch (error) {
      console.error('[LayeredContextManager] Error generating layered context:', error);
    }

    return {
      layers,
      totalTokens: budget.usedTokens,
      truncated,
      truncationDetails: truncated ? truncationDetails : undefined
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
   * Generate project summary from statistics
   */
  private generateProjectSummary(stats: any): string {
    return `Project contains ${stats.totalNodes} code entities: ${stats.fileNodes} files, ${stats.functionNodes} functions, ${stats.classNodes} classes, with ${stats.importRelations} imports and ${stats.callRelations} function calls.`;
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
   * Format layered context for model consumption
   */
  formatLayeredContextForModel(result: LayeredContextResult): string {
    const sections: string[] = [];

    sections.push('# 🎯 Intelligent Context Analysis');
    sections.push('*Dynamically layered based on your query with smart token management*');
    sections.push('');

    // Add layers in priority order
    const sortedLayers = result.layers.sort((a, b) => b.priority - a.priority);

    for (const layer of sortedLayers) {
      sections.push(this.formatContextLayer(layer));
      sections.push('');
    }

    // Add metadata
    if (result.truncated) {
      sections.push('## ⚠️ Context Truncation Notice');
      sections.push(`Some context was truncated due to token budget limits (${result.totalTokens} tokens used).`);
      if (result.truncationDetails) {
        sections.push(`Details: ${result.truncationDetails}`);
      }
      sections.push('');
    }

    sections.push(`*Context generated using ${result.totalTokens} tokens across ${result.layers.length} layers*`);

    return sections.join('\n');
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
    const sections = [
      '## 🎯 L0: Core Context (Query-Specific)',
      `**Entities directly relevant to your query:**`
    ];

    if (layer.coreEntities.length > 0) {
      sections.push(...layer.coreEntities.map(entity => `- ${entity}`));
    }

    if (layer.directRelations.length > 0) {
      sections.push('', '**Direct relationships:**');
      sections.push(...layer.directRelations.slice(0, 5).map(rel => 
        `- ${rel.from} → ${rel.to} (${rel.type})`
      ));
    }

    return sections.join('\n');
  }

  private formatL1Context(layer: L1ImmediateContext): string {
    const sections = [
      '## 🔗 L1: Immediate Context (One-Hop)',
      `**Related entities (${layer.relatedEntities.length} found):**`
    ];

    if (layer.relatedEntities.length > 0) {
      sections.push(...layer.relatedEntities.slice(0, 10).map(entity => `- ${entity}`));
    }

    return sections.join('\n');
  }

  private formatL2Context(layer: L2ExtendedContext): string {
    const sections = [
      '## 🌐 L2: Extended Context (Two-Hop)',
      `**Neighboring entities (${layer.neighboringEntities.length} found):**`
    ];

    if (layer.neighboringEntities.length > 0) {
      sections.push(...layer.neighboringEntities.slice(0, 8).map(entity => `- ${entity}`));
    }

    return sections.join('\n');
  }

  private formatL3Context(layer: L3GlobalContext): string {
    return [
      '## 📊 L3: Global Context (Project Overview)',
      layer.projectSummary
    ].join('\n');
  }
}
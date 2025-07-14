/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { ContextAgent } from './contextAgent.js';

export interface VectorizedNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'concept' | 'error';
  content: string;
  vector: number[];
  relevanceScore: number;
  metadata: {
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    language?: string;
    frequency?: number;
    lastUsed?: string;
  };
}

export interface RAGSearchResult {
  query: string;
  results: VectorizedNode[];
  searchTime: number;
  totalNodes: number;
}

export interface ContextExtractionResult {
  semanticContext: {
    intent: string;
    confidence: number;
    relatedConcepts: string[];
  };
  codeContext: {
    relevantFiles: VectorizedNode[];
    relevantFunctions: VectorizedNode[];
    relatedPatterns: VectorizedNode[];
  };
  conversationContext: {
    topicProgression: string[];
    userGoals: string[];
    contextualMemory: string[];
  };
  operationalContext: {
    recentActions: string[];
    errorContext: VectorizedNode[];
    workflowSuggestions: string[];
  };
}

/**
 * RAG-based Context Extractor
 * 
 * Uses semantic search over existing knowledge graph to extract relevant context
 * without expensive keyword matching or manual rule systems.
 */
export class RAGContextExtractor {
  private config: Config;
  private contextAgent: ContextAgent | null;
  private vectorIndex: Map<string, VectorizedNode> = new Map();
  private isIndexReady: boolean = false;
  
  // Simple TF-IDF based embedding for lightweight operation
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;

  constructor(config: Config) {
    this.config = config;
    try {
      this.contextAgent = config.getContextAgent();
    } catch {
      this.contextAgent = null;
    }
  }

  /**
   * Initialize RAG index from existing knowledge graph
   */
  async initializeIndex(): Promise<void> {
    if (!this.contextAgent || this.isIndexReady) {
      return;
    }

    const startTime = Date.now();
    
    try {
      if (this.config.getDebugMode()) {
        console.log('[RAGContextExtractor] Building vector index from knowledge graph...');
      }

      // Get knowledge graph data
      const knowledgeGraph = (this.contextAgent as any).knowledgeGraph;
      if (!knowledgeGraph) {
        throw new Error('Knowledge graph not available');
      }

      const graph = knowledgeGraph.getRawGraph();
      const nodes: VectorizedNode[] = [];

      // Extract and vectorize all nodes
      graph.forEachNode((nodeId: string, attributes: any) => {
        const nodeData = attributes.data;
        if (nodeData) {
          const content = this.extractNodeContent(nodeData);
          if (content.trim()) {
            nodes.push({
              id: nodeId,
              type: nodeData.type || 'concept',
              content,
              vector: [], // Will be computed
              relevanceScore: 0,
              metadata: {
                filePath: nodeData.filePath || nodeData.path,
                lineStart: nodeData.startLine,
                lineEnd: nodeData.endLine,
                language: nodeData.language,
                frequency: 1,
                lastUsed: new Date().toISOString()
              }
            });
          }
        }
      });

      // Build vocabulary and compute vectors
      await this.buildVocabularyAndVectors(nodes);
      
      // Store in index
      for (const node of nodes) {
        this.vectorIndex.set(node.id, node);
      }

      this.isIndexReady = true;
      const duration = Date.now() - startTime;

      if (this.config.getDebugMode()) {
        console.log(`[RAGContextExtractor] Index built: ${nodes.length} nodes in ${duration}ms`);
      }

    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[RAGContextExtractor] Failed to build index:', error);
      }
    }
  }

  /**
   * Extract relevant context using RAG search
   */
  async extractContext(
    userInput: string,
    conversationHistory: Array<{role: string, content: string, timestamp: string}> = [],
    recentToolCalls: Array<{name: string, args: any, result?: any}> = []
  ): Promise<ContextExtractionResult> {
    
    // Ensure index is ready
    if (!this.isIndexReady) {
      await this.initializeIndex();
    }

    const result: ContextExtractionResult = {
      semanticContext: {
        intent: this.extractIntent(userInput),
        confidence: 0.8,
        relatedConcepts: []
      },
      codeContext: {
        relevantFiles: [],
        relevantFunctions: [],
        relatedPatterns: []
      },
      conversationContext: {
        topicProgression: this.extractTopicProgression(conversationHistory),
        userGoals: this.extractUserGoals(conversationHistory),
        contextualMemory: this.buildContextualMemory(conversationHistory)
      },
      operationalContext: {
        recentActions: this.formatRecentActions(recentToolCalls),
        errorContext: [],
        workflowSuggestions: []
      }
    };

    if (!this.isIndexReady || this.vectorIndex.size === 0) {
      return result;
    }

    try {
      // 1. Semantic search for code context
      const codeSearchResults = await this.semanticSearch(userInput, 10);
      
      // 2. Categorize results
      result.codeContext.relevantFiles = codeSearchResults.results.filter(n => n.type === 'file').slice(0, 3);
      result.codeContext.relevantFunctions = codeSearchResults.results.filter(n => n.type === 'function').slice(0, 5);
      result.codeContext.relatedPatterns = codeSearchResults.results.filter(n => n.type === 'concept').slice(0, 3);

      // 3. Extract related concepts
      result.semanticContext.relatedConcepts = codeSearchResults.results
        .map(node => this.extractConceptFromContent(node.content))
        .filter(concept => concept.length > 2)
        .slice(0, 5);

      // 4. Search for error-related context if needed
      if (this.isErrorRelated(userInput)) {
        const errorSearch = await this.semanticSearch(userInput + ' error debug', 5);
        result.operationalContext.errorContext = errorSearch.results.slice(0, 3);
      }

      // 5. Generate workflow suggestions
      result.operationalContext.workflowSuggestions = this.generateWorkflowSuggestions(
        result.semanticContext.intent,
        result.codeContext
      );

      if (this.config.getDebugMode()) {
        console.log(`[RAGContextExtractor] Context extracted: ${codeSearchResults.results.length} relevant items found`);
      }

    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[RAGContextExtractor] Context extraction failed:', error);
      }
    }

    return result;
  }

  /**
   * Perform semantic search using TF-IDF cosine similarity
   */
  async semanticSearch(query: string, topK: number = 5): Promise<RAGSearchResult> {
    const startTime = Date.now();
    
    if (!this.isIndexReady) {
      return {
        query,
        results: [],
        searchTime: Date.now() - startTime,
        totalNodes: 0
      };
    }

    const queryVector = this.computeTFIDFVector(query);
    const results: VectorizedNode[] = [];

    // Compute similarity for all nodes
    for (const node of this.vectorIndex.values()) {
      const similarity = this.cosineSimilarity(queryVector, node.vector);
      if (similarity > 0.1) { // Minimum threshold
        results.push({
          ...node,
          relevanceScore: similarity
        });
      }
    }

    // Sort by relevance and take top K
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = results.slice(0, topK);

    return {
      query,
      results: topResults,
      searchTime: Date.now() - startTime,
      totalNodes: this.vectorIndex.size
    };
  }

  /**
   * Extract textual content from knowledge graph node
   */
  private extractNodeContent(nodeData: any): string {
    const parts: string[] = [];
    
    if (nodeData.name) parts.push(nodeData.name);
    if (nodeData.description) parts.push(nodeData.description);
    if (nodeData.filePath) {
      const fileName = nodeData.filePath.split('/').pop() || '';
      parts.push(fileName.replace(/\.[^.]+$/, '')); // Remove extension
    }
    if (nodeData.language) parts.push(nodeData.language);
    if (nodeData.type) parts.push(nodeData.type);
    
    // Add surrounding context if available
    if (nodeData.parameters && Array.isArray(nodeData.parameters)) {
      parts.push(...nodeData.parameters.map((p: any) => p.name || p));
    }
    
    return parts.join(' ').toLowerCase();
  }

  /**
   * Build vocabulary and compute TF-IDF vectors for all nodes
   */
  private async buildVocabularyAndVectors(nodes: VectorizedNode[]): Promise<void> {
    // Step 1: Build vocabulary
    const termCounts = new Map<string, number>();
    
    for (const node of nodes) {
      const terms = this.tokenize(node.content);
      const uniqueTerms = new Set(terms);
      
      for (const term of uniqueTerms) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    }

    // Step 2: Build vocabulary (terms appearing in at least 2 documents)
    let vocabIndex = 0;
    for (const [term, count] of termCounts) {
      if (count >= 2 && term.length > 2) {
        this.vocabulary.set(term, vocabIndex++);
        this.documentFrequency.set(term, count);
      }
    }

    this.totalDocuments = nodes.length;

    // Step 3: Compute TF-IDF vectors for all nodes
    for (const node of nodes) {
      node.vector = this.computeTFIDFVector(node.content);
    }
  }

  /**
   * Compute TF-IDF vector for text
   */
  private computeTFIDFVector(text: string): number[] {
    const terms = this.tokenize(text);
    const termFreq = new Map<string, number>();
    
    // Count term frequencies
    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    // Build vector
    const vector = new Array(this.vocabulary.size).fill(0);
    
    for (const [term, tf] of termFreq) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex !== undefined) {
        const df = this.documentFrequency.get(term) || 1;
        const idf = Math.log(this.totalDocuments / df);
        vector[vocabIndex] = tf * idf;
      }
    }

    return this.normalizeVector(vector);
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ') // Keep alphanumeric and Chinese characters
      .split(/\s+/)
      .filter(term => term.length > 1);
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    
    return dotProduct; // Vectors are already normalized
  }

  // Helper methods for context extraction
  private extractIntent(userInput: string): string {
    const input = userInput.toLowerCase();
    
    if (input.includes('文档') || input.includes('总结') || input.includes('markdown')) return 'documentation';
    if (input.includes('分析') && !input.includes('实现')) return 'analysis';
    if (input.includes('实现') || input.includes('开发') || input.includes('创建')) return 'development';
    if (input.includes('修复') || input.includes('调试') || input.includes('error')) return 'debugging';
    if (input.includes('测试') || input.includes('验证')) return 'testing';
    if (input.includes('优化') || input.includes('重构')) return 'refactoring';
    
    return 'general';
  }

  private extractTopicProgression(history: Array<{role: string, content: string}>): string[] {
    return history
      .filter(msg => msg.role === 'user')
      .slice(-3)
      .map(msg => this.extractMainTopic(msg.content))
      .filter(topic => topic.length > 0);
  }

  private extractUserGoals(history: Array<{role: string, content: string}>): string[] {
    const goals: string[] = [];
    
    for (const msg of history.slice(-5)) {
      if (msg.role === 'user') {
        const actionWords = ['实现', '创建', '开发', '修复', '分析', '优化', '添加'];
        for (const action of actionWords) {
          if (msg.content.includes(action)) {
            goals.push(`${action}相关功能`);
            break;
          }
        }
      }
    }
    
    return [...new Set(goals)];
  }

  private buildContextualMemory(history: Array<{role: string, content: string}>): string[] {
    return history
      .slice(-10)
      .map(msg => msg.content.substring(0, 100))
      .filter(content => content.length > 10);
  }

  private formatRecentActions(toolCalls: Array<{name: string, args: any}>): string[] {
    return toolCalls
      .slice(-5)
      .map(call => `${call.name}: ${JSON.stringify(call.args).substring(0, 50)}...`);
  }

  private isErrorRelated(userInput: string): boolean {
    return /错误|error|失败|fail|bug|问题|异常/.test(userInput.toLowerCase());
  }

  private extractMainTopic(content: string): string {
    // Extract the main subject/noun from the content
    const topics = content.match(/[a-zA-Z]+|[\u4e00-\u9fff]+/g) || [];
    return topics.find(topic => topic.length > 2) || '';
  }

  private extractConceptFromContent(content: string): string {
    const words = content.split(' ').filter(w => w.length > 3);
    return words[0] || '';
  }

  private generateWorkflowSuggestions(intent: string, codeContext: any): string[] {
    const suggestions: string[] = [];
    
    switch (intent) {
      case 'development':
        suggestions.push('Review existing patterns', 'Plan implementation', 'Write tests');
        break;
      case 'debugging':
        suggestions.push('Check error logs', 'Reproduce issue', 'Add debug points');
        break;
      case 'analysis':
        suggestions.push('Examine code structure', 'Generate diagrams', 'Document findings');
        break;
      case 'documentation':
        suggestions.push('Create markdown files', 'Add code comments', 'Update README');
        break;
    }
    
    return suggestions;
  }

  /**
   * Get index statistics for debugging
   */
  getIndexStats(): { vocabSize: number; nodeCount: number; isReady: boolean } {
    return {
      vocabSize: this.vocabulary.size,
      nodeCount: this.vectorIndex.size,
      isReady: this.isIndexReady
    };
  }
}
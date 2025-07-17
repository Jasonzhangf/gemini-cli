/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { IVectorSearchProvider, VectorQuery, VectorSearchResponse, VectorSearchResult } from '../../interfaces/contextProviders.js';

interface SiliconFlowConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  dimensions: number;
  timeout?: number;
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class SiliconFlowEmbeddingProvider implements IVectorSearchProvider {
  private documents: Map<string, { content: string; metadata: Record<string, any>; embedding?: number[] }> = new Map();
  private config: SiliconFlowConfig;
  private initialized = false;
  private externalToolIdentifiers: Set<string>;

  constructor(config: Partial<SiliconFlowConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.SILICONFLOW_API_KEY || '',
      baseUrl: config.baseUrl || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
      model: config.model || process.env.SILICONFLOW_EMBEDDING_MODEL || 'BAAI/bge-m3',
      dimensions: config.dimensions || 1024,
      timeout: config.timeout || 30000
    };
    
    // 初始化外部工具标识符黑名单
    this.externalToolIdentifiers = new Set([
      'GEMINI_CLI_TOOL_CALL_NAME',
      'GEMINI_CLI_TOOL_CALL_DECISION', 
      'GEMINI_CLI_TOOL_CALL_SUCCESS',
      'GEMINI_CLI_TOOL_CALL_DURATION_MS',
      'GEMINI_CLI_TOOL_CALL_ERROR_TYPE',
      'TOOL_CALL',
      'TOOL_CALL_PATTERN',
      'EVENT_TOOL_CALL'
    ]);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.config.apiKey) {
      console.warn('[SiliconFlow] API key not provided, falling back to text matching mode');
      this.initialized = true;
      return;
    }

    try {
      // Test API connection with a simple embedding request
      await this.generateEmbedding('test');
      this.initialized = true;
      console.log('[SiliconFlow] Embedding provider initialized successfully');
    } catch (error) {
      console.warn('[SiliconFlow] Failed to initialize, falling back to text matching:', error);
      this.initialized = true;
    }
  }

  async indexDocument(id: string, content: string, metadata: Record<string, any>): Promise<void> {
    let embedding: number[] | undefined;
    
    if (this.config.apiKey) {
      try {
        embedding = await this.generateEmbedding(content);
      } catch (error) {
        console.warn(`[SiliconFlow] Failed to generate embedding for document ${id}:`, error);
      }
    }

    this.documents.set(id, { content, metadata, embedding });
  }

  async search(query: string | VectorQuery, options?: { maxResults?: number }): Promise<VectorSearchResponse> {
    const startTime = Date.now();
    const queryText = typeof query === 'string' ? query : query.text;
    const maxResults = options?.maxResults || 10;

    let results: VectorSearchResult[] = [];

    if (this.config.apiKey) {
      try {
        // Use embedding-based search
        results = await this.searchByEmbedding(queryText, maxResults);
      } catch (error) {
        console.warn('[SiliconFlow] Embedding search failed, falling back to text matching:', error);
        results = await this.searchByTextMatching(queryText, maxResults);
      }
    } else {
      // Use text matching as fallback
      results = await this.searchByTextMatching(queryText, maxResults);
    }

    const searchTime = Date.now() - startTime;

    return {
      query: queryText,
      results,
      searchTime,
      totalDocuments: this.documents.size,
    };
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        encoding_format: 'float'
      }),
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });

    if (!response.ok) {
      throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
    }

    const data: EmbeddingResponse = await response.json();
    
    if (!data.data || data.data.length === 0) {
      throw new Error('No embedding data returned from SiliconFlow API');
    }

    return data.data[0].embedding;
  }

  private async searchByEmbedding(queryText: string, maxResults: number): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(queryText);
    const results: VectorSearchResult[] = [];

    for (const [id, doc] of this.documents.entries()) {
      if (!doc.embedding) {
        // Generate embedding for documents that don't have one
        try {
          doc.embedding = await this.generateEmbedding(doc.content);
        } catch (error) {
          console.warn(`[SiliconFlow] Failed to generate embedding for document ${id}, skipping`);
          continue;
        }
      }

      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      
      if (similarity > 0.1) { // Minimum similarity threshold
        results.push({
          id,
          content: doc.content,
          score: similarity,
          metadata: {
            ...doc.metadata,
            searchMethod: 'embedding',
            similarity
          },
        });
      }
    }

    // Sort by similarity score (highest first)
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  private async searchByTextMatching(queryText: string, maxResults: number): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    const queryLower = queryText.toLowerCase();

    // Enhanced text matching with multiple strategies
    const queryWords = this.tokenizeQuery(queryLower);

    for (const [id, doc] of this.documents.entries()) {
      const contentLower = doc.content.toLowerCase();
      const score = this.calculateTextMatchScore(queryWords, contentLower, queryLower);
      
      if (score > 0) {
        results.push({
          id,
          content: doc.content,
          score,
          metadata: {
            ...doc.metadata,
            searchMethod: 'text_matching',
            matchScore: score
          },
        });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  private tokenizeQuery(queryLower: string): string[] {
    // Enhanced tokenization for better matching
    let queryWords: string[];
    
    if (queryLower.includes(' ')) {
      // For space-separated text, split by words
      queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
    } else {
      // For Chinese or other languages, use character-based approach
      // But also try to extract meaningful tokens
      const chars = Array.from(queryLower).filter(char => char.length > 0);
      const bigrams = [];
      for (let i = 0; i < chars.length - 1; i++) {
        bigrams.push(chars[i] + chars[i + 1]);
      }
      queryWords = [...chars, ...bigrams];
    }
    
    return queryWords;
  }

  private calculateTextMatchScore(queryWords: string[], contentLower: string, fullQuery: string): number {
    let score = 0;
    const contentWords = contentLower.split(/\s+/);
    
    // 检查内容是否包含外部工具标识符，如果是则大幅降低评分
    const hasExternalToolIdentifiers = Array.from(this.externalToolIdentifiers).some(identifier => 
      contentLower.includes(identifier.toLowerCase())
    );
    
    if (hasExternalToolIdentifiers) {
      // 如果包含外部工具标识符，评分降低90%
      score *= 0.1;
    }
    
    // Exact phrase match (highest score)
    if (contentLower.includes(fullQuery)) {
      score += 2.0;
    }
    
    // Word/token matching - 过滤外部工具标识符
    const filteredQueryWords = queryWords.filter(word => 
      !this.externalToolIdentifiers.has(word.toUpperCase())
    );
    
    if (filteredQueryWords.length === 0) {
      return 0; // 如果查询词全是外部标识符，返回0分
    }
    
    const matchingWords = filteredQueryWords.filter(word => contentLower.includes(word));
    const wordMatchRatio = matchingWords.length / filteredQueryWords.length;
    score += wordMatchRatio * 1.0;
    
    // Bonus for word boundary matches
    const exactWordMatches = filteredQueryWords.filter(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(contentLower);
    });
    score += (exactWordMatches.length / filteredQueryWords.length) * 0.5;
    
    // Proximity bonus (words appearing close to each other)
    if (matchingWords.length > 1) {
      score += this.calculateProximityBonus(matchingWords, contentLower) * 0.3;
    }
    
    // 如果包含外部工具标识符，最终评分再次降低
    if (hasExternalToolIdentifiers) {
      score *= 0.1;
    }
    
    return Math.min(score, 3.0); // Cap at 3.0
  }

  private calculateProximityBonus(matchingWords: string[], content: string): number {
    // Simple proximity calculation
    const positions = matchingWords.map(word => {
      const index = content.indexOf(word);
      return index >= 0 ? index : Infinity;
    }).filter(pos => pos !== Infinity);
    
    if (positions.length < 2) return 0;
    
    positions.sort((a, b) => a - b);
    const maxDistance = positions[positions.length - 1] - positions[0];
    
    // Closer words get higher bonus
    return Math.max(0, 1 - (maxDistance / 1000));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async removeDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async getIndexStats(): Promise<{ documentCount: number; vectorDimensions: number; indexSize: string; lastUpdated: string; }> {
    return {
      documentCount: this.documents.size,
      vectorDimensions: 0, // Not applicable for this simple provider
      indexSize: '0 MB',
      lastUpdated: new Date().toISOString(),
    };
  }

  async dispose(): Promise<void> {
    this.documents.clear();
  }
}

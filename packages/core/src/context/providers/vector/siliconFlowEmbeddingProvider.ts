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
      throw new Error('[SiliconFlow] API key not provided. Please set SILICONFLOW_API_KEY environment variable.');
    }

    try {
      // Test API connection with a simple embedding request
      await this.generateEmbedding('test');
      this.initialized = true;
      console.log('[SiliconFlow] Embedding provider initialized successfully');
    } catch (error) {
      throw new Error(`[SiliconFlow] Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
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

    // Only use embedding-based search, no text matching fallback
    const results = await this.searchByEmbedding(queryText, maxResults);

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

    for (const [id, doc] of Array.from(this.documents.entries())) {
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

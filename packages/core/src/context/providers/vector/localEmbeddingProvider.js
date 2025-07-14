/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IVectorSearchProvider, 
  VectorSearchResult, 
  VectorQuery, 
  VectorSearchResponse 
} from '../../interfaces/contextProviders.js';

interface LocalEmbeddingConfig {
  modelName?: string;
  dimensions?: number;
  batchSize?: number;
  cacheSize?: number;
  similarityThreshold?: number;
}

interface EmbeddingDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  lastUpdated: string;
}

/**
 * Local embedding-based vector search provider
 * Uses local models for generating embeddings (placeholder implementation)
 * In production, this would integrate with local embedding models like sentence-transformers
 */
export class LocalEmbeddingVectorProvider implements IVectorSearchProvider {
  private documents: Map<string, EmbeddingDocument> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  private config: LocalEmbeddingConfig;
  private isInitialized = false;

  constructor(config: LocalEmbeddingConfig = {}) {
    this.config = {
      modelName: 'all-MiniLM-L6-v2',
      dimensions: 384,
      batchSize: 100,
      cacheSize: 1000,
      similarityThreshold: 0.1,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize local embedding model
    // In production, this would load a local model like sentence-transformers
    console.log(`[LocalEmbeddingProvider] Initializing with model: ${this.config.modelName}`);
    
    // Placeholder initialization
    this.isInitialized = true;
  }

  async indexDocument(id: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Generate embedding for the document
    const embedding = await this.generateEmbedding(content);

    // Store document with embedding
    const document: EmbeddingDocument = {
      id,
      content,
      embedding,
      metadata,
      lastUpdated: new Date().toISOString()
    };

    this.documents.set(id, document);

    // Manage cache size
    if (this.embeddingCache.size > this.config.cacheSize!) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
    }
  }

  async search(query: VectorQuery): Promise<VectorSearchResponse> {
    const startTime = Date.now();
    
    if (!this.isInitialized || this.documents.size === 0) {
      return {
        query: query.text,
        results: [],
        searchTime: Date.now() - startTime,
        totalDocuments: 0
      };
    }

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query.text);
    const results: VectorSearchResult[] = [];

    // Calculate similarity with all documents
    for (const [docId, document] of this.documents) {
      // Apply filters if specified
      if (query.filters) {
        let matches = true;
        for (const [key, value] of Object.entries(query.filters)) {
          if (document.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, document.embedding);
      
      // Apply threshold
      if (similarity >= (query.threshold || this.config.similarityThreshold!)) {
        results.push({
          id: docId,
          content: document.content,
          score: similarity,
          metadata: query.includeMetadata ? document.metadata : {}
        });
      }
    }

    // Sort by similarity score (descending)
    results.sort((a, b) => b.score - a.score);

    // Apply topK limit
    const limitedResults = results.slice(0, query.topK || 10);

    return {
      query: query.text,
      results: limitedResults,
      searchTime: Date.now() - startTime,
      totalDocuments: this.documents.size
    };
  }

  async removeDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async getIndexStats(): Promise<{
    documentCount: number;
    vectorDimensions: number;
    indexSize: string;
    lastUpdated: string;
  }> {
    const documentCount = this.documents.size;
    const vectorDimensions = this.config.dimensions!;
    const indexSize = this.estimateIndexSize();

    return {
      documentCount,
      vectorDimensions,
      indexSize,
      lastUpdated: new Date().toISOString()
    };
  }

  async dispose(): Promise<void> {
    this.documents.clear();
    this.embeddingCache.clear();
    this.isInitialized = false;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Generate embedding
    // In production, this would use a local model like sentence-transformers
    const embedding = await this.mockEmbeddingGeneration(text);
    
    // Cache the result
    this.embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  }

  private async mockEmbeddingGeneration(text: string): Promise<number[]> {
    // This is a placeholder implementation
    // In production, this would integrate with a local embedding model
    
    // Simple hash-based pseudo-embedding for demonstration
    const embedding = new Array(this.config.dimensions!).fill(0);
    
    // Use text characteristics to generate a pseudo-embedding
    const words = text.toLowerCase().split(/\s+/);
    const textLength = text.length;
    
    for (let i = 0; i < this.config.dimensions!; i++) {
      let value = 0;
      
      // Factor in text length
      value += (textLength % 100) / 100;
      
      // Factor in word count
      value += (words.length % 50) / 50;
      
      // Factor in character distribution
      const charCode = text.charCodeAt(i % text.length);
      value += (charCode % 256) / 256;
      
      // Factor in word characteristics
      if (words.length > 0) {
        const word = words[i % words.length];
        value += (word.length % 20) / 20;
      }
      
      // Add some controlled randomness based on position
      value += Math.sin(i * 0.1) * 0.1;
      
      embedding[i] = value;
    }
    
    // Normalize the embedding
    return this.normalizeVector(embedding);
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    
    return Math.max(0, Math.min(1, dotProduct)); // Clamp to [0, 1]
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private estimateIndexSize(): string {
    const bytesPerFloat = 4; // 32-bit floats
    const bytesPerString = 50; // Rough estimate for strings
    
    const embeddingsSize = this.documents.size * this.config.dimensions! * bytesPerFloat;
    const contentSize = this.documents.size * 200; // Rough estimate for content
    const metadataSize = this.documents.size * 100; // Rough estimate for metadata
    const cacheSize = this.embeddingCache.size * this.config.dimensions! * bytesPerFloat;
    
    const totalBytes = embeddingsSize + contentSize + metadataSize + cacheSize;
    
    if (totalBytes < 1024) return `${totalBytes}B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)}KB`;
    if (totalBytes < 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  /**
   * Get embedding for a text (for debugging)
   */
  async getEmbedding(text: string): Promise<number[]> {
    return await this.generateEmbedding(text);
  }

  /**
   * Get all indexed documents
   */
  getDocuments(): Map<string, EmbeddingDocument> {
    return new Map(this.documents);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    maxCacheSize: number;
    hitRate: number;
  } {
    return {
      cacheSize: this.embeddingCache.size,
      maxCacheSize: this.config.cacheSize!,
      hitRate: 0.8 // Placeholder - would track actual hit rate in production
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Batch process multiple documents
   */
  async batchIndexDocuments(documents: Array<{ id: string; content: string; metadata?: Record<string, any> }>): Promise<void> {
    const batchSize = this.config.batchSize!;
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      // Process batch in parallel
      const promises = batch.map(doc => 
        this.indexDocument(doc.id, doc.content, doc.metadata || {})
      );
      
      await Promise.all(promises);
    }
  }
}
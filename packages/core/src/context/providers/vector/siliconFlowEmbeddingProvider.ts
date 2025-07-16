/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { IVectorSearchProvider, VectorQuery, VectorSearchResponse, VectorSearchResult } from '../../interfaces/contextProviders.js';

export class SiliconFlowEmbeddingProvider implements IVectorSearchProvider {
  private documents: Map<string, { content: string; metadata: Record<string, any> }> = new Map();

  async initialize(): Promise<void> {
    // No-op for this simple in-memory provider
  }

  async indexDocument(id: string, content: string, metadata: Record<string, any>): Promise<void> {
    this.documents.set(id, { content, metadata });
  }

  async search(query: string | VectorQuery, options?: { maxResults?: number }): Promise<VectorSearchResponse> {
    const results: VectorSearchResult[] = [];
    const queryText = typeof query === 'string' ? query : query.text;
    const queryLower = queryText.toLowerCase();

    // Split query into words for better matching
    // For Chinese text, split by characters if no spaces are found
    let queryWords: string[];
    if (queryLower.includes(' ')) {
      queryWords = queryLower.split(/\s+/).filter(word => word.length > 0);
    } else {
      // For Chinese or other languages without spaces, use individual characters
      queryWords = Array.from(queryLower).filter(char => char.length > 0);
    }

    for (const [id, doc] of this.documents.entries()) {
      const contentLower = doc.content.toLowerCase();
      
      // Check if any query word is found in the content
      const matchingWords = queryWords.filter(word => contentLower.includes(word));
      
      if (matchingWords.length > 0) {
        // Score based on how many words match
        const score = matchingWords.length / queryWords.length;
        
        results.push({
          id,
          content: doc.content,
          score,
          metadata: doc.metadata,
        });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return {
      query: queryText,
      results: results.slice(0, options?.maxResults || 10),
      searchTime: 0,
      totalDocuments: this.documents.size,
    };
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

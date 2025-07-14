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

interface TFIDFConfig {
  maxFeatures?: number;
  minDocFreq?: number;
  maxDocFreq?: number;
  stopWords?: string[];
  enableStemming?: boolean;
}

interface DocumentVector {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, any>;
  lastUpdated: string;
}

/**
 * TF-IDF based vector search provider
 * Lightweight implementation using term frequency-inverse document frequency
 */
export class TFIDFVectorProvider implements IVectorSearchProvider {
  private documents: Map<string, DocumentVector> = new Map();
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private config: TFIDFConfig;
  private isInitialized = false;

  constructor(config: TFIDFConfig = {}) {
    this.config = {
      maxFeatures: 2000,
      minDocFreq: 2,
      maxDocFreq: 0.95,
      stopWords: this.getDefaultStopWords(),
      enableStemming: false,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // TF-IDF is ready immediately
    this.isInitialized = true;
  }

  async indexDocument(id: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
    const existingDoc = this.documents.get(id);
    if (existingDoc) {
      // Update existing document
      await this.removeDocument(id);
    }

    // Tokenize and process content
    const tokens = this.tokenize(content);
    const termFreq = this.calculateTermFrequency(tokens);

    // Update document frequency counts
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
    }

    // Store document temporarily (vector will be computed later)
    const document: DocumentVector = {
      id,
      content,
      vector: [],
      metadata,
      lastUpdated: new Date().toISOString()
    };

    this.documents.set(id, document);

    // Rebuild vocabulary and vectors
    await this.rebuildVocabularyAndVectors();
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

    // Compute query vector
    const queryVector = this.computeTFIDFVector(query.text);
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

      const similarity = this.cosineSimilarity(queryVector, document.vector);
      
      // Apply threshold
      if (similarity >= (query.threshold || 0.1)) {
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
    const document = this.documents.get(id);
    if (!document) return;

    // Remove from documents
    this.documents.delete(id);

    // Update document frequency counts
    const tokens = this.tokenize(document.content);
    const uniqueTerms = new Set(tokens);
    
    for (const term of uniqueTerms) {
      const currentFreq = this.documentFrequency.get(term) || 0;
      if (currentFreq <= 1) {
        this.documentFrequency.delete(term);
      } else {
        this.documentFrequency.set(term, currentFreq - 1);
      }
    }

    // Rebuild vocabulary and vectors
    await this.rebuildVocabularyAndVectors();
  }

  async getIndexStats(): Promise<{
    documentCount: number;
    vectorDimensions: number;
    indexSize: string;
    lastUpdated: string;
  }> {
    const documentCount = this.documents.size;
    const vectorDimensions = this.vocabulary.size;
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
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.isInitialized = false;
  }

  private async rebuildVocabularyAndVectors(): Promise<void> {
    // Clear existing vocabulary
    this.vocabulary.clear();

    // Build vocabulary based on document frequency constraints
    const sortedTerms = Array.from(this.documentFrequency.entries())
      .filter(([term, freq]) => {
        const docFreqRatio = freq / this.documents.size;
        return freq >= this.config.minDocFreq! && 
               docFreqRatio <= this.config.maxDocFreq! &&
               !this.config.stopWords!.includes(term);
      })
      .sort(([, a], [, b]) => b - a)
      .slice(0, this.config.maxFeatures!);

    // Build vocabulary index
    sortedTerms.forEach(([term], index) => {
      this.vocabulary.set(term, index);
    });

    // Recompute all document vectors
    for (const [docId, document] of this.documents) {
      document.vector = this.computeTFIDFVector(document.content);
      this.documents.set(docId, document);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ') // Keep alphanumeric and Chinese characters
      .split(/\s+/)
      .filter(token => token.length > 1)
      .map(token => this.config.enableStemming ? this.simpleStem(token) : token);
  }

  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const termFreq = new Map<string, number>();
    
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    return termFreq;
  }

  private computeTFIDFVector(text: string): number[] {
    const tokens = this.tokenize(text);
    const termFreq = this.calculateTermFrequency(tokens);
    const vector = new Array(this.vocabulary.size).fill(0);

    for (const [term, tf] of termFreq) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex !== undefined) {
        const df = this.documentFrequency.get(term) || 1;
        const idf = Math.log(this.documents.size / df);
        vector[vocabIndex] = tf * idf;
      }
    }

    return this.normalizeVector(vector);
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
    
    return dotProduct; // Vectors are already normalized
  }

  private simpleStem(word: string): string {
    // Very basic stemming - remove common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion', 'ness', 'ment'];
    
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }
    
    return word;
  }

  private estimateIndexSize(): string {
    const bytesPerNumber = 8; // 64-bit floats
    const bytesPerString = 50; // Rough estimate for strings
    
    const vocabularySize = this.vocabulary.size * bytesPerString;
    const vectorsSize = this.documents.size * this.vocabulary.size * bytesPerNumber;
    const metadataSize = this.documents.size * 200; // Rough estimate
    
    const totalBytes = vocabularySize + vectorsSize + metadataSize;
    
    if (totalBytes < 1024) return `${totalBytes}B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)}KB`;
    if (totalBytes < 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  private getDefaultStopWords(): string[] {
    return [
      // English stop words
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'a', 'an', 'it', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'them', 'us', 'my', 'your', 'his', 'her', 'their', 'our', 'its', 'who', 'what', 'when', 'where', 'why', 'how', 'which', 'whose', 'whom', 'if', 'then', 'else', 'than', 'so', 'just', 'now', 'here', 'there', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'more', 'most', 'other', 'any', 'some', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      // Chinese stop words
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '个', '里', '为', '子', '对', '小', '多', '然后', '她', '后', '手', '两', '回', '而', '起', '第', '三', '做', '头', '出', '可', '还', '公', '长', '用', '他', '国', '时', '来', '学', '只', '如', '知', '成', '这样', '以', '下', '面', '而且', '年', '同', '日', '什么', '没', '当', '得', '男', '又', '现在', '比', '因为', '女', '开始', '最', '向', '活', '但是', '太', '见', '小孩', '已经', '听', '从', '让', '打', '名', '几', '望', '钱', '每', '主', '意', '样', '情', '想', '找', '许多', '那样', '接', '告', '些', '呢', '看见', '中', '路', '认为', '总是', '怎么', '什么的', '儿', '原来', '这里', '以后', '关于', '台', '候', '走', '给', '每个', '支', '变', '十', '认'
    ];
  }

  /**
   * Get current vocabulary for debugging
   */
  getVocabulary(): Map<string, number> {
    return new Map(this.vocabulary);
  }

  /**
   * Get document frequency statistics
   */
  getDocumentFrequencies(): Map<string, number> {
    return new Map(this.documentFrequency);
  }

  /**
   * Get all indexed documents
   */
  getDocuments(): Map<string, DocumentVector> {
    return new Map(this.documents);
  }
}
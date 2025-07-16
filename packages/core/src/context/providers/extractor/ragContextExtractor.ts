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
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getProjectHash, getProjectFolderName } from '../../../utils/paths.js';
import { RAGIncrementalIndexer, RAGIndexTrigger, FileChangeType } from './ragIncrementalIndexer.js';
import { ProjectStorageManager } from '../../../config/projectStorageManager.js';

type RAGLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface RAGInputData {
  userRawInput: string;
  modelFilteredInput?: string;
  conversationHistory?: any[];
  availableTools?: any[];
  recentOperations?: any[];
}

interface RAGExtractorConfig {
  maxResults?: number;
  threshold?: number;
  combineStrategies?: boolean;
  enableSemanticAnalysis?: boolean;
  debugMode?: boolean;
  ragLevel?: RAGLevel;
  useHybridRetrieval?: boolean;
  enableGraphTraversal?: boolean;
  semanticSimilarityAlgorithm?: 'bm25' | 'cosine';
  dynamicEntityExtraction?: boolean;
  contextWindowSize?: number;
  persistentStorage?: boolean;
  projectRoot?: string;
  storageDir?: string;
}

class TextAnalyzer {
  private stopWords: Set<string>;
  private documentFrequency: Map<string, number> = new Map();
  private corpusSize: number = 0;
  
  constructor() {
    this.stopWords = new Set();
  }
  
  tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    
    const tokens = text
      .toLowerCase()
      .replace(/([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f])/g, ' $1 ')
      .replace(/\b/g, ' ')
      .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
    
    return this.filterStopWords(tokens);
  }
  
  private filterStopWords(tokens: string[]): string[] {
    if (this.corpusSize === 0) {
      return tokens.filter(token => token.length > 1);
    }
    
    return tokens.filter(token => {
      if (token.length <= 1) return false;
      
      const freq = this.documentFrequency.get(token) || 0;
      const relativeFreq = freq / this.corpusSize;
      
      return relativeFreq < 0.7;
    });
  }
  
  calculateTFIDF(tokens: string[], allDocumentTokens: string[][]): Map<string, number> {
    const tfIdfScores = new Map<string, number>();
    const tokenCounts = new Map<string, number>();
    
    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    });
    
    const docLength = tokens.length;
    
    tokenCounts.forEach((count, token) => {
      const tf = count / docLength;
      const idf = this.calculateIDF(token, allDocumentTokens);
      tfIdfScores.set(token, tf * idf);
    });
    
    return tfIdfScores;
  }
  
  private calculateIDF(token: string, allDocumentTokens: string[][]): number {
    const documentsContainingToken = allDocumentTokens.filter(docTokens => 
      docTokens.includes(token)
    ).length;
    
    if (documentsContainingToken === 0) return 0;
    
    return Math.log(allDocumentTokens.length / documentsContainingToken);
  }
  
  calculateBM25(queryTokens: string[], documentTokens: string[], allDocumentTokens: string[][]): number {
    const k1 = 1.2;
    const b = 0.75;
    
    const avgDocLength = allDocumentTokens.reduce((sum, doc) => sum + doc.length, 0) / allDocumentTokens.length;
    const docLength = documentTokens.length;
    
    let score = 0;
    
    queryTokens.forEach(queryToken => {
      const termFreq = documentTokens.filter(token => token === queryToken).length;
      const idf = this.calculateIDF(queryToken, allDocumentTokens);
      
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDocLength));
      
      score += idf * (numerator / denominator);
    });
    
    return score;
  }
  
  calculateCosineSimilarity(tokens1: string[], tokens2: string[]): number {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / Math.sqrt(set1.size * set2.size);
  }
  
  updateCorpusStatistics(documentTokens: (string | undefined)[]): void {
    const validDocuments = documentTokens.filter((doc): doc is string => typeof doc === 'string');
    this.corpusSize = validDocuments.length;
    this.documentFrequency.clear();
    
    const tokenizedDocuments = validDocuments.map(doc => this.tokenize(doc));
    
    tokenizedDocuments.forEach(tokens => {
      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(token => {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      });
    });
  }
}

export class RAGContextExtractor implements IContextExtractor {
  private config: RAGExtractorConfig;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;
  private isInitialized = false;
  private textAnalyzer: TextAnalyzer;
  private documentCorpus: string[][] = [];

  constructor(
    config: RAGExtractorConfig = {},
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ) {
    this.config = {
      maxResults: 8,
      threshold: 0.1,
      ...config,
    };
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    this.textAnalyzer = new TextAnalyzer();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.vectorProvider.initialize();
    await this.graphProvider.initialize();
    this.isInitialized = true;
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    const userInput = query.userInput;
    const tokens = this.textAnalyzer.tokenize(userInput);
    
    const vectorResults = await this.vectorProvider.search({ text: tokens.join(' '), topK: this.config.maxResults }, { maxResults: this.config.maxResults });

    return {
      semantic: { intent: 'unknown', confidence: 0, entities: [], concepts: [] },
      code: {
        relevantFiles: vectorResults.results.map(r => ({ path: r.id, summary: r.content, relevance: r.score })),
        relevantFunctions: [],
        relatedPatterns: [],
      },
      conversation: { userGoals: [], topicProgression: [], contextContinuity: [] },
      operational: { recentActions: [], workflowSuggestions: [], errorContext: [] },
    };
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
    if(update.type === 'file_change' && update.data.content){
        await this.vectorProvider.indexDocument(update.data.filePath, update.data.content);
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
        'Context Extraction',
        'Semantic Search',
      ],
    };
  }

  async dispose(): Promise<void> {
    await this.vectorProvider.dispose();
    await this.graphProvider.dispose();
    this.isInitialized = false;
  }
}

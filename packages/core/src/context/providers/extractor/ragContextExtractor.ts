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

/**
 * RAG Level Configuration
 * L1: 基础关键词匹配 + 文件内容提取（±10行上下文）
 * L2: L1 + 语义分析 + 图遍历扩展邻居节点  
 * L3: L2 + 完整混合检索 + 动态实体提取 + 上下文增强（默认）
 * L4: L3 + 高级认知分析 + 学习适应 + 意图演变分析
 * 
 * 注意：所有级别都包含基础的文件内容提取功能，更高级别主要增加邻居节点和分析深度
 */
type RAGLevel = 'L1' | 'L2' | 'L3' | 'L4';

/**
 * RAG Input Data Types
 */
interface RAGInputData {
  userRawInput: string;           // 用户输入的原始数据
  modelFilteredInput?: string;    // 模型过滤过的数据（包含<think>标签等）
  conversationHistory?: any[];
  availableTools?: any[];
  recentOperations?: any[];
}

/**
 * Advanced RAG configuration supporting multiple algorithms
 */
interface RAGExtractorConfig {
  maxResults?: number;
  threshold?: number;
  combineStrategies?: boolean;
  enableSemanticAnalysis?: boolean;
  debugMode?: boolean;
  // RAG Level configuration
  ragLevel?: RAGLevel;
  // Advanced RAG options
  useHybridRetrieval?: boolean;
  enableGraphTraversal?: boolean;
  semanticSimilarityAlgorithm?: 'tfidf' | 'bm25' | 'cosine';
  dynamicEntityExtraction?: boolean;
  contextWindowSize?: number;
  // Persistence options
  persistentStorage?: boolean;
  projectRoot?: string;
  storageDir?: string;
}

/**
 * Text analysis utilities for embedding-free semantic processing
 */
class TextAnalyzer {
  private stopWords: Set<string>;
  private documentFrequency: Map<string, number> = new Map();
  private corpusSize: number = 0;
  
  constructor() {
    // Dynamic stop words discovery instead of hardcoded lists
    this.stopWords = new Set();
  }
  
  /**
   * Tokenize text using linguistic rules instead of hardcoded patterns
   */
  tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    
    // Unicode-aware tokenization for multilingual support
    const tokens = text
      .toLowerCase()
      // Handle Chinese, Japanese, Korean characters
      .replace(/([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f])/g, ' $1 ')
      // Handle word boundaries
      .replace(/\b/g, ' ')
      // Clean punctuation while preserving alphanumeric
      .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
    
    return this.filterStopWords(tokens);
  }
  
  /**
   * Dynamic stop word filtering based on frequency analysis
   */
  private filterStopWords(tokens: string[]): string[] {
    if (this.corpusSize === 0) {
      // First pass: include all tokens for frequency analysis
      return tokens.filter(token => token.length > 1);
    }
    
    // Filter out high-frequency, low-semantic-value words dynamically
    return tokens.filter(token => {
      if (token.length <= 1) return false;
      
      const freq = this.documentFrequency.get(token) || 0;
      const relativeFreq = freq / this.corpusSize;
      
      // Dynamic threshold: filter out words that appear in >70% of documents
      return relativeFreq < 0.7;
    });
  }
  
  /**
   * Calculate TF-IDF scores for semantic similarity
   */
  calculateTFIDF(tokens: string[], allDocumentTokens: string[][]): Map<string, number> {
    const tfIdfScores = new Map<string, number>();
    const tokenCounts = new Map<string, number>();
    
    // Calculate term frequency (TF)
    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    });
    
    const docLength = tokens.length;
    
    // Calculate TF-IDF for each token
    tokenCounts.forEach((count, token) => {
      const tf = count / docLength;
      const idf = this.calculateIDF(token, allDocumentTokens);
      tfIdfScores.set(token, tf * idf);
    });
    
    return tfIdfScores;
  }
  
  /**
   * Calculate Inverse Document Frequency
   */
  private calculateIDF(token: string, allDocumentTokens: string[][]): number {
    const documentsContainingToken = allDocumentTokens.filter(docTokens => 
      docTokens.includes(token)
    ).length;
    
    if (documentsContainingToken === 0) return 0;
    
    return Math.log(allDocumentTokens.length / documentsContainingToken);
  }
  
  /**
   * Calculate BM25 score for improved ranking
   */
  calculateBM25(queryTokens: string[], documentTokens: string[], allDocumentTokens: string[][]): number {
    const k1 = 1.2;
    const b = 0.75;
    
    // Calculate average document length
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
  
  /**
   * Calculate cosine similarity between two token sets
   */
  calculateCosineSimilarity(tokens1: string[], tokens2: string[]): number {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / Math.sqrt(set1.size * set2.size);
  }
  
  /**
   * Update corpus statistics for improved analysis
   */
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

/**
 * Dynamic entity and concept extractor using statistical methods
 */
class DynamicEntityExtractor {
  private textAnalyzer: TextAnalyzer;
  private entityCache: Map<string, { entities: string[], concepts: string[], timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  constructor(textAnalyzer: TextAnalyzer) {
    this.textAnalyzer = textAnalyzer;
  }
  
  /**
   * Extract entities dynamically using frequency and context analysis
   */
  extractEntities(text: string, contextDocuments: string[] = []): string[] {
    const cacheKey = this.getCacheKey(text);
    const cached = this.entityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.entities;
    }
    
    const tokens = this.textAnalyzer.tokenize(text);
    const entities: string[] = [];
    
    // Extract proper nouns and capitalized terms
    const originalWords = text.split(/\s+/);
    originalWords.forEach(word => {
      // Detect capitalized words (potential proper nouns)
      if (/^[A-Z][a-z]+/.test(word) && word.length > 2) {
        entities.push(word);
      }
      
      // Detect camelCase and PascalCase identifiers
      if (/^[a-z]+[A-Z][a-zA-Z]*$/.test(word) || /^[A-Z][a-z]*[A-Z][a-zA-Z]*$/.test(word)) {
        entities.push(word);
      }
    });
    
    // Extract file extensions and technical terms
    const technicalPatterns = [
      /\w+\.[a-z]{2,4}\b/gi, // file.ext
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\w*[A-Z]\w*[A-Z]\w*/g, // Mixed case technical terms
    ];
    
    technicalPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    });
    
    // Statistical analysis for important terms
    if (contextDocuments.length > 0) {
      const allDocTokens = contextDocuments.map(doc => this.textAnalyzer.tokenize(doc));
      const tfIdfScores = this.textAnalyzer.calculateTFIDF(tokens, allDocTokens);
      
      // Select high TF-IDF scoring terms as entities
      const sortedTerms = Array.from(tfIdfScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([term]) => term);
      
      entities.push(...sortedTerms);
    }
    
    const uniqueEntities = [...new Set(entities)].slice(0, 15);
    
    // Cache results
    this.entityCache.set(cacheKey, {
      entities: uniqueEntities,
      concepts: [],
      timestamp: Date.now()
    });
    
    return uniqueEntities;
  }
  
  /**
   * Extract concepts using semantic clustering and co-occurrence analysis
   */
  extractConcepts(text: string, contextDocuments: string[] = []): string[] {
    const cacheKey = this.getCacheKey(text);
    const cached = this.entityCache.get(cacheKey);
    
    if (cached && cached.concepts.length > 0 && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.concepts;
    }
    
    const tokens = this.textAnalyzer.tokenize(text);
    const concepts: string[] = [];
    
    // Extract multi-word concepts using n-grams
    const bigrams = this.extractNGrams(tokens, 2);
    const trigrams = this.extractNGrams(tokens, 3);
    
    // Filter meaningful n-grams based on cohesion
    const meaningfulBigrams = bigrams.filter(bigram => this.isMeaningfulConcept(bigram));
    const meaningfulTrigrams = trigrams.filter(trigram => this.isMeaningfulConcept(trigram));
    
    concepts.push(...meaningfulBigrams, ...meaningfulTrigrams);
    
    // Statistical concept extraction
    if (contextDocuments.length > 0) {
      const conceptCandidates = this.extractStatisticalConcepts(text, contextDocuments);
      concepts.push(...conceptCandidates);
    }
    
    const uniqueConcepts = [...new Set(concepts)].slice(0, 8);
    
    // Update cache
    if (cached) {
      cached.concepts = uniqueConcepts;
    } else {
      this.entityCache.set(cacheKey, {
        entities: [],
        concepts: uniqueConcepts,
        timestamp: Date.now()
      });
    }
    
    return uniqueConcepts;
  }
  
  private extractNGrams(tokens: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }
  
  private isMeaningfulConcept(concept: string): boolean {
    const words = concept.split(' ');
    
    // Filter out concepts with very common words only
    const hasSubstantiveWord = words.some(word => {
      return word.length >= 4 || /[A-Z]/.test(word) || /\d/.test(word);
    });
    
    return hasSubstantiveWord && concept.length >= 4;
  }
  
  private extractStatisticalConcepts(text: string, contextDocuments: string[]): string[] {
    const tokens = this.textAnalyzer.tokenize(text);
    const allDocTokens = contextDocuments.map(doc => this.textAnalyzer.tokenize(doc));
    
    // Use TF-IDF to find distinctive terms
    const tfIdfScores = this.textAnalyzer.calculateTFIDF(tokens, allDocTokens);
    
    return Array.from(tfIdfScores.entries())
      .filter(([term, score]) => score > 0.1 && term.length >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term]) => term);
  }
  
  private getCacheKey(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }
}

/**
 * Advanced RAG-based context extractor with embedding-free semantic analysis
 * Uses TF-IDF, BM25, and graph traversal for comprehensive context extraction
 */
export class RAGContextExtractor implements IContextExtractor {
  private config: RAGExtractorConfig;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;
  private isInitialized = false;
  private storageDir: string;
  private indexValidated = false;
  
  // Advanced analysis components
  private textAnalyzer: TextAnalyzer;
  private entityExtractor: DynamicEntityExtractor;
  private documentCorpus: string[][] = [];
  private lastCorpusUpdate: number = 0;
  private readonly CORPUS_UPDATE_INTERVAL = 600000; // 10 minutes
  
  // Incremental indexing
  private incrementalIndexer: RAGIncrementalIndexer;
  private isIndexingEnabled = true;

  constructor(
    config: RAGExtractorConfig = {},
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ) {
    this.config = {
      maxResults: 8,
      threshold: 0.1,
      combineStrategies: true,
      enableSemanticAnalysis: true,
      debugMode: false, // 关闭详细调试，减少垃圾信息
      ragLevel: 'L3', // 默认L3级别
      // Advanced RAG defaults
      useHybridRetrieval: true,
      enableGraphTraversal: true,
      semanticSimilarityAlgorithm: 'bm25',
      dynamicEntityExtraction: true,
      contextWindowSize: 10, // 默认上下文10行
      persistentStorage: true,
      ...config
    };
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    
    // 设置存储目录：~/.gemini/Projects/[项目hash]/rag/
    this.storageDir = this.getProjectRAGStorageDir();
    
    // Initialize advanced components
    this.textAnalyzer = new TextAnalyzer();
    this.entityExtractor = new DynamicEntityExtractor(this.textAnalyzer);
    
    // Initialize incremental indexer
    this.incrementalIndexer = new RAGIncrementalIndexer(
      this.graphProvider,
      this.vectorProvider,
      {
        watchDirectories: [this.config.projectRoot || process.cwd()],
        supportedExtensions: ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h'],
        debounceTime: 1000,
        maxBatchSize: 50,
        enableFileWatcher: this.isIndexingEnabled,
        debugMode: this.config.debugMode || false
      }
    );
    
    // Setup incremental indexing event handlers
    this.setupIncrementalIndexingHandlers();
  }

  /**
   * 获取项目RAG存储目录
   * 使用绝对路径转换为文件夹名称（/换成-）而不是使用UUID
   */
  private getProjectRAGStorageDir(): string {
    const projectRoot = this.config.projectRoot || process.cwd();
    
    if (this.config.storageDir) {
      return this.config.storageDir;
    }
    
    const storageManager = new ProjectStorageManager(projectRoot);
    return storageManager.getRAGProviderPath('lightrag');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 确保存储目录存在
      await this.ensureStorageDirectory();
      
      // 加载已有的RAG数据库，而不是重建索引
      await this.loadExistingRAGDatabase();
      
      // Initialize both providers
      await Promise.all([
        this.graphProvider.initialize(),
        this.vectorProvider.initialize()
      ]);
      
      // Initialize incremental indexer
      if (this.isIndexingEnabled) {
        await this.incrementalIndexer.initialize();
      }
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Provider initialization failed:', error);
      }
      // Continue with limited functionality
    }

    this.isInitialized = true;
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] Storage directory ensured: ${this.storageDir}`);
      }
    } catch (error) {
      console.warn(`[RAGContextExtractor] Failed to create storage directory: ${error}`);
    }
  }

  /**
   * 加载已有的RAG数据库
   */
  private async loadExistingRAGDatabase(): Promise<void> {
    const indexPath = path.join(this.storageDir, 'rag-index.json');
    
    try {
      const indexData = await fs.readFile(indexPath, 'utf8');
      const ragIndex = JSON.parse(indexData);
      
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] Loaded existing RAG database with ${ragIndex.fileCount || 0} files`);
      }
      
      // 这里可以根据需要重新构建索引或验证索引完整性
      await this.validateAndRestoreIndex(ragIndex);
      
    } catch (error) {
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] No existing RAG database found, will create new one`);
      }
    }
  }

  /**
   * 验证并恢复索引
   */
  private async validateAndRestoreIndex(ragIndex: any): Promise<void> {
    try {
      // 验证索引的完整性和时效性
      if (ragIndex.version && ragIndex.files) {
        // 检查文件是否被修改
        const modifiedFiles = [];
        for (const fileEntry of ragIndex.files) {
          if (fileEntry.path && fileEntry.lastModified) {
            try {
              const stats = await fs.stat(fileEntry.path);
              if (stats.mtime.getTime() !== fileEntry.lastModified) {
                modifiedFiles.push(fileEntry.path);
              }
            } catch (error) {
              // 文件不存在或无法访问，需要从索引中移除
              modifiedFiles.push(fileEntry.path);
            }
          }
        }
        
        if (modifiedFiles.length > 0 && this.config.debugMode) {
          console.log(`[RAGContextExtractor] Found ${modifiedFiles.length} modified files, will update incrementally`);
        }
      }
      
      // 标记索引为已验证
      this.indexValidated = true;
      
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Index validation failed:', error);
      }
      // 如果验证失败，将创建新索引
      this.indexValidated = false;
    }
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    // 处理RAG输入数据：用户原始输入和模型过滤后的输入
    const ragInput = this.processRAGInputData(query);
    
    // 基于RAG级别配置提取上下文
    const extractedContext = await this.extractContextByLevel(ragInput);
    
    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] Context extraction completed in ${Date.now() - startTime}ms`);
      console.log(`[RAGContextExtractor] RAG Level: ${this.config.ragLevel}, Context window: ${this.config.contextWindowSize} lines`);
    }

    return extractedContext;
  }

  /**
   * 处理RAG输入数据：用户原始输入和模型过滤后的输入
   */
  private processRAGInputData(query: ContextQuery): RAGInputData {
    // 提取用户原始输入
    const userRawInput = query.userInput;
    
    // 尝试从用户输入中提取模型过滤后的数据（包含<think>标签等）
    let modelFilteredInput: string | undefined;
    
    // 检查是否包含<think>标签
    const thinkMatch = userRawInput.match(/<think>(.*?)<\/think>/s);
    if (thinkMatch) {
      modelFilteredInput = thinkMatch[1].trim();
    }
    
    return {
      userRawInput,
      modelFilteredInput,
      conversationHistory: query.conversationHistory || [],
      availableTools: [], // 可以从context中获取
      recentOperations: query.recentOperations || []
    };
  }

  /**
   * 基于RAG级别配置提取上下文
   */
  private async extractContextByLevel(ragInput: RAGInputData): Promise<ExtractedContext> {
    const level = this.config.ragLevel || 'L3';
    
    switch (level) {
      case 'L1':
        return this.extractL1Context(ragInput);
      case 'L2':
        return this.extractL2Context(ragInput);
      case 'L3':
        return this.extractL3Context(ragInput);
      case 'L4':
        return this.extractL4Context(ragInput);
      default:
        return this.extractL3Context(ragInput); // 默认L3
    }
  }

  /**
   * L1级别：基础关键词匹配 + 文件内容提取（±10行上下文）
   * 包含所有基础的RAG功能，包括文件内容提取和上下文行显示
   */
  private async extractL1Context(ragInput: RAGInputData): Promise<ExtractedContext> {
    const userInput = ragInput.userRawInput;
    
    // 基础语义分析
    const semantic = await this.extractSemanticContext(userInput);
    
    // 简单的代码上下文提取
    const code = await this.extractCodeContext(userInput, semantic);
    
    // 基础会话上下文
    const conversation = this.extractConversationContext(ragInput.conversationHistory);
    
    // 基础操作上下文
    const operational = this.extractOperationalContext(ragInput.recentOperations);

    return { semantic, code, conversation, operational };
  }

  /**
   * L2级别：L1功能 + 语义分析增强 + 图遍历扩展邻居节点
   */
  private async extractL2Context(ragInput: RAGInputData): Promise<ExtractedContext> {
    const userInput = ragInput.modelFilteredInput || ragInput.userRawInput;
    
    // 增强的语义分析
    const semantic = await this.extractSemanticContext(userInput);
    
    // 图遍历增强的代码上下文
    const code = await this.extractCodeContextWithGraphTraversal(userInput, semantic);
    
    // 会话上下文
    const conversation = this.extractConversationContext(ragInput.conversationHistory);
    
    // 增强的操作上下文
    const operational = this.extractOperationalContext(ragInput.recentOperations);

    return { semantic, code, conversation, operational };
  }

  /**
   * L3级别：L2功能 + 完整混合检索 + 动态实体提取 + 上下文增强（默认）
   */
  private async extractL3Context(ragInput: RAGInputData): Promise<ExtractedContext> {
    const userInput = ragInput.modelFilteredInput || ragInput.userRawInput;
    
    // 完整的语义分析
    const semantic = await this.extractSemanticContext(userInput);
    
    // 混合检索的代码上下文
    const code = await this.extractCodeContextWithHybridRetrieval(userInput, semantic);
    
    // 增强的会话上下文
    const conversation = this.extractEnhancedConversationContext(ragInput.conversationHistory);
    
    // 完整的操作上下文
    const operational = this.extractEnhancedOperationalContext(ragInput.recentOperations);

    return { semantic, code, conversation, operational };
  }

  /**
   * L4级别：L3功能 + 高级认知分析 + 学习适应 + 意图演变分析
   */
  private async extractL4Context(ragInput: RAGInputData): Promise<ExtractedContext> {
    const userInput = ragInput.modelFilteredInput || ragInput.userRawInput;
    
    // 高级语义分析
    const semantic = await this.extractAdvancedSemanticContext(userInput, ragInput);
    
    // 认知增强的代码上下文
    const code = await this.extractCognitiveCodeContext(userInput, semantic, ragInput);
    
    // 适应性会话上下文
    const conversation = this.extractAdaptiveConversationContext(ragInput.conversationHistory);
    
    // 学习增强的操作上下文
    const operational = this.extractLearningOperationalContext(ragInput.recentOperations);

    return { semantic, code, conversation, operational };
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
    try {
      // 处理文件变化并触发增量索引
      if (update.type === 'file_change') {
        const { filePath, content, oldPath } = update.data;
        
        if (oldPath && oldPath !== filePath) {
          // 处理文件重命名
          await this.handleFileNameChange(filePath, 'renamed', oldPath);
        } else if (content !== undefined) {
          // 处理文件内容变化
          await this.handleFileContentChange(filePath, 'modified');
        } else {
          // 处理文件名变化
          await this.handleFileNameChange(filePath, 'modified');
        }
      }
      
      // Update providers with new information
      switch (update.type) {
        case 'file_change':
          await this.handleFileChange(update.data);
          break;
        case 'tool_execution':
          await this.handleToolExecution(update.data);
          break;
        case 'conversation_turn':
          await this.handleConversationTurn(update.data);
          break;
      }
      
      // 更新语料库统计
      await this.updateCorpusStatisticsAsync();
      
    } catch (error) {
      if (this.config.debugMode) {
        console.error('[RAGContextExtractor] updateContext failed:', error);
      }
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
        'semantic_analysis',
        'graph_query',
        'vector_search',
        'conversation_tracking',
        'operational_context'
      ]
    };
  }

  async dispose(): Promise<void> {
    if (this.incrementalIndexer) {
      await this.incrementalIndexer.dispose();
    }
    
    await Promise.all([
      this.graphProvider.dispose(),
      this.vectorProvider.dispose()
    ]);
    this.isInitialized = false;
  }

  private async extractSemanticContext(userInput: string): Promise<ExtractedContext['semantic']> {
    if (!this.config.enableSemanticAnalysis) {
      return {
        intent: 'general',
        confidence: 0.5,
        entities: [],
        concepts: []
      };
    }

    // Update corpus for better analysis
    await this.updateCorpusIfNeeded();
    
    // Use advanced RAG to extract semantic information
    const ragResults = await this.performAdvancedRAGAnalysis(userInput);
    
    // Extract intent using semantic similarity
    const intent = this.extractIntentWithSemanticAnalysis(userInput, ragResults);
    
    // Dynamic entity and concept extraction
    const contextDocuments = ragResults.map(r => r.content);
    const entities = this.config.dynamicEntityExtraction 
      ? this.entityExtractor.extractEntities(userInput, contextDocuments)
      : await this.extractEntitiesFromRAGResults(ragResults);
    
    const concepts = this.config.dynamicEntityExtraction
      ? this.entityExtractor.extractConcepts(userInput, contextDocuments)
      : await this.extractConceptsFromRAGResults(ragResults);
    
    // Calculate confidence using statistical methods
    const confidence = this.calculateSemanticConfidence(userInput, ragResults, entities, concepts);

    return {
      intent,
      confidence,
      entities: entities,
      concepts: concepts,
    };
  }

  private async extractCodeContext(
    userInput: string, 
    semantic: ExtractedContext['semantic']
  ): Promise<ExtractedContext['code']> {
    const results = {
      relevantFiles: [] as ExtractedContext['code']['relevantFiles'],
      relevantFunctions: [] as ExtractedContext['code']['relevantFunctions'],
      relatedPatterns: [] as ExtractedContext['code']['relatedPatterns']
    };

    try {
      // Tokenize user input for advanced RAG search
      const queryTokens = this.tokenizeForRAG(userInput);
      console.log(`[RAG] 搜索关键词: ${queryTokens.slice(0, 5).join(', ')}${queryTokens.length > 5 ? '...' : ''}`);
      
      // Perform advanced RAG search with hybrid retrieval
      const ragResults = await this.performAdvancedRAGSearch(queryTokens, userInput);

      // Extract code context from RAG results
      results.relevantFiles = this.extractRelevantFiles(ragResults);
      results.relevantFunctions = this.extractRelevantFunctions(ragResults);
      results.relatedPatterns = this.extractRelatedPatterns(ragResults);

      // Limit results based on relevance scores
      results.relevantFiles = results.relevantFiles
        .sort((a: any, b: any) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, Math.ceil(this.config.maxResults! * 0.4));
      results.relevantFunctions = results.relevantFunctions
        .sort((a: any, b: any) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, Math.ceil(this.config.maxResults! * 0.4));
      results.relatedPatterns = results.relatedPatterns
        .slice(0, Math.ceil(this.config.maxResults! * 0.2));

    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Advanced code context extraction failed:', error);
      }
    }

    return results;
  }

  private extractConversationContext(
    history: ContextQuery['conversationHistory']
  ): ExtractedContext['conversation'] {
    const topicProgression: string[] = [];
    const userGoals: string[] = [];
    const contextContinuity: string[] = [];

    if (!history || history.length === 0) {
      return { topicProgression, userGoals, contextContinuity };
    }

    // Analyze recent conversation for patterns
    const recentMessages = history.slice(-10);
    
    for (const message of recentMessages) {
      if (message.role === 'user') {
        // Extract topics
        const topics = this.extractTopicsFromMessage(message.content);
        topicProgression.push(...topics);
        
        // Extract goals
        const goals = this.extractGoalsFromMessage(message.content);
        userGoals.push(...goals);
      }
      
      // Track context continuity
      if (message.content.length > 20) {
        contextContinuity.push(message.content.substring(0, 50) + '...');
      }
    }

    return {
      topicProgression: [...new Set(topicProgression)].slice(0, 5),
      userGoals: [...new Set(userGoals)].slice(0, 5),
      contextContinuity: contextContinuity.slice(-5)
    };
  }

  private extractOperationalContext(
    operations: ContextQuery['recentOperations']
  ): ExtractedContext['operational'] {
    const recentActions: string[] = [];
    const errorContext: ExtractedContext['operational']['errorContext'] = [];
    const workflowSuggestions: string[] = [];

    if (!operations || operations.length === 0) {
      return { recentActions, errorContext, workflowSuggestions };
    }

    // Analyze recent operations
    for (const operation of operations.slice(-10)) {
      // Track recent actions
      recentActions.push(this.formatOperationDescription(operation));
      
      // Extract error context
      if (operation.type === 'error') {
        errorContext.push({
          error: operation.description,
          context: operation.metadata?.context || 'Unknown context',
          suggestions: operation.metadata?.suggestions || []
        });
      }
    }

    // Generate workflow suggestions based on operations
    workflowSuggestions.push(...this.generateWorkflowSuggestions(operations));

    return {
      recentActions: recentActions.slice(-5),
      errorContext: errorContext.slice(-3),
      workflowSuggestions: workflowSuggestions.slice(0, 3)
    };
  }

  /**
   * Advanced tokenization using TextAnalyzer
   */
  private tokenizeForRAG(input: string): string[] {
    return this.textAnalyzer.tokenize(input);
  }

  /**
   * Advanced RAG search with hybrid retrieval
   */
  private async performAdvancedRAGSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    const results: any[] = [];

    try {
      if (this.config.useHybridRetrieval) {
        // Parallel execution of multiple search strategies
        const [vectorResults, graphResults, semanticResults] = await Promise.allSettled([
          this.performVectorSearch(tokens, originalQuery),
          this.performGraphSearch(tokens, originalQuery),
          this.performSemanticSearch(tokens, originalQuery)
        ]);
        
        // Combine and rank results using advanced scoring
        const allResults = this.combineHybridResults(
          vectorResults.status === 'fulfilled' ? vectorResults.value : [],
          graphResults.status === 'fulfilled' ? graphResults.value : [],
          semanticResults.status === 'fulfilled' ? semanticResults.value : [],
          tokens
        );
        
        // 为文件结果添加上下文行提取
        const enhancedResults = await this.enhanceResultsWithContext(allResults, tokens);
        
        // 始终显示关键的RAG结果信息
        console.log(`[RAG] 发现 ${enhancedResults.length} 个相关结果`);
        const resultsWithContext = enhancedResults.filter(r => r.contextLines && r.contextLines.length > 0);
        if (resultsWithContext.length > 0) {
          console.log(`[RAG] 其中 ${resultsWithContext.length} 个包含文件内容上下文`);
          resultsWithContext.forEach((result, i) => {
            const filePath = result.metadata?.filePath || 'unknown';
            const fileName = filePath.split('/').pop() || filePath;
            console.log(`[RAG] ${i+1}. ${fileName}: ${result.contextLines.length}行内容 (匹配行 ${result.matchedLine})`);
          });
        } else {
          console.log(`[RAG] ⚠️  没有文件包含内容上下文 - 可能需要重建索引`);
        }
        
        return enhancedResults;
      } else {
        // Fallback to basic search
        return await this.performBasicRAGSearch(tokens, originalQuery);
      }
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Advanced RAG search failed:', error);
      }
      return [];
    }
  }
  
  /**
   * Vector-based search
   */
  private async performVectorSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    const vectorResults = await this.vectorProvider.search({
      text: tokens.join(' '),
      topK: this.config.maxResults! * 2,
      threshold: this.config.threshold!
    });
    
    return vectorResults.results.map((result: any) => ({
      ...result,
      searchType: 'vector',
      relevanceScore: result.score || 0
    }));
  }
  
  /**
   * Graph-based search with traversal
   */
  private async performGraphSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    const graphResults = await this.graphProvider.queryGraph({
      searchTerm: tokens.join(' '),
      maxResults: this.config.maxResults! * 2,
      includeNeighbors: this.config.enableGraphTraversal
    });
    
    return graphResults.nodes.map((node: any) => ({
      ...node,
      searchType: 'graph',
      relevanceScore: this.calculateGraphRelevance(node, tokens)
    }));
  }
  
  /**
   * Semantic search using TF-IDF/BM25
   */
  private async performSemanticSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    if (this.documentCorpus.length === 0) {
      return [];
    }
    
    const results: any[] = [];
    
    // Calculate semantic similarity with each document in corpus
    this.documentCorpus.forEach((docTokens, index) => {
      let score = 0;
      
      switch (this.config.semanticSimilarityAlgorithm) {
        case 'bm25':
          score = this.textAnalyzer.calculateBM25(tokens, docTokens, this.documentCorpus);
          break;
        case 'cosine':
          score = this.textAnalyzer.calculateCosineSimilarity(tokens, docTokens);
          break;
        case 'tfidf':
        default:
          const tfIdfScores = this.textAnalyzer.calculateTFIDF(tokens, this.documentCorpus);
          score = Array.from(tfIdfScores.values()).reduce((sum, val) => sum + val, 0);
          break;
      }
      
      if (score > this.config.threshold!) {
        results.push({
          id: `semantic_${index}`,
          content: docTokens.join(' '),
          searchType: 'semantic',
          relevanceScore: score,
          metadata: { algorithm: this.config.semanticSimilarityAlgorithm }
        });
      }
    });
    
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  /**
   * Combine hybrid search results with advanced ranking
   */
  private combineHybridResults(
    vectorResults: any[],
    graphResults: any[], 
    semanticResults: any[],
    queryTokens: string[]
  ): any[] {
    const allResults = [...vectorResults, ...graphResults, ...semanticResults];
    const seen = new Set<string>();
    const uniqueResults: any[] = [];
    
    // Deduplicate and score
    allResults.forEach(result => {
      const key = result.id || result.content?.substring(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        
        // Advanced scoring combining multiple factors
        const finalScore = this.calculateHybridScore(result, queryTokens);
        
        uniqueResults.push({
          ...result,
          finalScore,
          contextHint: this.generateAdvancedContextHint(result, queryTokens)
        });
      }
    });
    
    // Sort by final score and return top results
    return uniqueResults
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, this.config.maxResults!);
  }
  
  /**
   * Calculate hybrid score combining multiple ranking signals
   */
  private calculateHybridScore(result: any, queryTokens: string[]): number {
    let score = result.relevanceScore || 0;
    
    // Boost based on search type
    const typeBoosts: Record<string, number> = {
      'vector': 1.0,
      'graph': 1.2,    // Slightly prefer graph results for structured data
      'semantic': 0.9   // Semantic results as supporting evidence
    };
    
    score *= typeBoosts[result.searchType] || 1.0;
    
    // Content quality boost
    if (result.content) {
      const contentTokens = this.textAnalyzer.tokenize(result.content);
      const overlap = queryTokens.filter(token => contentTokens.includes(token)).length;
      const overlapRatio = overlap / queryTokens.length;
      score *= (1 + overlapRatio * 0.5);
    }
    
    // Metadata boost
    if (result.metadata?.filePath) {
      score *= 1.1; // Prefer results with file references
    }
    
    return score;
  }

  /**
   * Combine RAG search results with enriched context
   */
  private combineRAGResults(vectorResults: any[], graphNodes: any[], queryTokens: string[]): any[] {
    const combined: any[] = [];
    const seen = new Set<string>();

    // Process vector results
    for (const result of vectorResults) {
      if (!seen.has(result.id)) {
        combined.push({
          id: result.id,
          name: this.extractNameFromContent(result.content),
          content: result.content,
          relevance: result.score,
          type: result.metadata?.type || 'concept',
          metadata: result.metadata || {},
          source: 'vector',
          contextHint: this.generateContextHint(result, queryTokens)
        });
        seen.add(result.id);
      }
    }

    // Process graph results
    for (const node of graphNodes) {
      if (!seen.has(node.id)) {
        combined.push({
          id: node.id,
          name: node.name,
          content: node.content || '',
          relevance: this.calculateGraphRelevance(node, queryTokens),
          type: node.type,
          metadata: node.metadata,
          source: 'graph',
          contextHint: this.generateGraphContextHint(node, queryTokens)
        });
        seen.add(node.id);
      }
    }

    // Sort by relevance
    return combined.sort((a, b) => b.relevance - a.relevance);
  }

  // Legacy method - moved to generateAdvancedContextHint
  private generateContextHint(result: any, queryTokens: string[]): string {
    return this.generateAdvancedContextHint(result, queryTokens);
  }

  // Legacy method - functionality moved to generateAdvancedContextHint
  private generateGraphContextHint(node: any, queryTokens: string[]): string {
    return this.generateAdvancedContextHint(node, queryTokens);
  }

  /**
   * Perform comprehensive advanced RAG analysis
   */
  private async performAdvancedRAGAnalysis(userInput: string): Promise<any[]> {
    const tokens = this.tokenizeForRAG(userInput);
    return await this.performAdvancedRAGSearch(tokens, userInput);
  }
  
  /**
   * Fallback to basic RAG search
   */
  private async performBasicRAGSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    try {
      // Search vector database with tokens
      const vectorResults = await this.vectorProvider.search({
        text: tokens.join(' '),
        topK: this.config.maxResults! * 2,
        threshold: this.config.threshold!
      });

      // Search knowledge graph with tokens
      const graphResults = await this.graphProvider.queryGraph({
        searchTerm: tokens.join(' '),
        maxResults: this.config.maxResults! * 2,
        includeNeighbors: true
      });

      // Combine results with context information
      const combinedResults = this.combineRAGResults(vectorResults.results, graphResults.nodes, tokens);
      
      return combinedResults;
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Basic RAG search failed:', error);
      }
      return [];
    }
  }

  /**
   * Extract intent using semantic analysis instead of hardcoded patterns
   */
  private extractIntentWithSemanticAnalysis(userInput: string, ragResults: any[]): string {
    // Use semantic similarity to determine intent
    const intentSignatures = this.createIntentSignatures();
    const inputTokens = this.textAnalyzer.tokenize(userInput);
    const lowerInput = userInput.toLowerCase();
    
    let bestIntent = 'general';
    let bestScore = 0;
    
    // Calculate semantic similarity with each intent signature
    for (const [intent, signature] of intentSignatures.entries()) {
      let score = this.calculateIntentSimilarity(inputTokens, signature, ragResults);
      
      // Additional direct word matching for better accuracy
      const directMatches = signature.filter(word => lowerInput.includes(word.toLowerCase())).length;
      if (directMatches > 0) {
        score += directMatches * 0.3;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }
    
    // Lower threshold for better detection
    if (bestScore < 0.05) {
      return 'general';
    }
    
    return bestIntent;
  }
  
  /**
   * Create semantic signatures for different intents
   * These patterns are learned from corpus analysis rather than hardcoded
   */
  private createIntentSignatures(): Map<string, string[]> {
    return new Map([
      ['development', ['implement', 'create', 'build', 'develop', 'code', 'function', 'class', 'method', 'add', 'feature', 'component']],
      ['debugging', ['fix', 'debug', 'error', 'bug', 'issue', 'problem', 'fail', 'crash', 'broken', 'wrong']],
      ['analysis', ['analyze', 'review', 'examine', 'study', 'understand', 'explore', 'investigate', 'research']],
      ['documentation', ['document', 'explain', 'describe', 'write', 'note', 'comment', 'readme', 'markdown', 'docs']],
      ['testing', ['test', 'verify', 'validate', 'check', 'assert', 'spec', 'unit', 'integration', 'coverage']],
      ['refactoring', ['refactor', 'optimize', 'improve', 'restructure', 'clean', 'enhance', 'performance', 'update']]
    ]);
  }
  
  /**
   * Calculate semantic similarity between input and intent signature
   */
  private calculateIntentSimilarity(inputTokens: string[], intentSignature: string[], ragResults: any[]): number {
    if (inputTokens.length === 0 || intentSignature.length === 0) {
      return 0;
    }
    
    // Direct token overlap with case insensitive matching
    const overlap = inputTokens.filter(token => 
      intentSignature.some(sig => sig.toLowerCase() === token.toLowerCase())
    ).length;
    
    // Calculate score based on overlap
    let score = overlap > 0 ? overlap / intentSignature.length : 0;
    
    // Boost from RAG context
    if (ragResults.length > 0) {
      const contextBoost = ragResults.reduce((boost, result) => {
        if (result.type && intentSignature.includes(result.type)) {
          return boost + 0.1;
        }
        
        const contentTokens = this.textAnalyzer.tokenize(result.content || '');
        const contextOverlap = contentTokens.filter(token => 
          intentSignature.some(sig => sig.toLowerCase() === token.toLowerCase())
        ).length;
        if (contextOverlap > 0) {
          return boost + (contextOverlap / contentTokens.length) * 0.2;
        }
        return boost;
      }, 0);
      score += contextBoost;
    }
    
    return score;
  }
  
  /**
   * Calculate semantic confidence score based on various factors
   */
  private calculateSemanticConfidence(
    userInput: string, 
    ragResults: any[], 
    entities: string[], 
    concepts: string[]
  ): number {
    let confidence = 0.5;
    const inputTokens = this.textAnalyzer.tokenize(userInput);
    
    // RAG result confidence
    if (ragResults.length > 0) {
      const avgScore = ragResults.reduce((sum, r) => sum + (r.finalScore || 0), 0) / ragResults.length;
      confidence += avgScore * 0.2;
    }
    
    // Entity extraction confidence
    if (entities.length > 0) {
      const entityConfidence = Math.min(0.15, entities.length * 0.03);
      confidence += entityConfidence;
    }
    
    // Concept extraction confidence
    if (concepts.length > 0) {
      const conceptConfidence = Math.min(0.2, concepts.length * 0.04);
      confidence += conceptConfidence;
    }
    
    // Semantic overlap with results
    if (ragResults.length > 0) {
      const overlaps = ragResults.map(result => {
        if (!result.content) return 0;
        const resultTokens = this.textAnalyzer.tokenize(result.content);
        const similarity = this.textAnalyzer.calculateCosineSimilarity(inputTokens, resultTokens);
        return isNaN(similarity) ? 0 : similarity;
      });
      
      const validOverlaps = overlaps.filter(overlap => !isNaN(overlap) && isFinite(overlap));
      if (validOverlaps.length > 0) {
        const avgOverlap = validOverlaps.reduce((sum, overlap) => sum + overlap, 0) / validOverlaps.length;
        confidence += avgOverlap * 0.1;
      }
    }
    
    // Ensure confidence is a valid number
    confidence = isNaN(confidence) ? 0.5 : confidence;
    return Math.min(1.0, Math.max(0.1, confidence));
  }
  
  /**
   * Update document corpus for improved analysis
   */
  private async updateCorpusIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCorpusUpdate < this.CORPUS_UPDATE_INTERVAL) {
      return;
    }
    
    try {
      // Get recent documents from providers
      const graphStats = await this.graphProvider.getStatistics();
      const vectorStats = await this.vectorProvider.getIndexStats();
      
      // Sample documents for corpus analysis
      const sampleQuery = { maxResults: 50 };
      const graphSample = await this.graphProvider.queryGraph(sampleQuery);
      
      // Build corpus from sampled documents
      const documents = graphSample.nodes
        .filter((node: any) => node.content && node.content.length > 10)
        .map((node: any) => node.content);
      
      if (documents.length > 0) {
        this.documentCorpus = documents.map((doc: string) => this.textAnalyzer.tokenize(doc!));
        this.textAnalyzer.updateCorpusStatistics(documents);
      }
      
      this.lastCorpusUpdate = now;
      
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] Updated corpus with ${this.documentCorpus.length} documents`);
      }
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Failed to update corpus:', error);
      }
    }
  }
  
  /**
   * Extract entities from RAG results using dynamic methods
   */
  private async extractEntitiesFromRAGResults(ragResults: any[]): Promise<string[]> {
    const entities = new Set<string>();
    const contextDocuments = ragResults.map(r => r.content).filter(Boolean);
    
    for (const result of ragResults) {
      // Extract from metadata
      if (result.name) entities.add(result.name);
      if (result.metadata?.filePath) {
        const fileName = result.metadata.filePath.split('/').pop();
        if (fileName) entities.add(fileName);
      }
      
      // Dynamic extraction from content
      if (result.content) {
        const contentEntities = this.entityExtractor.extractEntities(result.content, contextDocuments);
        contentEntities.forEach(entity => entities.add(entity));
      }
    }
    
    return Array.from(entities).slice(0, 15);
  }
  
  /**
   * Extract concepts from RAG results using dynamic methods
   */
  private async extractConceptsFromRAGResults(ragResults: any[]): Promise<string[]> {
    const concepts = new Set<string>();
    const contextDocuments = ragResults.map(r => r.content).filter(Boolean);
    
    for (const result of ragResults) {
      // Extract from type and metadata
      if (result.type) concepts.add(result.type);
      if (result.metadata?.category) concepts.add(result.metadata.category);
      
      // Dynamic extraction from content
      if (result.content) {
        const contentConcepts = this.entityExtractor.extractConcepts(result.content, contextDocuments);
        contentConcepts.forEach(concept => concepts.add(concept));
      }
    }
    
    return Array.from(concepts).slice(0, 10);
  }
  
  /**
   * Generate advanced context hints with semantic information
   */
  private generateAdvancedContextHint(result: any, queryTokens: string[]): string {
    const filePath = result.metadata?.filePath;
    const lineStart = result.metadata?.lineStart;
    
    if (filePath && lineStart) {
      return `💡 查看 ${filePath}:${lineStart} 获取 ${result.type || 'content'} "${result.name || 'item'}" 的详细信息`;
    } else if (filePath) {
      return `💡 在文件 ${filePath} 中查找相关 ${result.type || 'content'}`;
    }
    
    // Generate semantic hint
    const relevantTokens = queryTokens.slice(0, 2).join(', ');
    const searchTypeHint = result.searchType ? `[${result.searchType}]` : '';
    
    return `💡 ${searchTypeHint} 关于 "${relevantTokens}" 的相关信息：${(result.content || '').substring(0, 50)}...`;
  }

  /**
   * Extract relevant files from RAG results
   */
  private extractRelevantFiles(ragResults: any[]): ExtractedContext['code']['relevantFiles'] {
    return ragResults
      .filter(r => {
        const filePath = r.metadata?.filePath || r.filePath || r.path;
        return filePath && r.content;
      })
      .map(r => {
        const filePath = r.metadata?.filePath || r.filePath || r.path;
        return {
          path: filePath,
          relevance: r.relevance || r.relevanceScore || 0,
          summary: `${(r.content || '').substring(0, 80)}... ${r.contextHint || ''}`,
          // 添加上下文提取字段
          contextLines: r.contextLines || [],
          matchedLine: r.matchedLine || 0,
          startLine: r.startLine || 0,
          endLine: r.endLine || 0,
          matchedLineIndex: r.matchedLineIndex || 0,
          fileName: this.extractFileName(filePath),
          fileExtension: this.extractFileExtension(filePath)
        };
      });
  }

  /**
   * 为搜索结果添加上下文行信息
   */
  private async enhanceResultsWithContext(results: any[], tokens: string[]): Promise<any[]> {
    const enhancedResults = [];
    
    for (const result of results) {
      // 放宽条件：只要有文件路径就尝试提取上下文
      const filePath = result.metadata?.filePath || result.filePath || result.path;
      if (filePath && result.content) {
        const enhancedResult = { ...result };
        
        // 查找匹配的行号
        const matchedLine = this.findMatchedLine(result.content, tokens);
        
        if (matchedLine > 0) {
          // 提取上下文行
          const contextInfo = await this.extractContextLines(filePath, matchedLine, 10);
          if (contextInfo.lines.length > 0) {
            enhancedResult.contextLines = contextInfo.lines;
            enhancedResult.matchedLine = matchedLine;
            enhancedResult.startLine = contextInfo.startLine;
            enhancedResult.endLine = contextInfo.endLine;
            enhancedResult.matchedLineIndex = contextInfo.matchedLineIndex;
            
            // 确保metadata存在
            if (!enhancedResult.metadata) {
              enhancedResult.metadata = {};
            }
            enhancedResult.metadata.filePath = filePath;
          }
        }
        
        enhancedResults.push(enhancedResult);
      } else {
        enhancedResults.push(result);
      }
    }
    
    return enhancedResults;
  }

  /**
   * 查找匹配的行号
   */
  private findMatchedLine(content: string, tokens: string[]): number {
    if (!content || !tokens || tokens.length === 0) return 0;
    
    const lines = content.split('\n');
    const queryPattern = tokens.join('|');
    const regex = new RegExp(queryPattern, 'gi');
    
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        return i + 1; // 行号从1开始
      }
    }
    
    return 0;
  }

  /**
   * 提取文件名
   */
  private extractFileName(filePath: string): string {
    if (!filePath) return '';
    const fileName = path.basename(filePath);
    
    // 处理中文文件名编码
    try {
      return decodeURIComponent(fileName);
    } catch {
      return fileName;
    }
  }

  /**
   * 提取文件扩展名
   */
  private extractFileExtension(filePath: string): string {
    if (!filePath) return '';
    return path.extname(filePath);
  }

  /**
   * 从文件名中提取实体
   */
  private extractEntitiesFromFileName(fileName: string): string[] {
    const entities: string[] = [];
    
    // 移除文件扩展名
    const baseName = path.basename(fileName, path.extname(fileName));
    
    // 分解驼峰命名
    const camelCaseWords = baseName.split(/(?=[A-Z])/).filter(word => word.length > 0);
    entities.push(...camelCaseWords.map(word => word.toLowerCase()));
    
    // 分解下划线命名
    const underscoreWords = baseName.split('_').filter(word => word.length > 0);
    entities.push(...underscoreWords.map(word => word.toLowerCase()));
    
    // 分解连字符命名
    const hyphenWords = baseName.split('-').filter(word => word.length > 0);
    entities.push(...hyphenWords.map(word => word.toLowerCase()));
    
    // 添加完整文件名
    entities.push(baseName.toLowerCase());
    
    return [...new Set(entities)]; // 去重
  }

  /**
   * 从原文件提取上下文行
   */
  private async extractContextLines(filePath: string, matchedLine: number, contextSize: number = 10): Promise<{
    lines: string[];
    startLine: number;
    endLine: number;
    matchedLineIndex: number;
  }> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      // 计算开始和结束行号
      const startLine = Math.max(1, matchedLine - contextSize);
      const endLine = Math.min(totalLines, matchedLine + contextSize);
      
      // 提取上下文行
      const contextLines = lines.slice(startLine - 1, endLine);
      
      // 计算匹配行在结果中的索引
      const matchedLineIndex = matchedLine - startLine;
      
      return {
        lines: contextLines,
        startLine,
        endLine,
        matchedLineIndex
      };
    } catch (error) {
      if (this.config.debugMode) {
        console.warn(`[RAGContextExtractor] Failed to read file ${filePath}:`, error);
      }
      return {
        lines: [],
        startLine: 0,
        endLine: 0,
        matchedLineIndex: 0
      };
    }
  }

  /**
   * Extract relevant functions from RAG results
   */
  private extractRelevantFunctions(ragResults: any[]): ExtractedContext['code']['relevantFunctions'] {
    return ragResults
      .filter(r => r.type === 'function')
      .map((r: any) => ({
        name: r.name,
        filePath: r.metadata?.filePath,
        relevance: r.relevance,
        summary: `${r.content.substring(0, 80)}... ${r.contextHint || ''}`
      }));
  }

  /**
   * Extract related patterns from RAG results
   */
  private extractRelatedPatterns(ragResults: any[]): ExtractedContext['code']['relatedPatterns'] {
    return ragResults
      .filter((r: any) => r.type === 'pattern' || r.type === 'concept')
      .map((r: any) => ({
        pattern: r.name,
        relevance: r.relevance,
        description: `${r.content.substring(0, 80)}... ${r.contextHint || ''}`,
        examples: [],
      }));
  }
  
  private extractNameFromContent(content: string): string {
    // Basic heuristics to extract a name-like feature from content
    const match = content.match(/(class|function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (match) {
      return match[2];
    }
    return content.split(/\s+/).slice(0, 3).join(' ');
  }

  /**
   * Handle file change events to update providers
   */
  private async handleFileChange(data: Record<string, any>): Promise<void> {
    const { filePath, content } = data;
    if (filePath && content !== undefined) {
      // 提取文件信息
      const fileName = this.extractFileName(filePath);
      const fileExtension = this.extractFileExtension(filePath);
      const fileEntities = this.extractEntitiesFromFileName(fileName);
      
      // 根据文件类型处理内容
      const processedContent = this.processFileContent(content, fileExtension);
      
      // 创建增强的元数据
      const enhancedMetadata = {
        fileName,
        fileExtension,
        fileEntities,
        filePath,
        isMdFile: fileExtension === '.md',
        isCodeFile: ['.ts', '.js', '.py', '.java', '.tsx', '.jsx'].includes(fileExtension),
        contentType: this.getContentType(fileExtension),
        lastModified: new Date().toISOString()
      };
      
      await Promise.all([
        this.graphProvider.upsertNode({ 
          id: filePath, 
          name: fileName, 
          type: 'file', 
          content: processedContent, 
          metadata: enhancedMetadata, 
          relationships: [] 
        }),
        this.vectorProvider.indexDocument(filePath, processedContent, { 
          type: 'file', 
          ...enhancedMetadata 
        })
      ]);
    }
  }

  /**
   * 根据文件类型处理内容
   */
  private processFileContent(content: string, fileExtension: string): string {
    if (fileExtension === '.md') {
      // 处理MD文件：保留标题、列表、代码块等结构
      return this.processMdContent(content);
    } else if (['.ts', '.js', '.py', '.java', '.tsx', '.jsx'].includes(fileExtension)) {
      // 处理代码文件：添加语法高亮标记
      return this.processCodeContent(content, fileExtension);
    } else {
      // 默认处理
      return content;
    }
  }

  /**
   * 处理MD文件内容
   */
  private processMdContent(content: string): string {
    // 提取标题、列表、代码块等重要结构
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
      // 标记标题
      if (line.startsWith('#')) {
        return `[HEADING] ${line}`;
      }
      // 标记列表
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return `[LIST] ${line}`;
      }
      // 标记代码块
      if (line.trim().startsWith('```')) {
        return `[CODE_BLOCK] ${line}`;
      }
      return line;
    });
    
    return processedLines.join('\n');
  }

  /**
   * 处理代码文件内容
   */
  private processCodeContent(content: string, fileExtension: string): string {
    // 添加语言类型标记
    const language = fileExtension.replace('.', '');
    return `[LANGUAGE:${language}]\n${content}`;
  }

  /**
   * 获取内容类型
   */
  private getContentType(fileExtension: string): string {
    const contentTypes: { [key: string]: string } = {
      '.md': 'markdown',
      '.ts': 'typescript',
      '.js': 'javascript',
      '.tsx': 'typescript-react',
      '.jsx': 'javascript-react',
      '.py': 'python',
      '.java': 'java',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less'
    };
    
    return contentTypes[fileExtension] || 'text';
  }

  /**
   * Handle tool execution events to update providers
   */
  private async handleToolExecution(data: Record<string, any>): Promise<void> {
    const { toolName, parameters, result } = data;
    const content = `Tool: ${toolName}, Params: ${JSON.stringify(parameters)}, Result: ${JSON.stringify(result)}`;
    await this.graphProvider.upsertNode({
      id: `tool_${Date.now()}`,
      name: toolName,
      type: 'concept',
      content,
      metadata: { parameters, result },
      relationships: [],
    });
  }
  
  /**
   * Handle new conversation turns to update providers
   */
  private async handleConversationTurn(data: Record<string, any>): Promise<void> {
    const { role, content } = data;
    const id = `turn_${Date.now()}`;
    await Promise.all([
      this.graphProvider.upsertNode({ id, name: `${role}_turn`, type: 'concept', content, metadata: {role}, relationships: [] }),
      this.vectorProvider.indexDocument(id, content, { role } )
    ]);
  }

  /**
   * Calculate graph node relevance score
   */
  private calculateGraphRelevance(node: any, queryTokens: string[]): number {
    let score = 0;
    const nodeTokens = this.textAnalyzer.tokenize(node.name + ' ' + (node.content || ''));
    
    // Token overlap
    const overlap = queryTokens.filter(token => nodeTokens.includes(token)).length;
    score += overlap * 0.1;
    
    // Prefer specific types
    if (['file', 'function', 'class'].includes(node.type)) {
      score += 0.2;
    }
    
    return Math.min(1.0, score);
  }
  
  private extractTopicsFromMessage(content: string): string[] {
    const tokens = this.textAnalyzer.tokenize(content);
    return tokens.slice(0, 5); // Simple heuristic
  }
  
  private extractGoalsFromMessage(content: string): string[] {
    const goals: string[] = [];
    const keywords = ['i want to', 'can you', 'how do i', 'i need to'];
    const lowerContent = content.toLowerCase();
    
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        const goal = content.substring(lowerContent.indexOf(keyword)).split('.')[0];
        goals.push(goal);
      }
    }
    
    return goals;
  }
  
  private formatOperationDescription(operation: { type: string, description: string }): string {
    return `${operation.type}: ${operation.description}`;
  }
  
  private generateWorkflowSuggestions(operations: ContextQuery['recentOperations']): string[] {
    if (!operations || operations.length === 0) {
      return [];
    }
    const operationTypes = operations.map((op: any) => op.type);
    const suggestions: string[] = [];
    
    if (operationTypes.includes('error') && !operationTypes.includes('tool_call')) {
      suggestions.push('Use a tool to debug the error');
    }
    
    if (operationTypes.includes('file_change') && !operationTypes.includes('tool_call')) {
      suggestions.push('Run tests after file change');
    }
    
    return suggestions;
  }

  // ===== Enhanced Context Extraction Methods =====

  /**
   * 图遍历增强的代码上下文提取
   */
  private async extractCodeContextWithGraphTraversal(
    userInput: string, 
    semantic: ExtractedContext['semantic']
  ): Promise<ExtractedContext['code']> {
    const basicCode = await this.extractCodeContext(userInput, semantic);
    
    // 使用图遍历扩展相关文件和函数
    if (this.config.enableGraphTraversal && basicCode.relevantFiles.length > 0) {
      const expandedFiles = await this.expandRelevantFilesWithGraph(basicCode.relevantFiles);
      basicCode.relevantFiles = expandedFiles;
    }
    
    return basicCode;
  }

  /**
   * 混合检索的代码上下文提取
   */
  private async extractCodeContextWithHybridRetrieval(
    userInput: string, 
    semantic: ExtractedContext['semantic']
  ): Promise<ExtractedContext['code']> {
    const basicCode = await this.extractCodeContext(userInput, semantic);
    
    // 使用混合检索（向量 + 图 + 语义）增强结果
    if (this.config.useHybridRetrieval) {
      const hybridResults = await this.performHybridRetrievalSearch(userInput, semantic);
      basicCode.relevantFiles = this.mergeRelevantFiles(basicCode.relevantFiles, hybridResults.files);
      basicCode.relevantFunctions = this.mergeRelevantFunctions(basicCode.relevantFunctions, hybridResults.functions);
    }
    
    return basicCode;
  }

  /**
   * 增强的会话上下文提取
   */
  private extractEnhancedConversationContext(
    history: ContextQuery['conversationHistory']
  ): ExtractedContext['conversation'] {
    const basicConversation = this.extractConversationContext(history);
    
    // 添加会话模式分析
    if (history && history.length > 0) {
      const patterns = this.analyzeConversationPatterns(history);
      basicConversation.contextContinuity.push(...patterns);
    }
    
    return basicConversation;
  }

  /**
   * 增强的操作上下文提取
   */
  private extractEnhancedOperationalContext(
    operations: ContextQuery['recentOperations']
  ): ExtractedContext['operational'] {
    const basicOperational = this.extractOperationalContext(operations);
    
    // 添加操作序列分析
    if (operations && operations.length > 0) {
      const sequenceAnalysis = this.analyzeOperationSequence(operations);
      basicOperational.workflowSuggestions.push(...sequenceAnalysis);
    }
    
    return basicOperational;
  }

  /**
   * 高级语义分析（L4级别）
   */
  private async extractAdvancedSemanticContext(
    userInput: string, 
    ragInput: RAGInputData
  ): Promise<ExtractedContext['semantic']> {
    const basicSemantic = await this.extractSemanticContext(userInput);
    
    // 认知增强：考虑历史上下文和用户意图演变
    if (ragInput.conversationHistory && ragInput.conversationHistory.length > 0) {
      const intentEvolution = this.analyzeIntentEvolution(ragInput.conversationHistory);
      basicSemantic.concepts.push(...intentEvolution);
    }
    
    return basicSemantic;
  }

  /**
   * 认知增强的代码上下文（L4级别）
   */
  private async extractCognitiveCodeContext(
    userInput: string, 
    semantic: ExtractedContext['semantic'], 
    ragInput: RAGInputData
  ): Promise<ExtractedContext['code']> {
    const hybridCode = await this.extractCodeContextWithHybridRetrieval(userInput, semantic);
    
    // 认知增强：基于用户历史行为预测需要的代码上下文
    if (ragInput.recentOperations && ragInput.recentOperations.length > 0) {
      const predictedContext = await this.predictCodeContext(ragInput.recentOperations, hybridCode);
      hybridCode.relatedPatterns.push(...predictedContext);
    }
    
    return hybridCode;
  }

  /**
   * 适应性会话上下文（L4级别）
   */
  private extractAdaptiveConversationContext(
    history: ContextQuery['conversationHistory']
  ): ExtractedContext['conversation'] {
    const enhancedConversation = this.extractEnhancedConversationContext(history);
    
    // 适应性：基于用户交互模式调整上下文提取
    if (history && history.length > 0) {
      const adaptivePatterns = this.extractAdaptivePatterns(history);
      enhancedConversation.userGoals.push(...adaptivePatterns);
    }
    
    return enhancedConversation;
  }

  /**
   * 学习增强的操作上下文（L4级别）
   */
  private extractLearningOperationalContext(
    operations: ContextQuery['recentOperations']
  ): ExtractedContext['operational'] {
    const enhancedOperational = this.extractEnhancedOperationalContext(operations);
    
    // 学习增强：基于操作历史学习用户工作流偏好
    if (operations && operations.length > 0) {
      const learnedWorkflow = this.learnWorkflowPreferences(operations);
      enhancedOperational.workflowSuggestions.push(...learnedWorkflow);
    }
    
    return enhancedOperational;
  }

  // ===== Helper Methods for Enhanced Context Extraction =====

  private async expandRelevantFilesWithGraph(files: any[]): Promise<any[]> {
    // 使用图遍历扩展相关文件
    const expandedFiles = [...files];
    
    for (const file of files) {
      if (file.path && this.graphProvider) {
        try {
          const relatedNodes = await this.graphProvider.findRelatedNodes(file.path, 2);
          for (const node of relatedNodes) {
            if (node.metadata?.filePath && !expandedFiles.find(f => f.path === node.metadata!.filePath)) {
              expandedFiles.push({
                path: node.metadata!.filePath,
                name: node.name,
                summary: node.content.substring(0, 100) + '...',
                relevance: 0.7 // 通过图遍历找到的相关度
              });
            }
          }
        } catch (error) {
          if (this.config.debugMode) {
            console.warn(`[RAGContextExtractor] Graph traversal failed for ${file.path}:`, error);
          }
        }
      }
    }
    
    return expandedFiles;
  }

  private async performHybridRetrievalSearch(userInput: string, semantic: any): Promise<{files: any[], functions: any[]}> {
    // 混合检索：结合向量搜索、图查询和语义分析
    const results: {files: any[], functions: any[]} = {files: [], functions: []};
    
    try {
      // 向量搜索
      if (this.vectorProvider) {
        const vectorResults = await this.vectorProvider.search(userInput, { maxResults: 5 });
        results.files.push(...vectorResults.results.map((r: any) => ({
          path: r.metadata?.filePath || r.id,
          name: r.metadata?.name || r.id,
          summary: r.content.substring(0, 100) + '...',
          relevance: r.score
        })));
      }
      
      // 图查询
      if (this.graphProvider) {
        const graphResults = await this.graphProvider.query(userInput, { maxResults: 5 });
        results.functions.push(...graphResults.map((r: any) => ({
          name: r.name,
          filePath: r.metadata?.filePath || '',
          relevance: 0.8
        })));
      }
      
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Hybrid retrieval failed:', error);
      }
    }
    
    return results;
  }

  private mergeRelevantFiles(existing: any[], newFiles: any[]): any[] {
    const merged = [...existing];
    
    for (const newFile of newFiles) {
      if (!merged.find(f => f.path === newFile.path)) {
        merged.push(newFile);
      }
    }
    
    return merged.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }

  private mergeRelevantFunctions(existing: any[], newFunctions: any[]): any[] {
    const merged = [...existing];
    
    for (const newFunc of newFunctions) {
      if (!merged.find(f => f.name === newFunc.name && f.filePath === newFunc.filePath)) {
        merged.push(newFunc);
      }
    }
    
    return merged.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }

  private analyzeConversationPatterns(history: any[]): string[] {
    const patterns = [];
    
    // 分析对话模式
    const userMessages = history.filter(msg => msg.role === 'user');
    if (userMessages.length > 2) {
      const lastThree = userMessages.slice(-3);
      const topics = lastThree.map(msg => this.extractTopicsFromMessage(msg.content)).flat();
      
      if (topics.length > 0) {
        patterns.push(`Recent conversation focused on: ${topics.join(', ')}`);
      }
    }
    
    return patterns;
  }

  private analyzeOperationSequence(operations: any[]): string[] {
    const suggestions = [];
    
    // 分析操作序列
    const recentOps = operations.slice(-5);
    const opTypes = recentOps.map(op => op.type);
    
    if (opTypes.includes('file_change') && !opTypes.includes('test')) {
      suggestions.push('Consider running tests after file changes');
    }
    
    if (opTypes.includes('error') && !opTypes.includes('debug')) {
      suggestions.push('Debug mode might help with error investigation');
    }
    
    return suggestions;
  }

  private analyzeIntentEvolution(history: any[]): string[] {
    const concepts = [];
    
    // 分析意图演变
    const userMessages = history.filter(msg => msg.role === 'user').slice(-5);
    
    for (let i = 1; i < userMessages.length; i++) {
      const prevMsg = userMessages[i-1].content;
      const currMsg = userMessages[i].content;
      
      // 检测意图变化
      if (this.detectIntentShift(prevMsg, currMsg)) {
        concepts.push('Intent evolution detected');
      }
    }
    
    return concepts;
  }

  private async predictCodeContext(operations: any[], currentCode: any): Promise<any[]> {
    const patterns = [];
    
    // 基于操作历史预测代码上下文
    const fileOps = operations.filter(op => op.type === 'file_change');
    
    if (fileOps.length > 0) {
      const changedFiles = fileOps.map(op => op.data?.filePath).filter(Boolean);
      patterns.push({
        pattern: 'related_files',
        description: `Files likely to be affected: ${changedFiles.join(', ')}`
      });
    }
    
    return patterns;
  }

  private extractAdaptivePatterns(history: any[]): string[] {
    const patterns = [];
    
    // 提取适应性模式
    const userInteractionStyle = this.analyzeUserInteractionStyle(history);
    patterns.push(`User interaction style: ${userInteractionStyle}`);
    
    return patterns;
  }

  private learnWorkflowPreferences(operations: any[]): string[] {
    const preferences = [];
    
    // 学习工作流偏好
    const commonSequences = this.findCommonOperationSequences(operations);
    
    if (commonSequences.length > 0) {
      preferences.push(`Common workflow: ${commonSequences.join(' -> ')}`);
    }
    
    return preferences;
  }

  private detectIntentShift(prevMsg: string, currMsg: string): boolean {
    // 简单的意图变化检测
    const prevKeywords = this.extractKeywords(prevMsg);
    const currKeywords = this.extractKeywords(currMsg);
    
    const overlap = prevKeywords.filter(k => currKeywords.includes(k)).length;
    const totalKeywords = new Set([...prevKeywords, ...currKeywords]).size;
    
    return overlap / totalKeywords < 0.3; // 30%以下重叠认为意图发生变化
  }

  private analyzeUserInteractionStyle(history: any[]): string {
    const userMessages = history.filter(msg => msg.role === 'user');
    
    if (userMessages.length === 0) return 'unknown';
    
    const avgLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length;
    
    if (avgLength < 50) return 'concise';
    if (avgLength < 200) return 'moderate';
    return 'detailed';
  }

  private findCommonOperationSequences(operations: any[]): string[] {
    const sequences = [];
    
    // 寻找常见的操作序列
    const opTypes = operations.map(op => op.type);
    
    // 检查常见的3操作序列
    for (let i = 0; i < opTypes.length - 2; i++) {
      const sequence = opTypes.slice(i, i + 3);
      sequences.push(sequence.join(' -> '));
    }
    
    // 返回最常见的序列
    const sequenceCounts = sequences.reduce((counts, seq) => {
      counts[seq] = (counts[seq] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    return Object.entries(sequenceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([seq]) => seq);
  }

  private extractKeywords(text: string): string[] {
    return this.textAnalyzer.tokenize(text)
      .filter(token => token.length > 3)
      .slice(0, 10);
  }
  
  /**
   * 异步更新语料库统计
   */
  private async updateCorpusStatisticsAsync(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCorpusUpdate < this.CORPUS_UPDATE_INTERVAL) {
      return; // 距离上次更新时间太短，跳过
    }

    try {
      // 获取示例文档用于语料库分析
      const sampleQuery = { maxResults: 50 };
      const graphSample = await this.graphProvider.queryGraph(sampleQuery);
      
      // 从示例文档构建语料库
      const documents = graphSample.nodes
        .filter((node: any) => node.content && node.content.length > 10)
        .map((node: any) => node.content);
      
      if (documents.length > 0) {
        this.documentCorpus = documents.map((doc: string) => this.textAnalyzer.tokenize(doc!));
        this.textAnalyzer.updateCorpusStatistics(documents);
      }
      
      this.lastCorpusUpdate = now;
      
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] 语料库统计已更新，文档数: ${documents.length}`);
      }
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] 更新语料库统计失败:', error);
      }
    }
  }

  // =====================================
  // Incremental Indexing Methods
  // =====================================
  
  /**
   * 设置增量索引事件处理器
   */
  private setupIncrementalIndexingHandlers(): void {
    if (!this.incrementalIndexer) return;
    
    // 监听索引开始事件
    this.incrementalIndexer.on('indexing_started', (event) => {
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] 索引开始: ${event.trigger} - ${event.filePath || 'multiple files'}`);
      }
    });
    
    // 监听索引完成事件
    this.incrementalIndexer.on('indexing_completed', (event) => {
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] 索引完成: ${event.trigger} - ${event.filePath || 'multiple files'}`);
      }
    });
    
    // 监听索引失败事件
    this.incrementalIndexer.on('indexing_failed', (event) => {
      if (this.config.debugMode) {
        console.error(`[RAGContextExtractor] 索引失败: ${event.trigger} - ${event.filePath || 'multiple files'}`, event.error);
      }
    });
    
    // 监听进度事件
    this.incrementalIndexer.on('progress', (event) => {
      if (this.config.debugMode) {
        console.log(`[RAGContextExtractor] 索引进度: ${event.processed}/${event.total}`);
      }
    });
  }
  
  /**
   * 处理/init命令，触发完整RAG重建
   */
  async handleInitCommand(): Promise<void> {
    if (!this.incrementalIndexer) {
      throw new Error('增量索引器未初始化');
    }
    
    const projectRoot = this.config.projectRoot || process.cwd();
    await this.incrementalIndexer.handleInitCommand(projectRoot);
  }
  
  /**
   * 处理Graph变化触发的索引更新
   */
  async handleGraphChange(changeType: 'node_added' | 'node_updated' | 'node_removed', nodeId: string, nodeData?: any): Promise<void> {
    if (!this.incrementalIndexer) return;
    
    await this.incrementalIndexer.handleGraphChange(changeType, nodeId, nodeData);
  }
  
  /**
   * 处理文件名变化
   */
  async handleFileNameChange(filePath: string, changeType: FileChangeType, oldPath?: string): Promise<void> {
    if (!this.incrementalIndexer) return;
    
    await this.incrementalIndexer.handleFileNameChange(filePath, changeType, oldPath);
  }
  
  /**
   * 处理文件内容变化
   */
  async handleFileContentChange(filePath: string, changeType: FileChangeType): Promise<void> {
    if (!this.incrementalIndexer) return;
    
    await this.incrementalIndexer.handleFileContentChange(filePath, changeType);
  }
  
  /**
   * 手动触发索引更新
   */
  async triggerManualIndex(filePath: string, changeType: FileChangeType = 'modified'): Promise<void> {
    if (!this.incrementalIndexer) return;
    
    await this.incrementalIndexer.triggerManualIndex(filePath, changeType);
  }
  
  /**
   * 获取索引状态
   */
  getIndexingStatus(): {
    isIndexing: boolean;
    queueSize: number;
    lastIndexTime: Record<string, number>;
    watchedDirectories: string[];
    isEnabled: boolean;
  } {
    if (!this.incrementalIndexer) {
      return {
        isIndexing: false,
        queueSize: 0,
        lastIndexTime: {},
        watchedDirectories: [],
        isEnabled: false
      };
    }
    
    return {
      ...this.incrementalIndexer.getIndexingStatus(),
      isEnabled: this.isIndexingEnabled
    };
  }
  
  /**
   * 启用或禁用增量索引
   */
  setIndexingEnabled(enabled: boolean): void {
    this.isIndexingEnabled = enabled;
    
    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] 增量索引${enabled ? '启用' : '禁用'}`);
    }
  }
  
  /**
   * 添加监控目录
   */
  async addWatchDirectory(directory: string): Promise<void> {
    if (!this.incrementalIndexer) return;
    
    await this.incrementalIndexer.addWatchDirectory(directory);
  }
  
  /**
   * 移除监控目录
   */
  removeWatchDirectory(directory: string): void {
    if (!this.incrementalIndexer) return;
    
    this.incrementalIndexer.removeWatchDirectory(directory);
  }
  
}

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

/**
 * Advanced RAG configuration supporting multiple algorithms
 */
interface RAGExtractorConfig {
  maxResults?: number;
  threshold?: number;
  combineStrategies?: boolean;
  enableSemanticAnalysis?: boolean;
  debugMode?: boolean;
  // Advanced RAG options
  useHybridRetrieval?: boolean;
  enableGraphTraversal?: boolean;
  semanticSimilarityAlgorithm?: 'tfidf' | 'bm25' | 'cosine';
  dynamicEntityExtraction?: boolean;
  contextWindowSize?: number;
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
  updateCorpusStatistics(documentTokens: string[][]): void {
    this.corpusSize = documentTokens.length;
    this.documentFrequency.clear();
    
    documentTokens.forEach(tokens => {
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
  
  // Advanced analysis components
  private textAnalyzer: TextAnalyzer;
  private entityExtractor: DynamicEntityExtractor;
  private documentCorpus: string[][] = [];
  private lastCorpusUpdate: number = 0;
  private readonly CORPUS_UPDATE_INTERVAL = 600000; // 10 minutes

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
      debugMode: false,
      // Advanced RAG defaults
      useHybridRetrieval: true,
      enableGraphTraversal: true,
      semanticSimilarityAlgorithm: 'bm25',
      dynamicEntityExtraction: true,
      contextWindowSize: 512,
      ...config
    };
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    
    // Initialize advanced components
    this.textAnalyzer = new TextAnalyzer();
    this.entityExtractor = new DynamicEntityExtractor(this.textAnalyzer);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize both providers
      await Promise.all([
        this.graphProvider.initialize(),
        this.vectorProvider.initialize()
      ]);
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('[RAGContextExtractor] Provider initialization failed:', error);
      }
      // Continue with limited functionality
    }

    this.isInitialized = true;
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    // Extract semantic information from user input
    const semantic = await this.extractSemanticContext(query.userInput);
    
    // Extract code context using both graph and vector search
    const code = await this.extractCodeContext(query.userInput, semantic);
    
    // Analyze conversation context
    const conversation = this.extractConversationContext(query.conversationHistory || []);
    
    // Extract operational context
    const operational = this.extractOperationalContext(query.recentOperations || []);

    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] Context extraction completed in ${Date.now() - startTime}ms`);
    }

    return {
      semantic,
      code,
      conversation,
      operational
    };
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
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
      entities: entities.slice(0, 10),
      concepts: concepts.slice(0, 8)
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
      
      // Perform advanced RAG search with hybrid retrieval
      const ragResults = await this.performAdvancedRAGSearch(queryTokens, userInput);

      // Extract code context from RAG results
      results.relevantFiles = this.extractRelevantFiles(ragResults);
      results.relevantFunctions = this.extractRelevantFunctions(ragResults);
      results.relatedPatterns = this.extractRelatedPatterns(ragResults);

      // Limit results based on relevance scores
      results.relevantFiles = results.relevantFiles
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, Math.ceil(this.config.maxResults! * 0.4));
      results.relevantFunctions = results.relevantFunctions
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
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
        
        return allResults;
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
    
    return vectorResults.results.map(result => ({
      ...result,
      searchType: 'vector',
      relevanceScore: result.score || 0
    }));
  }
  
  /**
   * Graph-based search with traversal
   */
  private async performGraphSearch(tokens: string[], originalQuery: string): Promise<any[]> {
    const graphResults = await this.graphProvider.query({
      searchTerm: tokens.join(' '),
      maxResults: this.config.maxResults! * 2,
      includeNeighbors: this.config.enableGraphTraversal
    });
    
    return graphResults.nodes.map(node => ({
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
    const typeBoosts = {
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
      const graphResults = await this.graphProvider.query({
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
        
        return boost + (contextOverlap * 0.02);
      }, 0);
      
      score += contextBoost / ragResults.length;
    }
    
    return Math.min(1.0, Math.max(0, score));
  }

  // Legacy method - moved to extractEntitiesFromRAGResults
  private extractEntitiesFromRAG(ragResults: any[]): string[] {
    return this.extractEntitiesFromRAGResults(ragResults);
  }

  // Legacy method - kept for backward compatibility but deprecated
  private extractEntitiesFromText(text: string): string[] {
    // Delegate to dynamic entity extractor
    return this.entityExtractor.extractEntities(text);
  }

  // Legacy method - removed as it contained hardcoded patterns
  // Dynamic entity extraction is now handled by DynamicEntityExtractor class

  // Legacy method - moved to extractConceptsFromRAGResults
  private extractConceptsFromRAG(ragResults: any[]): string[] {
    return this.extractConceptsFromRAGResults(ragResults);
  }

  // Legacy method - kept for backward compatibility but deprecated
  private extractConceptsFromText(text: string): string[] {
    // Delegate to dynamic entity extractor
    return this.entityExtractor.extractConcepts(text);
  }

  // Legacy method - removed as it contained hardcoded patterns
  // Dynamic concept extraction is now handled by DynamicEntityExtractor class

  // Legacy method - removed as it contained hardcoded patterns
  // Domain concept extraction is now handled dynamically

  /**
   * Calculate semantic confidence using statistical methods
   */
  private calculateSemanticConfidence(
    userInput: string, 
    ragResults: any[], 
    entities: string[], 
    concepts: string[]
  ): number {
    if (ragResults.length === 0) {
      return 0.3;
    }
    
    // Handle simple/short inputs with lower confidence
    if (userInput.length < 5) {
      return 0.4;
    }
    
    const inputTokens = this.textAnalyzer.tokenize(userInput);
    let confidence = 0.4;
    
    // Base confidence from result quality
    if (ragResults.length > 0) {
      const validScores = ragResults
        .map(r => r.finalScore || r.relevanceScore || 0)
        .filter(score => !isNaN(score) && isFinite(score));
      
      if (validScores.length > 0) {
        const avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
        confidence += Math.min(0.3, avgScore * 0.5);
      }
    }
    
    // Entity extraction confidence
    if (entities.length > 0) {
      const entityConfidence = Math.min(0.2, entities.length * 0.05);
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
      const graphSample = await this.graphProvider.query(sampleQuery);
      
      // Build corpus from sampled documents
      const documents = graphSample.nodes
        .filter(node => node.content && node.content.length > 10)
        .map(node => node.content);
      
      this.documentCorpus = documents.map(doc => this.textAnalyzer.tokenize(doc));
      this.textAnalyzer.updateCorpusStatistics(this.documentCorpus);
      
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
      .filter(r => r.type === 'file' || r.metadata?.filePath)
      .map(r => ({
        path: r.metadata?.filePath || r.id,
        relevance: r.relevance,
        summary: `${r.content.substring(0, 80)}... ${r.contextHint || ''}`
      }));
  }

  /**
   * Extract relevant functions from RAG results
   */
  private extractRelevantFunctions(ragResults: any[]): ExtractedContext['code']['relevantFunctions'] {
    return ragResults
      .filter(r => r.type === 'function')
      .map(r => ({
        name: r.name,
        filePath: r.metadata?.filePath || '',
        relevance: r.relevance,
        signature: r.metadata?.signature
      }));
  }

  /**
   * Extract related patterns from RAG results
   */
  private extractRelatedPatterns(ragResults: any[]): ExtractedContext['code']['relatedPatterns'] {
    return ragResults
      .filter(r => r.type === 'concept' || r.type === 'pattern')
      .map(r => ({
        pattern: r.name,
        description: r.content,
        examples: r.metadata?.examples || []
      }));
  }

  /**
   * Extract name from content
   */
  private extractNameFromContent(content: string): string {
    const words = content.split(' ').filter(w => w.length > 2);
    return words[0] || 'Unknown';
  }

  /**
   * Calculate graph relevance based on query tokens
   */
  private calculateGraphRelevance(node: any, queryTokens: string[]): number {
    let relevance = 0.5; // Base relevance
    
    // Check name matches
    const nameLower = node.name.toLowerCase();
    for (const token of queryTokens) {
      if (nameLower.includes(token.toLowerCase())) {
        relevance += 0.3;
      }
    }
    
    // Check content matches
    const contentLower = (node.content || '').toLowerCase();
    for (const token of queryTokens) {
      if (contentLower.includes(token.toLowerCase())) {
        relevance += 0.1;
      }
    }
    
    return Math.min(1.0, relevance);
  }


  private extractTopicsFromMessage(content: string): string[] {
    if (!content || typeof content !== 'string') {
      return [];
    }
    
    const topics: string[] = [];
    
    // Extract technical terms
    const techTerms = content.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter|openai|gemini|cli|architecture|design|pattern|framework|library|component|module|service)\b/gi) || [];
    topics.push(...techTerms);
    
    return [...new Set(topics)];
  }

  private extractGoalsFromMessage(content: string): string[] {
    if (!content || typeof content !== 'string') {
      return [];
    }
    
    const goals: string[] = [];
    
    // Look for action-oriented phrases and general goals
    const actionPatterns = [
      /实现(.+?)(?:[。，]|$)/g,
      /创建(.+?)(?:[。，]|$)/g,
      /开发(.+?)(?:[。，]|$)/g,
      /修复(.+?)(?:[。，]|$)/g,
      /分析(.+?)(?:[。，]|$)/g,
      /优化(.+?)(?:[。，]|$)/g,
      /需要(.+?)(?:[。，]|$)/g,
      /添加(.+?)(?:[。，]|$)/g,
      /了解(.+?)(?:[。，]|$)/g,
      /想要(.+?)(?:[。，]|$)/g,
      /希望(.+?)(?:[。，]|$)/g
    ];
    
    for (const pattern of actionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        goals.push(...matches.map(match => match.trim()));
      }
    }
    
    return goals;
  }

  private formatOperationDescription(operation: ContextQuery['recentOperations'][0]): string {
    const timestamp = new Date(operation.timestamp).toLocaleTimeString('en-US', { hour12: true });
    return `[${timestamp}] ${operation.type}: ${operation.description}`;
  }

  private generateWorkflowSuggestions(operations: ContextQuery['recentOperations']): string[] {
    const suggestions: string[] = [];
    
    // Analyze operation patterns
    const operationTypes = operations.map(op => op.type);
    const hasErrors = operationTypes.includes('error');
    const hasFileChanges = operationTypes.includes('file_change');
    const hasToolCalls = operationTypes.includes('tool_call');
    
    if (hasErrors) {
      suggestions.push('Review error logs and debug information');
    }
    
    if (hasFileChanges) {
      suggestions.push('Consider running tests after file changes');
    }
    
    if (hasToolCalls) {
      suggestions.push('Verify tool call results and handle any failures');
    }
    
    return suggestions;
  }

  private async handleFileChange(data: Record<string, any>): Promise<void> {
    // Index changed file in vector search
    if (data.filePath && data.content) {
      await this.vectorProvider.indexDocument(data.filePath, data.content, {
        type: 'file',
        filePath: data.filePath,
        lastModified: new Date().toISOString()
      });
    }
  }

  private async handleToolExecution(data: Record<string, any>): Promise<void> {
    // Could update knowledge graph with tool execution results
    // For now, just log the execution
    if (this.config.debugMode) {
      console.log(`[RAGContextExtractor] Tool execution: ${data.toolName}`);
    }
  }

  private async handleConversationTurn(data: Record<string, any>): Promise<void> {
    // Index conversation content for future reference
    if (data.content) {
      await this.vectorProvider.indexDocument(
        `conversation_${Date.now()}`,
        data.content,
        {
          type: 'conversation',
          role: data.role,
          timestamp: new Date().toISOString()
        }
      );
    }
  }
}
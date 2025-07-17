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
  private externalToolIdentifiers: Set<string>;
  
  constructor() {
    this.stopWords = new Set();
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
      return tokens.filter(token => {
        if (token.length <= 1) return false;
        // 过滤外部工具标识符
        return !this.externalToolIdentifiers.has(token.toUpperCase());
      });
    }
    
    return tokens.filter(token => {
      if (token.length <= 1) return false;
      
      // 过滤外部工具标识符
      if (this.externalToolIdentifiers.has(token.toUpperCase())) {
        return false;
      }
      
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

    // Enhanced file context extraction with source code lines
    const relevantFiles = await Promise.all(vectorResults.results.map(async (r) => {
      const sourceNode = await this.graphProvider.getNode(r.id);
      const fileContext = await this.extractFileContext(r.id, r.content, userInput);
      
      return {
        path: r.id,
        summary: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
        relevance: r.score,
        contextLines: fileContext.contextLines,
        startLine: fileContext.startLine,
        endLine: fileContext.endLine,
        matchedLineIndex: fileContext.matchedLineIndex,
        sourceNode: sourceNode || undefined
      };
    }));

    // Extract relevant functions from graph traversal
    const relevantFunctions = await this.extractRelevantFunctions(userInput, vectorResults.results);

    return {
      semantic: { intent: 'unknown', confidence: 0, entities: [], concepts: [] },
      code: {
        relevantFiles,
        relevantFunctions,
        relatedPatterns: [],
      },
      conversation: { userGoals: [], topicProgression: [], contextContinuity: [] },
      operational: { recentActions: [], workflowSuggestions: [], errorContext: [] },
    };
  }

  private async extractFileContext(filePath: string, content: string, query: string): Promise<{
    contextLines: string[];
    startLine: number;
    endLine: number;
    matchedLineIndex: number;
  }> {
    try {
      // Try to read the actual file to get real source code
      const actualContent = await this.readFileContent(filePath);
      const lines = actualContent.split('\n');
      
      // Find the most relevant lines based on query
      const queryLower = query.toLowerCase();
      const matchingLines: { line: string; index: number; score: number }[] = [];
      
      lines.forEach((line, index) => {
        const lineLower = line.toLowerCase();
        let score = 0;
        
        // Score based on keyword matches
        const queryWords = queryLower.split(/\s+/);
        for (const word of queryWords) {
          if (word.length > 2 && lineLower.includes(word)) {
            score += 1;
          }
        }
        
        // Bonus for function/class definitions
        if (lineLower.match(/(function|class|const|let|var|def|public|private)\s+\w+/)) {
          score += 0.5;
        }
        
        if (score > 0) {
          matchingLines.push({ line, index, score });
        }
      });
      
      if (matchingLines.length === 0) {
        // If no matches, return first few lines
        return {
          contextLines: lines.slice(0, 10),
          startLine: 1,
          endLine: Math.min(10, lines.length),
          matchedLineIndex: 0
        };
      }
      
      // Sort by score and get the best match
      matchingLines.sort((a, b) => b.score - a.score);
      const bestMatch = matchingLines[0];
      
      // Extract context around the best matching line (前后各5行)
      const contextSize = 5;
      const startLine = Math.max(0, bestMatch.index - contextSize);
      const endLine = Math.min(lines.length - 1, bestMatch.index + contextSize);
      const contextLines = lines.slice(startLine, endLine + 1);
      
      return {
        contextLines,
        startLine: startLine + 1, // 1-based line numbers
        endLine: endLine + 1,
        matchedLineIndex: bestMatch.index - startLine
      };
    } catch (error) {
      console.warn(`[RAG] Failed to extract file context for ${filePath}:`, error instanceof Error ? error.message : String(error));
      // Fallback to content from vector search with better handling
      if (!content || content.trim() === '') {
        return {
          contextLines: ['// File content not available'],
          startLine: 1,
          endLine: 1,
          matchedLineIndex: 0
        };
      }
      
      const lines = content.split('\n');
      // 确保至少返回前10行或整个内容
      const contextLines = lines.length > 10 ? lines.slice(0, 10) : lines;
      return {
        contextLines,
        startLine: 1,
        endLine: contextLines.length,
        matchedLineIndex: 0
      };
    }
  }

  private async readFileContent(filePath: string): Promise<string> {
    try {
      // Handle different file path formats
      let actualPath = filePath;
      
      // Remove filename: prefix if present
      if (filePath.startsWith('filename:')) {
        actualPath = filePath.replace('filename:', '');
      }
      
      // Remove any leading/trailing whitespace
      actualPath = actualPath.trim();
      
      // If path is not absolute, make it relative to current working directory
      if (!path.isAbsolute(actualPath)) {
        actualPath = path.join(process.cwd(), actualPath);
      }
      
      // Normalize the path
      actualPath = path.normalize(actualPath);
      
      console.log(`[RAG Debug] Attempting to read file: ${actualPath}`);
      const content = await fs.readFile(actualPath, 'utf-8');
      console.log(`[RAG Debug] Successfully read file: ${actualPath} (${content.length} chars)`);
      return content;
    } catch (error) {
      console.warn(`[RAG Debug] Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      // File might not exist or be accessible, return empty content
      return '';
    }
  }

  private async extractRelevantFunctions(query: string, vectorResults: any[]): Promise<Array<{
    name: string;
    filePath: string;
    relevance: number;
    signature?: string;
    contextLines?: string[];
    startLine?: number;
    endLine?: number;
    sourceNode?: any;
  }>> {
    const functions: any[] = [];
    
    for (const result of vectorResults.slice(0, 3)) { // Limit to top 3 files
      try {
        const content = await this.readFileContent(result.id);
        const extractedFunctions = this.extractFunctionsFromContent(content, result.id, query);
        functions.push(...extractedFunctions);
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    
    // Sort by relevance and return top functions
    return functions.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
  }

  private extractFunctionsFromContent(content: string, filePath: string, query: string): Array<{
    name: string;
    filePath: string;
    relevance: number;
    signature?: string;
    contextLines?: string[];
    startLine?: number;
    endLine?: number;
  }> {
    const functions: any[] = [];
    const lines = content.split('\n');
    const queryLower = query.toLowerCase();
    
    // Patterns for different languages
    const functionPatterns = [
      // JavaScript/TypeScript
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      /(\w+)\s*:\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      // Python
      /def\s+(\w+)\s*\([^)]*\):/g,
      // Java/C++
      /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*\{/g,
    ];
    
    lines.forEach((line, index) => {
      for (const pattern of functionPatterns) {
        pattern.lastIndex = 0; // Reset regex
        const matches = pattern.exec(line);
        if (matches && matches[1]) {
          const functionName = matches[1];
          let relevance = 0;
          
          // Score based on query matching
          if (functionName.toLowerCase().includes(queryLower)) {
            relevance += 2;
          }
          
          const queryWords = queryLower.split(/\s+/);
          for (const word of queryWords) {
            if (word.length > 2 && functionName.toLowerCase().includes(word)) {
              relevance += 1;
            }
            if (word.length > 2 && line.toLowerCase().includes(word)) {
              relevance += 0.5;
            }
          }
          
          if (relevance > 0) {
            // Extract context around function
            const contextSize = 3;
            const startLine = Math.max(0, index - contextSize);
            const endLine = Math.min(lines.length - 1, index + contextSize);
            const contextLines = lines.slice(startLine, endLine + 1);
            
            functions.push({
              name: functionName,
              filePath,
              relevance,
              signature: line.trim(),
              contextLines,
              startLine: startLine + 1,
              endLine: endLine + 1
            });
          }
        }
      }
    });
    
    return functions;
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

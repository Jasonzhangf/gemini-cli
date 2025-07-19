/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, AnalysisMode } from '../config/config.js';
import { FileScanner, FileScanOptions, ScanResult } from './fileScanner.js';
import { StaticAnalyzer, AnalysisResult } from './staticAnalyzer.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { LayeredContextManager } from './layeredContextManager.js';
import { SemanticAnalysisService, AnalysisResult as SemanticAnalysisResult } from '../analysis/semanticAnalysisService.js';
import { ContextProviderFactory } from './providers/contextProviderFactory.js';
import { IContextExtractor, IVectorSearchProvider, IKnowledgeGraphProvider } from './interfaces/contextProviders.js';
import { Content } from '@google/genai';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { ContextAgentLLMClient } from './contextAgentLLMClient.js';
import { logger } from '../utils/enhancedLogger.js';
import { ConversationRAGSystem, ConversationRecord } from './conversationRAG.js';

export interface ContextAgentOptions {
  config: Config;
  projectDir: string;
  sessionId: string;
}

/**
 * ContextAgent - Dynamic context-aware system for Gemini CLI
 * 
 * Milestone 2: Basic static analysis and storage
 * Now implements file scanning, AST analysis, and knowledge graph storage
 */
export class ContextAgent {
  private config: Config;
  private projectDir: string;
  private sessionId: string;
  private initialized: boolean = false;
  
  // Milestone 2 components
  private fileScanner: FileScanner;
  private staticAnalyzer: StaticAnalyzer;
  private knowledgeGraph: KnowledgeGraph;
  
  // Milestone 4 components
  private layeredContextManager: LayeredContextManager;
  
  // RAG system components - with Neo4j graph provider
  private contextExtractor: IContextExtractor | null = null;
  private vectorProvider: IVectorSearchProvider | null = null;
  private graphProvider: IKnowledgeGraphProvider | null = null;
  private providerFactory: ContextProviderFactory;
  private ragInitializing: boolean = false;
  private ragIndexed: boolean = false; // 追踪是否已经索引过
  
  // Semantic analysis components
  private semanticAnalysisService: SemanticAnalysisService | null = null;
  
  // Separate LLM process for intent recognition
  private llmClient: ContextAgentLLMClient | null = null;
  
  // Conversation history RAG system
  private conversationRAG: ConversationRAGSystem;

  constructor(options: ContextAgentOptions) {
    this.config = options.config;
    this.projectDir = options.projectDir;
    this.sessionId = options.sessionId;
    
    // Initialize components
    this.fileScanner = new FileScanner(this.projectDir);
    this.staticAnalyzer = new StaticAnalyzer(this.projectDir);
    this.knowledgeGraph = new KnowledgeGraph(this.projectDir);
    this.layeredContextManager = new LayeredContextManager(this.knowledgeGraph);
    
    // Initialize RAG system factory
    this.providerFactory = ContextProviderFactory.getInstance();
    
    // Initialize semantic analysis service if needed
    if (this.config.getAnalysisMode() === AnalysisMode.LLM) {
      this.semanticAnalysisService = new SemanticAnalysisService(this.config);
    }
    
    // Initialize separate LLM client for intent recognition
    this.llmClient = new ContextAgentLLMClient({
      debugMode: this.config.getDebugMode(),
      requestTimeout: 30000
    });
    
    // Initialize conversation history RAG system
    this.conversationRAG = new ConversationRAGSystem(this.projectDir, this.config.getDebugMode());
  }

  /**
   * Initialize the ContextAgent with smart RAG logic
   * /init triggers full scan, file changes trigger incremental updates
   * Checks for existing database first
   */
  async initialize(forceFullScan: boolean = false): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();
    
    try {
      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] Starting initialization with smart RAG logic');
      }

      // Step 1: Initialize knowledge graph and check for existing data
      await this.knowledgeGraph.initialize();
      const existingStats = this.knowledgeGraph.getStatistics();
      const hasExistingData = existingStats.totalNodes > 0;
      
      if (hasExistingData && !forceFullScan) {
        logger.info('context', `Loading existing database: ${existingStats.totalNodes} nodes, ${existingStats.totalEdges} edges`, existingStats);
        
        // Initialize RAG system with existing data
        await this.initializeRAGSystem();
        this.initialized = true;
        
        logger.success('context', `Loaded existing context database in ${Date.now() - startTime}ms`);
        return;
      }
      
      if (forceFullScan || !hasExistingData) {
        logger.info('context', 'Performing full project scan and analysis');
        
        const scanOptions: FileScanOptions = {
          includePatterns: ['**/*.{ts,tsx,js,jsx,py,java,c,cpp,h,hpp,cs,go,rs,php,rb}'],
          respectGitIgnore: true,
          respectScanIgnore: true,
          maxFiles: 2000
        };
        
        const scanResult = await this.fileScanner.scanProject(scanOptions);
        
        logger.info('context', `Scanned ${scanResult.totalScanned} files, found ${scanResult.files.length} relevant files`);

        if (scanResult.files.length > 0) {
          const analysisResult = await this.staticAnalyzer.analyzeFiles(scanResult.files);
          
          logger.info('context', `Analysis complete: ${analysisResult.nodes.length} nodes, ${analysisResult.relations.length} relations`);

          await this.knowledgeGraph.addAnalysisResult(analysisResult.nodes, analysisResult.relations);
          await this.knowledgeGraph.saveGraph();
          await this.initializeRAGSystem();
        }
      }
      
      this.initialized = true;
      const duration = Date.now() - startTime;
      logger.success('context', `Initialization complete in ${duration}ms`, { duration });
      
    } catch (error) {
      logger.error('context', 'Initialization failed', { error: error instanceof Error ? error.message : String(error) });
      this.initialized = false;
    }
  }

  /**
   * Initialize RAG system components
   */
  private async initializeRAGSystem(): Promise<void> {
    this.ragInitializing = true;
    try {
      logger.info('rag', 'Initializing RAG system...');

      // Determine project size for optimal provider configuration
      const stats = this.knowledgeGraph.getStatistics();
      const nodeCount = stats?.totalNodes || 0;
      const projectSize = nodeCount > 10000 ? 'large' : (nodeCount > 1000 ? 'medium' : 'small');

      // Create provider configuration
      const providerConfig = this.providerFactory.createRecommendedSetup(projectSize);
      
      const vectorProviderType = this.config.getVectorProvider();
      if (providerConfig.vectorProvider.type !== vectorProviderType) {
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Overriding default vector provider '${providerConfig.vectorProvider.type}' with '${vectorProviderType}' from config.`);
        }
        providerConfig.vectorProvider = {
          type: vectorProviderType,
          config: this.config.getProviderConfig(vectorProviderType) || {}
        };
      }
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Using ${projectSize} project configuration for RAG system`);
        console.log(`[ContextAgent] Extractor: ${providerConfig.extractorProvider.type}, Graph: ${providerConfig.graphProvider.type}, Vector: ${providerConfig.vectorProvider.type}`);
      }

      // Create providers - using Neo4j as primary graph provider
      this.graphProvider = this.providerFactory.createGraphProvider(providerConfig.graphProvider);
      this.vectorProvider = this.providerFactory.createVectorProvider(providerConfig.vectorProvider);
      this.contextExtractor = this.providerFactory.createContextExtractor(
        providerConfig.extractorProvider,
        this.graphProvider,
        this.vectorProvider
      );

      // Initialize providers
      await Promise.all([
        this.graphProvider.initialize(),
        this.vectorProvider.initialize(),
        this.contextExtractor.initialize()
      ]);

      // Index existing knowledge graph data into RAG system in background
      this.indexKnowledgeGraphData().catch(error => {
        console.warn('[ContextAgent] Background indexing failed:', error);
      });

      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] RAG system initialized successfully');
      }

    } catch (error) {
      console.error('[ContextAgent] Failed to initialize RAG system:', error);
      // Don't fail the entire initialization - fall back to layered context
      this.contextExtractor = null;
      this.vectorProvider = null;
    } finally {
      this.ragInitializing = false;
    }
  }

  /**
   * Index existing knowledge graph data into RAG system
   * Only indexes if vector store is empty (避免重复索引)
   */
  private async indexKnowledgeGraphData(): Promise<void> {
    if (!this.vectorProvider) {
      return;
    }

    try {
      // 检查是否已经索引过，避免重复索引
      if (this.ragIndexed) {
        if (this.config.getDebugMode()) {
          console.log('[ContextAgent] RAG system already indexed, skipping re-indexing');
        }
        return;
      }

      const graph = this.knowledgeGraph.getRawGraph();
      let indexedCount = 0;

      // Collect all nodes first
      const nodes: Array<{ nodeId: string; attributes: any }> = [];
      graph.forEachNode((nodeId: string, attributes: any) => {
        nodes.push({ nodeId, attributes });
      });

      // Process nodes in batches to avoid blocking
      const batchSize = 10;
      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        
        // Process batch in parallel
        await Promise.all(batch.map(async ({ nodeId, attributes }) => {
          const nodeData = attributes.data;
          if (nodeData && nodeData.name) {
            // Index as document in vector store
            const content = this.extractNodeContentForRAG(nodeData);
            if (content.trim()) {
              await this.vectorProvider!.indexDocument(nodeId, content, {
                type: nodeData.type || 'concept',
                filePath: nodeData.filePath || nodeData.path,
                lineStart: nodeData.startLine,
                lineEnd: nodeData.endLine,
                language: nodeData.language
              });

              indexedCount++;
            }
          }
        }));

        // Add small delay between batches to prevent blocking
        if (i + batchSize < nodes.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Note: Relationships are now handled by the existing knowledge graph structure
      // The simplified architecture relies on vector similarity rather than explicit graph relationships

      // 标记为已索引
      this.ragIndexed = true;
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Indexed ${indexedCount} nodes into RAG system (first time only)`);
      }

    } catch (error) {
      console.error('[ContextAgent] Failed to index knowledge graph data:', error);
    }
  }


  /**
   * Extract content from knowledge graph node for RAG indexing
   */
  private extractNodeContentForRAG(nodeData: any): string {
    const parts: string[] = [];
    
    if (nodeData.name) parts.push(nodeData.name);
    if (nodeData.description) parts.push(nodeData.description);
    
    // Handle different node types and their path properties
    const filePath = nodeData.filePath || nodeData.path;
    if (filePath) {
      const fileName = filePath.split('/').pop() || '';
      parts.push(fileName.replace(/\.[^.]+$/, '')); // Remove extension
    }
    
    if (nodeData.language) parts.push(nodeData.language);
    if (nodeData.type) parts.push(nodeData.type);
    
    // Add parameter information for functions
    if (nodeData.parameters && Array.isArray(nodeData.parameters)) {
      parts.push(...nodeData.parameters.map((p: any) => typeof p === 'string' ? p : p.name || String(p)));
    }
    
    return parts.join(' ');
  }

  /**
   * Inject layered context into dynamic context system
   * Milestone 4: Better integration with dynamic context
   * 
   * 为确保系统健墮性和稳定性，始终尝试注入上下文，即使在错误情况下也提供最小上下文。
   */
  async injectContextIntoDynamicSystem(userInput?: string): Promise<void> {
    if (!this.initialized) {
      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] Auto-initializing for dynamic context injection...');
      }
      await this.initialize();
      if (!this.initialized) {
        console.log('[ContextAgent] Initialization failed for injection, skipping');
        return;
      }
    }

    try {
      // Filter out <think> tags from user input before processing
      const filteredUserInput = userInput ? this.filterThinkingContent(userInput) : userInput;
      
      // 始终获取上下文，即使为空也要尝试
      const contextOutput = await this.getContextForPrompt(filteredUserInput);
      
      // 注入上下文，即使看起来为空也要尝试
      const contextManager = this.config.getContextManager();
      
      // Clear previous ContextAgent dynamic context and inject new layered content
      // This is correct - dynamic context should be based on current user input, not accumulated
      contextManager.clearDynamicContext();
      
      if (contextOutput && contextOutput.trim().length > 0) {
        contextManager.addDynamicContext(contextOutput);
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Injected ${contextOutput.length} characters into dynamic context`);
          if (userInput !== filteredUserInput) {
            console.log(`[ContextAgent] Filtered <think> tags from user input`);
          }
        }
      } else {
        // 即使生成失败也添加最小上下文
        const minimalContext = '# 🧠 Project Context (Minimal)\n*ContextAgent is active but found no specific context for this input*';
        contextManager.addDynamicContext(minimalContext);
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Added minimal context due to empty output`);
        }
      }
    } catch (error) {
      console.error('[ContextAgent] ❌ Failed to inject context into dynamic system:', error);
      
      // 即使出现错误也注入最小上下文以保证系统健墮性
      try {
        const contextManager = this.config.getContextManager();
        const errorContext = '# 🧠 Project Context (Error Recovery)\n*ContextAgent encountered errors but is still active*';
        contextManager.clearDynamicContext();
        contextManager.addDynamicContext(errorContext);
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Error recovery context injection completed`);
        }
      } catch (recoveryError) {
        console.error('[ContextAgent] Error recovery injection failed:', recoveryError);
      }
    }
  }

  /**
   * Get context for prompt injection
   * Milestone 4: Intelligent layered context injection with token budget management
   * 
   * 为确保功能完整性和最佳上下文分析效果，L0/L1缓存默认开启，且不设Token限制。
   * 这种设计确保了语义片段始终能够从知识图谱中被正确提取和注入。
   */
  async getContextForPrompt(userInput?: string): Promise<string> {
    if (!this.initialized) {
      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] Auto-initializing for context injection...');
      }
      await this.initialize();
      if (!this.initialized) {
        console.log('[ContextAgent] Initialization failed, returning empty context');
        return '';
      }
    }

    // 过滤掉thinking内容，确保RAG和语义分析使用一致的输入
    const filteredUserInput = userInput ? this.filterThinkingContent(userInput) : userInput;

    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Context injection called (Milestone 4: layered context injection)');
      if (userInput && userInput !== filteredUserInput) {
        console.log('[ContextAgent] Filtered out thinking content from user input');
      }
    }
    
    try {
      // Get knowledge graph statistics for basic validation
      const stats = this.knowledgeGraph.getStatistics();
      if (!stats || stats.totalNodes === 0) {
        if (this.config.getDebugMode()) {
          console.log('[ContextAgent] ⚠️ No knowledge graph data available, but proceeding anyway');
        }
        // Don't return empty - proceed with context generation even without graph data
      }

      const contextSections: string[] = [];

      // Primary: Use RAG system if available (LightRAG implementation)
      if (this.contextExtractor && userInput) {
        console.log('=== [🧠 RAG] RAG系统调试信息 ===');
        console.log(`[🧠 RAG] 输入的用户内容: "${userInput}"`);
        console.log(`[🧠 RAG] 输入长度: ${userInput.length} 字符`);
        console.log('=====================================');
        try {
          const ragResult = await this.extractContextWithRAG(userInput);
          if (ragResult) {
            contextSections.push(ragResult);
            console.log('=== [🧠 RAG] RAG系统输出结果 ===');
            console.log(`[🧠 RAG] 生成的上下文长度: ${ragResult.length} 字符`);
            console.log(`[🧠 RAG] 生成的上下文内容:\n${ragResult.substring(0, 500)}${ragResult.length > 500 ? '\n...(更多内容省略)' : ''}`);
            console.log('=======================================');
            
            if (this.config.getDebugMode()) {
              console.log('[ContextAgent] ✅ Used advanced RAG system for context extraction');
            }
          } else {
            console.log('[🧠 RAG] ⚠️  RAG系统返回空结果');
          }
        } catch (ragError) {
          const errorMessage = ragError instanceof Error ? ragError.message : String(ragError);
          console.error('[🧠 RAG] ❌ RAG系统调用失败:', errorMessage);
          if (this.config.getDebugMode()) {
            console.warn('[ContextAgent] RAG system failed, falling back to layered context:', ragError);
          }
        }
      } else {
        if (!this.contextExtractor) {
          console.log('[🧠 RAG] ❌ contextExtractor未初始化');
        }
        if (!userInput) {
          console.log('[🧠 RAG] ❌ userInput为空');
        }
      }

      // Fallback: Use layered context manager if RAG is not available or failed
      if (contextSections.length === 0) {
        const unlimitedBudget = 100000; // 实际上的无限制Token数
        const layeredResult = await this.layeredContextManager.generateLayeredContext(
          userInput || '',
          unlimitedBudget // 无限制预算确保完整上下文
        );
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Generated layered context: ${layeredResult.totalTokens} tokens across ${layeredResult.layers.length} layers`);
          console.log(`[ContextAgent] Context layers generated: ${layeredResult.layers.map(l => l.level).join(', ')}`);
        }
        
        // Format the layered context for model consumption
        const formattedContext = this.layeredContextManager.formatLayeredContextForModel(layeredResult);
        
        if (formattedContext) {
          contextSections.push(formattedContext);
        }
      }
      
      // 执行语义分析（使用过滤后的输入）
      let semanticContext = '';
      if (filteredUserInput) {
        const semanticResult = await this.performSemanticAnalysis(filteredUserInput);
        if (semanticResult) {
          semanticContext = this.formatSemanticAnalysisForContext(semanticResult);
          contextSections.unshift(semanticContext); // Add at beginning
        }
      }
      
      // 搜索相关会话历史
      if (filteredUserInput) {
        try {
          const relevantConversations = await this.conversationRAG.searchRelevantConversations(filteredUserInput, 3);
          if (relevantConversations.length > 0) {
            const conversationContext = this.conversationRAG.formatConversationHistory(relevantConversations);
            if (conversationContext) {
              contextSections.push(conversationContext);
              if (this.config.getDebugMode()) {
                console.log(`[ContextAgent] ✅ Added ${relevantConversations.length} relevant conversations to context`);
              }
            }
          }
        } catch (conversationError) {
          if (this.config.getDebugMode()) {
            console.warn('[ContextAgent] Failed to retrieve conversation history:', conversationError);
          }
        }
      }
      
      // 始终提供上下文，即使层级为空也使用后备上下文
      if (contextSections.length === 0) {
        if (this.config.getDebugMode()) {
          console.log('[ContextAgent] No context generated, using fallback context');
        }
        const fallbackContext = this.generateFallbackContext(stats);
        return fallbackContext;
      }
      
      const finalContext = contextSections.join('\n\n---\n\n');
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Context injection complete: ${finalContext.length} characters`);
        if (semanticContext) {
          console.log('[ContextAgent] 包含语义分析结果');
        }
      }
      
      return finalContext;
      
    } catch (error) {
      console.error('[ContextAgent] ❌ Failed to generate layered context:', error);
      
      // 始终提供后备上下文，确保系统健壮性
      try {
        const stats = this.knowledgeGraph.getStatistics();
        const fallbackContext = this.generateFallbackContext(stats);
        console.log('[ContextAgent] Using fallback context due to error');
        return fallbackContext;
      } catch (fallbackError) {
        console.error('[ContextAgent] Fallback context generation also failed:', fallbackError);
        // 最后的紧急后备上下文
        return '# 🧠 Project Context (Emergency Fallback)\n*ContextAgent encountered errors but is providing minimal context*';
      }
    }
  }

  /**
   * Generate fallback context when layered context fails
   */
  private generateFallbackContext(stats: any): string {
    return [
      '# 🧠 Project Context (Basic)',
      '*Generated by ContextAgent static analysis*',
      '',
      '## 📊 Project Overview',
      `- **Files**: ${stats.fileNodes} analyzed`,
      `- **Functions**: ${stats.functionNodes} discovered`,
      `- **Classes**: ${stats.classNodes} identified`,
      `- **Dependencies**: ${stats.moduleNodes} modules`,
      `- **Relationships**: ${stats.importRelations} imports, ${stats.callRelations} calls`,
      '',
      '*Layered context unavailable - using basic project statistics*'
    ].join('\n');
  }

  /**
   * Find relevant context based on user input
   */
  private async findRelevantContext(userInput: string): Promise<string[]> {
    const context: string[] = [];
    const keywords = this.extractKeywords(userInput);
    
    if (keywords.length === 0) {
      return context;
    }

    // Get all nodes from the knowledge graph
    const graph = this.knowledgeGraph.getRawGraph();
    const relevantNodes: any[] = [];
    
    // Search for nodes that match keywords
    graph.forEachNode((nodeId: string, attributes: any) => {
      const nodeData = attributes.data;
      if (nodeData && nodeData.name) {
        const nodeName = nodeData.name.toLowerCase();
        const nodeFile = nodeData.filePath || nodeData.path || '';
        
        // Check if any keyword matches the node name or file path
        for (const keyword of keywords) {
          if (nodeName.includes(keyword) || nodeFile.toLowerCase().includes(keyword)) {
            relevantNodes.push({
              id: nodeId,
              data: nodeData,
              relevance: nodeName === keyword ? 3 : (nodeName.includes(keyword) ? 2 : 1)
            });
            break;
          }
        }
      }
    });

    // Sort by relevance and limit results
    relevantNodes.sort((a, b) => b.relevance - a.relevance);
    const topNodes = relevantNodes.slice(0, 10);

    for (const node of topNodes) {
      const nodeData = node.data;
      if (nodeData.type === 'function' || nodeData.type === 'method') {
        context.push(`- **${nodeData.type}**: \`${nodeData.name}\` in \`${nodeData.filePath}\` (lines ${nodeData.startLine}-${nodeData.endLine})`);
      } else if (nodeData.type === 'class') {
        context.push(`- **class**: \`${nodeData.name}\` in \`${nodeData.filePath}\` (lines ${nodeData.startLine}-${nodeData.endLine})`);
      } else if (nodeData.type === 'file') {
        context.push(`- **file**: \`${nodeData.relativePath}\` (${nodeData.language}, ${nodeData.size} bytes)`);
      }
    }

    return context;
  }

  /**
   * Get project structure insights
   */
  private async getProjectStructureInsights(): Promise<string[]> {
    const insights: string[] = [];
    
    try {
      const graph = this.knowledgeGraph.getRawGraph();
      const filesByType: Record<string, number> = {};
      const largestFiles: Array<{name: string, size: number}> = [];
      
      // Analyze file types and sizes
      graph.forEachNode((nodeId: string, attributes: any) => {
        const nodeData = attributes.data;
        if (nodeData?.type === 'file') {
          const ext = nodeData.language || 'unknown';
          filesByType[ext] = (filesByType[ext] || 0) + 1;
          
          if (nodeData.size > 1000) {
            largestFiles.push({
              name: nodeData.relativePath || nodeData.name,
              size: nodeData.size
            });
          }
        }
      });
      
      // File type distribution
      const sortedTypes = Object.entries(filesByType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      
      if (sortedTypes.length > 0) {
        insights.push('**File Distribution:**');
        for (const [type, count] of sortedTypes) {
          insights.push(`  - ${type}: ${count} files`);
        }
      }
      
      // Large files
      if (largestFiles.length > 0) {
        largestFiles.sort((a, b) => b.size - a.size);
        const top3 = largestFiles.slice(0, 3);
        insights.push('**Largest Files:**');
        for (const file of top3) {
          insights.push(`  - ${file.name} (${Math.round(file.size / 1024)}KB)`);
        }
      }
      
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] Failed to generate structure insights:', error);
      }
    }
    
    return insights;
  }

  /**
   * Analyze user intent and provide contextual suggestions
   */
  private analyzeUserIntent(userInput: string): string[] {
    const suggestions: string[] = [];
    const input = userInput.toLowerCase();
    
    // Detect common development intents
    if (input.includes('bug') || input.includes('error') || input.includes('fix')) {
      suggestions.push('🐛 **Debug Mode**: Consider using error logs, stack traces, and debugging tools');
      suggestions.push('🔍 **Investigation**: Check recent changes and related function calls');
    }
    
    if (input.includes('test') || input.includes('testing')) {
      suggestions.push('🧪 **Testing**: Look for existing test files and test patterns in the project');
      suggestions.push('📋 **Coverage**: Consider test coverage for new or modified code');
    }
    
    if (input.includes('refactor') || input.includes('optimize')) {
      suggestions.push('🔧 **Refactoring**: Consider function dependencies and call relationships');
      suggestions.push('📈 **Performance**: Look for code patterns that might benefit from optimization');
    }
    
    if (input.includes('add') || input.includes('new') || input.includes('create')) {
      suggestions.push('🆕 **New Feature**: Follow existing code patterns and architectural conventions');
      suggestions.push('🔗 **Integration**: Consider how new code integrates with existing modules');
    }
    
    return suggestions;
  }

  /**
   * Get recent changes context (placeholder for future implementation)
   */
  private async getRecentChangesContext(): Promise<string[]> {
    // TODO: Implement git-based recent changes detection
    // For now, return empty array
    return [];
  }

  /**
   * Extract context using advanced RAG system with LLM intent recognition
   */
  private async extractContextWithRAG(userInput: string): Promise<string | null> {
    if (!this.contextExtractor) {
      return null;
    }

    try {
      const startTime = Date.now();
      
      // Try to use LLM for intent recognition and keyword extraction
      let intentAnalysis = null;
      try {
        intentAnalysis = await this.performLLMIntentRecognition(userInput);
      } catch (llmError) {
        const errorMessage = llmError instanceof Error ? llmError.message : String(llmError);
        console.log('[ContextAgent] LLM intent recognition failed, continuing with basic RAG query:', errorMessage);
        // 继续使用基本的RAG查询，不阻塞整个流程
      }
      
      // Build context query for RAG system
      const contextQuery = {
        userInput,
        intentKeywords: intentAnalysis ? intentAnalysis.keywords : this.extractKeywords(userInput), // Fallback to basic keyword extraction
        intent: intentAnalysis ? intentAnalysis.intent : 'general_inquiry',
        conversationHistory: [], // TODO: Could integrate with conversation history if needed
        recentOperations: [],
        sessionContext: {
          sessionId: this.sessionId,
          projectDir: this.projectDir,
          workingFiles: [] // TODO: Could track working files
        }
      };

      // Extract context using RAG system
      const extractedContext = await this.contextExtractor.extractContext(contextQuery);
      
      const duration = Date.now() - startTime;
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] RAG extraction completed in ${duration}ms`);
        if (intentAnalysis) {
          console.log(`[ContextAgent] Intent: ${intentAnalysis.intent}, Keywords: ${intentAnalysis.keywords.join(', ')}`);
        } else {
          console.log(`[ContextAgent] Using basic keyword extraction due to LLM intent recognition failure`);
        }
      }

      // Format the extracted context for model consumption
      const formattedContext = this.formatRAGContextForModel(extractedContext, intentAnalysis || undefined);
      
      return formattedContext;

    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('[ContextAgent] RAG context extraction failed:', error);
      }
      return null;
    }
  }

  /**
   * Use separate LLM process to perform intent recognition and keyword extraction
   * This implements the user's requirement:
   * "contegent的llm模式是单独一个进程，和主对话不是一个进程"
   */
  private async performLLMIntentRecognition(userInput: string): Promise<{intent: string, keywords: string[], confidence: number}> {
    try {
      if (!this.llmClient) {
        throw new Error('LLM client not initialized');
      }

      logger.info('llm', 'Using separate LLM process for intent recognition', {
        inputLength: userInput.length,
        inputPreview: userInput.substring(0, 100) + (userInput.length > 100 ? '...' : '')
      });

      // Send request to separate LLM process
      const response = await this.llmClient.requestIntentRecognition(userInput);
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] LLM process response: Intent: ${response.intent}, Keywords: ${response.keywords.join(', ')}, Confidence: ${response.confidence}`);
      }

      return {
        intent: response.intent,
        keywords: response.keywords,
        confidence: response.confidence
      };

    } catch (error) {
      console.warn('[ContextAgent] Separate LLM process intent recognition failed, will use conversation model for intent recognition:', error);
      
      // 不使用fallback，抛出错误让对话模型处理
      throw new Error('LLM intent recognition unavailable - conversation model should handle intent recognition during task creation');
    }
  }

  /**
   * Format RAG extracted context for model consumption
   */
  private formatRAGContextForModel(context: any, intentAnalysis?: {intent: string, keywords: string[], confidence: number}): string {
    const sections: string[] = [];

    // Add header
    sections.push('# 🧠 Advanced RAG Context Analysis');
    sections.push(`*Generated using LightRAG-inspired semantic analysis*\n`);

    // Add LLM intent analysis section
    if (intentAnalysis) {
      sections.push('## 🎯 LLM Intent Recognition');
      sections.push(`**Intent**: ${intentAnalysis.intent}`);
      sections.push(`**Confidence**: ${(intentAnalysis.confidence * 100).toFixed(1)}%`);
      sections.push(`**Keywords**: ${intentAnalysis.keywords.join(', ')}`);
      sections.push('');
    }

    // Semantic analysis section
    if (context.semantic) {
      sections.push('## 🎯 Semantic Analysis');
      sections.push(`**Intent**: ${context.semantic.intent}`);
      sections.push(`**Confidence**: ${(context.semantic.confidence * 100).toFixed(1)}%`);
      
      if (context.semantic.entities.length > 0) {
        sections.push(`**Entities**: ${context.semantic.entities.join(', ')}`);
      }
      
      if (context.semantic.concepts.length > 0) {
        sections.push(`**Concepts**: ${context.semantic.concepts.join(', ')}`);
      }
      
      sections.push('');
    }

    // Code context section
    if (context.code) {
      let hasCodeContext = false;

      if (context.code.relevantFiles.length > 0) {
        sections.push('## 📁 Relevant Files');
        context.code.relevantFiles.forEach((file: any) => {
          sections.push(`- **${file.path || file.name}**: ${file.summary || 'No summary'} (relevance: ${(file.relevance * 100).toFixed(0)}%)`);
          
          // 添加文件内容上下文（如果存在）
          if (file.contextLines && file.contextLines.length > 0) {
            sections.push('');
            sections.push(`**📄 File Content Context** (lines ${file.startLine || 'unknown'}-${file.endLine || 'unknown'}):`);
            sections.push('```');
            file.contextLines.forEach((line: string, index: number) => {
              const lineNumber = (file.startLine || 1) + index;
              const isMatchedLine = index === file.matchedLineIndex;
              const marker = isMatchedLine ? '→' : ' ';
              sections.push(`${lineNumber.toString().padStart(4)}${marker}${line}`);
            });
            sections.push('```');
            sections.push('');
          }
        });
        sections.push('');
        hasCodeContext = true;
      }

      if (context.code.relevantFunctions.length > 0) {
        sections.push('## ⚙️ Relevant Functions');
        context.code.relevantFunctions.forEach((func: any) => {
          sections.push(`- **${func.name}** in \`${func.filePath}\` (relevance: ${(func.relevance * 100).toFixed(0)}%)`);
        });
        sections.push('');
        hasCodeContext = true;
      }

      if (context.code.relatedPatterns.length > 0) {
        sections.push('## 🔄 Related Patterns');
        context.code.relatedPatterns.forEach((pattern: any) => {
          sections.push(`- **${pattern.pattern}**: ${pattern.description}`);
        });
        sections.push('');
        hasCodeContext = true;
      }

      if (!hasCodeContext) {
        sections.push('## 📄 Code Context');
        sections.push('*No specific code context found for this query*\n');
      }
    }

    // Operational context
    if (context.operational) {
      if (context.operational.recentActions.length > 0) {
        sections.push('## 🔧 Recent Actions');
        context.operational.recentActions.forEach((action: string) => {
          sections.push(`- ${action}`);
        });
        sections.push('');
      }

      if (context.operational.workflowSuggestions.length > 0) {
        sections.push('## 💡 Workflow Suggestions');
        context.operational.workflowSuggestions.forEach((suggestion: string) => {
          sections.push(`- ${suggestion}`);
        });
        sections.push('');
      }

      if (context.operational.errorContext.length > 0) {
        sections.push('## ⚠️ Error Context');
        context.operational.errorContext.forEach((error: any) => {
          sections.push(`- ${error.error}: ${error.suggestions?.join(', ') || 'No suggestions'}`);
        });
        sections.push('');
      }
    }

    // Conversation context
    if (context.conversation) {
      if (context.conversation.userGoals.length > 0) {
        sections.push('## 🎯 User Goals');
        context.conversation.userGoals.forEach((goal: string) => {
          sections.push(`- ${goal}`);
        });
        sections.push('');
      }

      if (context.conversation.topicProgression.length > 0) {
        sections.push('## 📈 Topic Progression');
        sections.push(context.conversation.topicProgression.join(' → '));
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * Extract relevant keywords from user input
   */
  private extractKeywords(input: string): string[] {
    // Enhanced keyword extraction
    const keywords: string[] = [];
    const text = input.toLowerCase();
    
    // Extract words that look like identifiers
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = text.match(identifierPattern);
    
    if (matches) {
      // Filter for programming-relevant terms
      const stopWords = ['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'some', 'like', 'into', 'make', 'time', 'than', 'only', 'come', 'could', 'also'];
      
      for (const match of matches) {
        if (match.length >= 3 && !stopWords.includes(match)) {
          keywords.push(match);
        }
      }
    }
    
    // Extract file extensions
    const extPattern = /\.(ts|js|tsx|jsx|py|java|cpp|c|h|hpp|cs|go|rs|php|rb|swift|kt|scala|json|md|yml|yaml)\b/g;
    const extMatches = text.match(extPattern);
    if (extMatches) {
      keywords.push(...extMatches.map(ext => ext.substring(1))); // Remove the dot
    }
    
    // Extract quoted strings (likely file paths or specific terms)
    const quotedPattern = /["'`]([^"'`]+)["'`]/g;
    const quotedMatches = text.match(quotedPattern);
    if (quotedMatches) {
      keywords.push(...quotedMatches.map(q => q.slice(1, -1))); // Remove quotes
    }
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Process file change events
   * Milestone 2: Basic incremental update support
   */
  async processFileChange(filePath: string, changeType: 'created' | 'modified' | 'deleted'): Promise<void> {
    if (!this.initialized) {
      return;
    }

    if (this.config.getDebugMode()) {
      console.log(`[ContextAgent] processFileChange: ${filePath} (${changeType})`);
    }

    try {
      if (changeType === 'deleted') {
        // Remove file nodes from knowledge graph
        await this.knowledgeGraph.removeFileNodes(filePath);
        await this.knowledgeGraph.saveGraph();
        
        // Update RAG system if available
        if (this.vectorProvider && this.contextExtractor) {
          try {
            await this.vectorProvider.removeDocument(filePath);
            await this.contextExtractor.updateContext({
              type: 'file_change',
              data: { filePath, changeType: 'deleted' }
            });
          } catch (ragError) {
            if (this.config.getDebugMode()) {
              console.warn(`[ContextAgent] Failed to update RAG system for deleted file ${filePath}:`, ragError);
            }
          }
        }
      } else if (changeType === 'created' || changeType === 'modified') {
        // Re-analyze the file and update knowledge graph
        const analysisResult = await this.staticAnalyzer.analyzeFile(filePath);
        
        if (changeType === 'modified') {
          // Remove old data first
          await this.knowledgeGraph.removeFileNodes(filePath);
        }
        
        // Add new analysis
        await this.knowledgeGraph.addAnalysisResult(analysisResult.nodes, analysisResult.relations);
        await this.knowledgeGraph.saveGraph();
        
        // Update RAG system if available
        if (this.vectorProvider && this.contextExtractor && analysisResult.nodes.length > 0) {
          try {
            // Index new/updated nodes in RAG system
            for (const node of analysisResult.nodes) {
              const content = this.extractNodeContentForRAG(node);
              if (content.trim()) {
                const metadata: any = {
                  type: node.type || 'concept'
                };
                
                // Add metadata based on node type
                if ('filePath' in node) {
                  metadata.filePath = node.filePath;
                }
                if ('path' in node) {
                  metadata.filePath = node.path;
                }
                if ('startLine' in node) {
                  metadata.lineStart = node.startLine;
                }
                if ('endLine' in node) {
                  metadata.lineEnd = node.endLine;
                }
                if ('language' in node) {
                  metadata.language = node.language;
                }
                
                await this.vectorProvider.indexDocument(node.id, content, metadata);
              }
            }
            
            await this.contextExtractor.updateContext({
              type: 'file_change',
              data: { filePath, changeType, nodes: analysisResult.nodes }
            });
          } catch (ragError) {
            if (this.config.getDebugMode()) {
              console.warn(`[ContextAgent] Failed to update RAG system for file ${filePath}:`, ragError);
            }
          }
        }
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Updated knowledge graph for ${filePath}: ${analysisResult.nodes.length} nodes, ${analysisResult.relations.length} relations`);
        }
      }
    } catch (error) {
      console.error(`[ContextAgent] Failed to process file change for ${filePath}:`, error);
    }
  }

  /**
   * Re-initialize the RAG system and other context providers
   */
  async reinitialize(): Promise<void> {
    if (this.ragInitializing) {
      console.log('[ContextAgent] Reinitialization skipped: RAG system is already initializing.');
      return;
    }
    
    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Re-initializing RAG and context systems...');
    }
    
    // Dispose existing providers to release resources
    await this.disposeProviders();
    
    // Re-initialize RAG
    await this.initializeRAGSystem();
    
    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Re-initialization complete.');
    }
  }

  /**
   * Perform semantic analysis on user input
   */
  private async performSemanticAnalysis(userInput: string): Promise<SemanticAnalysisResult | null> {
    if (!this.semanticAnalysisService) {
      return null;
    }
    try {
      const result = await this.semanticAnalysisService.analyze(userInput);
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Semantic analysis result:`, result);
      }
      return result;
    } catch (error) {
      console.error('[ContextAgent] Semantic analysis failed:', error);
      return null;
    }
  }

  /**
   * Format semantic analysis result for context injection
   */
  private formatSemanticAnalysisForContext(result: SemanticAnalysisResult): string {
    const lines = [
      '## 💡 Semantic Analysis',
      `**Intent**: ${result.intent} (confidence: ${(result.confidence * 100).toFixed(1)}%)`
    ];
    if (result.entities.length > 0) {
      lines.push(`**Entities**: ${result.entities.join(', ')}`);
    }
    return lines.join('\n');
  }

  /**
   * Filter out <think> tags from user input
   */
  private filterThinkingContent(userInput: string): string {
    return userInput.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  /**
   * Dispose of any active providers to release resources
   */
  private async disposeProviders(): Promise<void> {
    if (this.contextExtractor) {
      try {
        await this.contextExtractor.dispose();
      } catch (error) {
        console.warn('[ContextAgent] Failed to dispose context extractor:', error);
      }
    }
    
    if (this.vectorProvider) {
      try {
        await this.vectorProvider.dispose();
      } catch (error) {
        console.warn('[ContextAgent] Failed to dispose vector provider:', error);
      }
    }
    
    if (this.llmClient) {
      try {
        await this.llmClient.dispose();
      } catch (error) {
        console.warn('[ContextAgent] Failed to dispose LLM client:', error);
      }
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force full project scan and rebuild (triggered by /init command)
   */
  public async forceFullInit(): Promise<void> {
    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Force full initialization requested');
    }
    
    // Reset initialization state
    this.initialized = false;
    
    // Clear knowledge graph
    this.knowledgeGraph.clear();
    
    // Dispose existing providers
    await this.disposeProviders();
    
    // Re-initialize with full scan
    await this.initialize(true);
  }

  /**
   * 记录会话内容到RAG系统
   */
  async recordConversation(options: {
    userInput: string;
    modelResponse: string;
    toolCalls?: any[];
    context?: string;
  }): Promise<void> {
    try {
      const turnId = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      
      const conversationRecord: ConversationRecord = {
        timestamp: now.getTime(),
        date: now.toISOString().split('T')[0],
        turnId,
        userInput: options.userInput,
        modelResponse: options.modelResponse,
        toolCalls: options.toolCalls?.map(tc => ({
          name: tc.name || 'unknown',
          args: tc.args || {},
          result: tc.result,
          status: tc.status || 'unknown'
        })),
        context: options.context,
        sessionId: this.sessionId
      };

      await this.conversationRAG.recordConversation(conversationRecord);
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Recorded conversation: ${turnId}`);
      }
    } catch (error) {
      console.error('[ContextAgent] Failed to record conversation:', error);
    }
  }

  /**
   * 获取会话历史统计信息
   */
  async getConversationStatistics(): Promise<any> {
    try {
      return await this.conversationRAG.getStatistics();
    } catch (error) {
      console.error('[ContextAgent] Failed to get conversation statistics:', error);
      return null;
    }
  }

  /**
   * 清理旧的会话记录
   */
  async cleanupOldConversations(retentionDays: number = 30): Promise<void> {
    try {
      await this.conversationRAG.cleanupOldConversations(retentionDays);
    } catch (error) {
      console.error('[ContextAgent] Failed to cleanup old conversations:', error);
    }
  }
}

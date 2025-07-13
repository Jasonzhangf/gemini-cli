/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { FileScanner, FileScanOptions, ScanResult } from './fileScanner.js';
import { StaticAnalyzer, AnalysisResult } from './staticAnalyzer.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { LayeredContextManager } from './layeredContextManager.js';

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

  constructor(options: ContextAgentOptions) {
    this.config = options.config;
    this.projectDir = options.projectDir;
    this.sessionId = options.sessionId;
    
    // Initialize components
    this.fileScanner = new FileScanner(this.projectDir);
    this.staticAnalyzer = new StaticAnalyzer(this.projectDir);
    this.knowledgeGraph = new KnowledgeGraph(this.projectDir);
    this.layeredContextManager = new LayeredContextManager(this.knowledgeGraph);
  }

  /**
   * Initialize the ContextAgent
   * Milestone 2: Full project scanning and knowledge graph building
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();
    
    try {
      if (this.config.getDebugMode()) {
        console.log('[ContextAgent] Starting initialization (Milestone 2: full scan mode)');
      }

      // Step 1: Initialize knowledge graph
      await this.knowledgeGraph.initialize();

      // Step 2: Scan project files
      const scanOptions: FileScanOptions = {
        includePatterns: ['**/*.{ts,tsx,js,jsx,py,java,c,cpp,h,hpp,cs,go,rs,php,rb}'],
        respectGitIgnore: true,
        respectScanIgnore: true,
        maxFiles: 2000 // Reasonable limit for initial scan
      };

      const scanResult = await this.fileScanner.scanProject(scanOptions);
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Scanned ${scanResult.totalScanned} files, found ${scanResult.files.length} relevant files, skipped ${scanResult.skippedCount}`);
      }

      // Step 3: Analyze files and build knowledge graph
      if (scanResult.files.length > 0) {
        const analysisResult = await this.staticAnalyzer.analyzeFiles(scanResult.files);
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Analysis complete: ${analysisResult.nodes.length} nodes, ${analysisResult.relations.length} relations, ${analysisResult.errors.length} errors`);
        }

        // Step 4: Add analysis results to knowledge graph
        await this.knowledgeGraph.addAnalysisResult(analysisResult.nodes, analysisResult.relations);

        // Step 5: Save knowledge graph
        await this.knowledgeGraph.saveGraph();
      }

      this.initialized = true;
      const duration = Date.now() - startTime;
      
      if (this.config.getDebugMode()) {
        const stats = this.knowledgeGraph.getStatistics();
        console.log(`[ContextAgent] Initialization complete in ${duration}ms`);
        console.log(`[ContextAgent] Graph statistics:`, stats);
      }

    } catch (error) {
      console.error('[ContextAgent] Initialization failed:', error);
      // Don't throw - allow CLI to continue without ContextAgent
      this.initialized = false;
    }
  }

  /**
   * Get context for prompt injection
   * Milestone 4: Intelligent layered context injection with token budget management
   */
  async getContextForPrompt(userInput?: string): Promise<string> {
    if (!this.initialized) {
      return '';
    }

    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] getContextForPrompt called (Milestone 4: layered context injection)');
    }
    
    try {
      // Get knowledge graph statistics for basic validation
      const stats = this.knowledgeGraph.getStatistics();
      if (!stats || stats.totalNodes === 0) {
        if (this.config.getDebugMode()) {
          console.log('[ContextAgent] No knowledge graph data available');
        }
        return '';
      }

      // Use layered context manager for intelligent context generation
      const layeredResult = await this.layeredContextManager.generateLayeredContext(
        userInput || '',
        8000 // Token budget - adjust based on model context window
      );
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgent] Generated layered context: ${layeredResult.totalTokens} tokens across ${layeredResult.layers.length} layers`);
        if (layeredResult.truncated) {
          console.log(`[ContextAgent] Context was truncated: ${layeredResult.truncationDetails}`);
        }
      }
      
      // Format the layered context for model consumption
      const formattedContext = this.layeredContextManager.formatLayeredContextForModel(layeredResult);
      
      // Add legacy fallback information for compatibility
      if (layeredResult.layers.length === 0) {
        return this.generateFallbackContext(stats);
      }
      
      return formattedContext;
      
    } catch (error) {
      console.error('[ContextAgent] Failed to generate layered context:', error);
      
      // Fallback to basic context if layered context fails
      try {
        const stats = this.knowledgeGraph.getStatistics();
        return this.generateFallbackContext(stats);
      } catch (fallbackError) {
        console.error('[ContextAgent] Fallback context generation also failed:', fallbackError);
        return '';
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
        
        if (this.config.getDebugMode()) {
          console.log(`[ContextAgent] Updated knowledge graph for ${filePath}: ${analysisResult.nodes.length} nodes, ${analysisResult.relations.length} relations`);
        }
      }
    } catch (error) {
      console.error(`[ContextAgent] Failed to process file change for ${filePath}:`, error);
    }
  }

  /**
   * Force full re-initialization (equivalent to /init command)
   */
  async reinitialize(): Promise<void> {
    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Forcing full re-initialization');
    }

    this.initialized = false;
    this.knowledgeGraph.clear();
    await this.initialize();
  }

  /**
   * Get knowledge graph statistics
   */
  getStatistics(): any {
    if (!this.initialized) {
      return null;
    }
    
    return this.knowledgeGraph.getStatistics();
  }

  /**
   * Check if ContextAgent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get comprehensive summary of ContextAgent status and capabilities
   * Used for documentation and debugging
   */
  async getSummary(): Promise<{
    status: string;
    capabilities: string[];
    statistics: any;
    recentActivity: string[];
  }> {
    const summary = {
      status: this.initialized ? 'Initialized and Ready' : 'Not Initialized',
      capabilities: [
        'Static code analysis and AST parsing',
        'Knowledge graph construction and storage',
        'Intelligent context injection for AI prompts',
        'Project structure analysis and insights',
        'User intent detection and suggestions',
        'Real-time file change tracking (Milestone 2)',
        'Smart keyword extraction and relevance scoring'
      ],
      statistics: this.initialized ? this.knowledgeGraph.getStatistics() : null,
      recentActivity: [] as string[]
    };

    if (this.initialized && summary.statistics) {
      // Add recent activity information
      summary.recentActivity.push(`Knowledge graph built with ${summary.statistics.totalNodes || 0} nodes`);
      summary.recentActivity.push(`Project analysis completed in session ${this.sessionId}`);
      if (summary.statistics.fileNodes && summary.statistics.fileNodes > 0) {
        summary.recentActivity.push(`Analyzed ${summary.statistics.fileNodes} source files`);
      }
    }

    return summary;
  }

  /**
   * Get current project directory
   */
  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clean up resources
   * Milestone 1: Empty implementation
   */
  async cleanup(): Promise<void> {
    // No-op for Milestone 1
    if (this.config.getDebugMode()) {
      console.log('[ContextAgent] Cleanup called (Milestone 1: no-op mode)');
    }
    
    this.initialized = false;
  }
}
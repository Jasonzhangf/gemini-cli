/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { IContextExtractor, ContextQuery, ExtractedContext } from '../interfaces/contextExtractor.js';
import { Neo4jKnowledgeGraphProvider } from '../graph/Neo4jKnowledgeGraphProvider.js';
import { SiliconFlowEmbeddingProvider } from '../vector/siliconFlowEmbeddingProvider.js';
import { KnowledgeNode, KnowledgeRelationship, GraphQuery } from '../interfaces/knowledgeGraphProvider.js';
import { VectorQuery } from '../interfaces/vectorSearchProvider.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Neo4j Graph RAG提取器配置
 */
export interface Neo4jGraphRAGConfig {
  // Neo4j配置
  neo4jConfig: {
    uri: string;
    username: string;
    password: string;
    database?: string;
    enableDebug?: boolean;
  };
  
  // 向量搜索配置
  vectorConfig: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    enableFallback?: boolean;
  };
  
  // 搜索配置
  searchConfig: {
    maxResults?: number;
    similarityThreshold?: number;
    includeRelationships?: boolean;
    expandRelationships?: boolean;
    maxExpansionDepth?: number;
    enableHybridSearch?: boolean;
  };
  
  // 上下文构建配置
  contextConfig: {
    maxContextLength?: number;
    includeMetadata?: boolean;
    includePath?: boolean;
    enableSemanticClustering?: boolean;
    weightFunction?: 'linear' | 'exponential' | 'logarithmic';
  };
}

/**
 * 搜索结果项
 */
interface SearchResultItem {
  node: KnowledgeNode;
  score: number;
  relationships: KnowledgeRelationship[];
  depth: number;
}

/**
 * Neo4j Graph RAG上下文提取器
 * 
 * 结合Neo4j图数据库和向量搜索，提供强大的上下文提取能力
 * 
 * 特性：
 * - 图结构化的知识表示
 * - 向量相似度搜索
 * - 关系感知的上下文扩展
 * - 语义聚类和排序
 * - 多层次的上下文构建
 * - 故障自动降级
 */
export class Neo4jGraphRAGExtractor implements IContextExtractor {
  private graphProvider: Neo4jKnowledgeGraphProvider;
  private vectorProvider: SiliconFlowEmbeddingProvider;
  private config: Neo4jGraphRAGConfig;
  private isInitialized = false;

  constructor(config: Partial<Neo4jGraphRAGConfig> = {}) {
    this.config = {
      neo4jConfig: {
        uri: config.neo4jConfig?.uri || process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: config.neo4jConfig?.username || process.env.NEO4J_USERNAME || 'neo4j',
        password: config.neo4jConfig?.password || process.env.NEO4J_PASSWORD || 'password',
        database: config.neo4jConfig?.database || process.env.NEO4J_DATABASE || 'neo4j',
        enableDebug: config.neo4jConfig?.enableDebug ?? false
      },
      vectorConfig: {
        apiKey: config.vectorConfig?.apiKey || process.env.SILICONFLOW_API_KEY,
        baseUrl: config.vectorConfig?.baseUrl || 'https://api.siliconflow.cn/v1',
        model: config.vectorConfig?.model || 'BAAI/bge-m3',
        enableFallback: config.vectorConfig?.enableFallback ?? true
      },
      searchConfig: {
        maxResults: config.searchConfig?.maxResults || 20,
        similarityThreshold: config.searchConfig?.similarityThreshold || 0.5,
        includeRelationships: config.searchConfig?.includeRelationships ?? true,
        expandRelationships: config.searchConfig?.expandRelationships ?? true,
        maxExpansionDepth: config.searchConfig?.maxExpansionDepth || 2,
        enableHybridSearch: config.searchConfig?.enableHybridSearch ?? true
      },
      contextConfig: {
        maxContextLength: config.contextConfig?.maxContextLength || 8000,
        includeMetadata: config.contextConfig?.includeMetadata ?? true,
        includePath: config.contextConfig?.includePath ?? true,
        enableSemanticClustering: config.contextConfig?.enableSemanticClustering ?? true,
        weightFunction: config.contextConfig?.weightFunction || 'exponential'
      }
    };

    this.graphProvider = new Neo4jKnowledgeGraphProvider(this.config.neo4jConfig);
    this.vectorProvider = new SiliconFlowEmbeddingProvider(this.config.vectorConfig);
  }

  /**
   * 初始化提取器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化Neo4j连接
      await this.graphProvider.initialize();
      
      // 检查Neo4j连接
      const isHealthy = await this.graphProvider.healthCheck();
      if (!isHealthy) {
        throw new Error('Neo4j health check failed');
      }

      this.isInitialized = true;
      
      if (this.config.neo4jConfig.enableDebug) {
        console.log('[Neo4jGraphRAGExtractor] 初始化成功');
        const stats = await this.graphProvider.getStatistics();
        console.log('[Neo4jGraphRAGExtractor] 数据库统计:', stats);
      }
    } catch (error) {
      console.error('[Neo4jGraphRAGExtractor] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 提取上下文
   */
  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { userInput, conversationHistory, maxResults } = query;
    const startTime = Date.now();

    try {
      // 1. 执行图搜索
      const searchResults = await this.executeGraphSearch(userInput, maxResults);
      
      // 2. 关系扩展
      let expandedResults = searchResults;
      if (this.config.searchConfig.expandRelationships) {
        expandedResults = await this.expandRelationships(searchResults);
      }

      // 3. 语义聚类和排序
      const clusteredResults = this.config.contextConfig.enableSemanticClustering
        ? await this.performSemanticClustering(expandedResults)
        : expandedResults;

      // 4. 构建上下文
      const context = await this.buildContext(clusteredResults, userInput);

      // 5. 集成对话历史
      const integratedContext = this.integrateConversationHistory(context, conversationHistory);

      const executionTime = Date.now() - startTime;
      
      if (this.config.neo4jConfig.enableDebug) {
        console.log(`[Neo4jGraphRAGExtractor] 上下文提取完成，耗时: ${executionTime}ms`);
        console.log(`[Neo4jGraphRAGExtractor] 搜索结果: ${searchResults.length}个节点`);
        console.log(`[Neo4jGraphRAGExtractor] 扩展结果: ${expandedResults.length}个节点`);
      }

      return integratedContext;
    } catch (error) {
      console.error('[Neo4jGraphRAGExtractor] 上下文提取失败:', error);
      
      // 降级到基础搜索
      return await this.fallbackExtraction(userInput, conversationHistory, maxResults);
    }
  }

  /**
   * 执行图搜索
   */
  private async executeGraphSearch(userInput: string, maxResults?: number): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    // 1. 向量搜索 + 图查询
    if (this.config.searchConfig.enableHybridSearch) {
      try {
        // 使用向量搜索获取相似内容
        const vectorResults = await this.vectorProvider.search(
          { text: userInput, topK: maxResults || this.config.searchConfig.maxResults! },
          { maxResults: maxResults || this.config.searchConfig.maxResults! }
        );

        // 对每个向量结果查询图中的对应节点
        for (const vectorResult of vectorResults.results) {
          const graphQuery: GraphQuery = {
            searchTerm: vectorResult.content,
            maxResults: 1,
            includeRelationships: this.config.searchConfig.includeRelationships,
            nodeTypes: undefined,
            metadata: undefined
          };

          const graphResults = await this.graphProvider.query(graphQuery);
          
          for (const node of graphResults.nodes) {
            results.push({
              node,
              score: vectorResult.score,
              relationships: node.relationships || [],
              depth: 0
            });
          }
        }
      } catch (error) {
        console.warn('[Neo4jGraphRAGExtractor] 向量搜索失败，使用纯图搜索:', error);
      }
    }

    // 2. 纯图搜索作为补充或主要方式
    const graphQuery: GraphQuery = {
      searchTerm: userInput,
      maxResults: maxResults || this.config.searchConfig.maxResults!,
      includeRelationships: this.config.searchConfig.includeRelationships,
      nodeTypes: undefined,
      metadata: undefined
    };

    const graphResults = await this.graphProvider.query(graphQuery);
    
    for (const node of graphResults.nodes) {
      // 避免重复添加
      const existingIndex = results.findIndex(r => r.node.id === node.id);
      if (existingIndex === -1) {
        results.push({
          node,
          score: this.calculateGraphScore(node, userInput),
          relationships: node.relationships || [],
          depth: 0
        });
      } else {
        // 更新分数（取最高分）
        results[existingIndex].score = Math.max(results[existingIndex].score, this.calculateGraphScore(node, userInput));
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults || this.config.searchConfig.maxResults!);
  }

  /**
   * 计算图节点分数
   */
  private calculateGraphScore(node: KnowledgeNode, query: string): number {
    let score = 0;

    // 名称匹配
    if (node.name?.toLowerCase().includes(query.toLowerCase())) {
      score += 0.8;
    }

    // 内容匹配
    if (node.content?.toLowerCase().includes(query.toLowerCase())) {
      score += 0.6;
    }

    // 关系权重
    if (node.relationships) {
      const relationshipBonus = node.relationships.length * 0.1;
      score += Math.min(relationshipBonus, 0.5);
    }

    // 节点类型权重
    const typeWeights: Record<string, number> = {
      'function': 0.9,
      'class': 0.8,
      'file': 0.7,
      'module': 0.6,
      'variable': 0.5
    };

    score += typeWeights[node.type] || 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * 扩展关系
   */
  private async expandRelationships(searchResults: SearchResultItem[]): Promise<SearchResultItem[]> {
    const expandedResults = [...searchResults];
    const processedIds = new Set(searchResults.map(r => r.node.id));
    const maxDepth = this.config.searchConfig.maxExpansionDepth!;

    for (const result of searchResults) {
      await this.expandNodeRelationships(result.node, 1, maxDepth, expandedResults, processedIds);
    }

    return expandedResults;
  }

  /**
   * 递归扩展节点关系
   */
  private async expandNodeRelationships(
    node: KnowledgeNode,
    currentDepth: number,
    maxDepth: number,
    results: SearchResultItem[],
    processedIds: Set<string>
  ): Promise<void> {
    if (currentDepth > maxDepth || !node.relationships) {
      return;
    }

    for (const relationship of node.relationships) {
      if (processedIds.has(relationship.toId)) {
        continue;
      }

      // 查询关联节点
      const query: GraphQuery = {
        searchTerm: undefined,
        maxResults: 1,
        includeRelationships: true,
        nodeTypes: undefined,
        metadata: { id: relationship.toId }
      };

      try {
        const relatedResults = await this.graphProvider.query(query);
        
        for (const relatedNode of relatedResults.nodes) {
          if (!processedIds.has(relatedNode.id)) {
            // 计算关系权重影响的分数
            const relationshipWeight = relationship.weight || 1.0;
            const depthPenalty = Math.pow(0.8, currentDepth); // 深度惩罚
            const score = relationshipWeight * depthPenalty;

            results.push({
              node: relatedNode,
              score: Math.max(score, 0.1),
              relationships: relatedNode.relationships || [],
              depth: currentDepth
            });

            processedIds.add(relatedNode.id);

            // 递归扩展
            await this.expandNodeRelationships(relatedNode, currentDepth + 1, maxDepth, results, processedIds);
          }
        }
      } catch (error) {
        console.warn(`[Neo4jGraphRAGExtractor] 关系扩展失败 ${relationship.toId}:`, error);
      }
    }
  }

  /**
   * 语义聚类
   */
  private async performSemanticClustering(results: SearchResultItem[]): Promise<SearchResultItem[]> {
    // 简单的基于类型和分数的聚类
    const clusters = new Map<string, SearchResultItem[]>();

    for (const result of results) {
      const clusterKey = `${result.node.type}_${Math.floor(result.score * 10)}`;
      
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      
      clusters.get(clusterKey)!.push(result);
    }

    // 从每个聚类中选择最佳结果
    const clusteredResults: SearchResultItem[] = [];
    
    for (const [clusterKey, clusterResults] of clusters) {
      // 按分数排序并选择前几个
      clusterResults.sort((a, b) => b.score - a.score);
      clusteredResults.push(...clusterResults.slice(0, 3));
    }

    return clusteredResults.sort((a, b) => b.score - a.score);
  }

  /**
   * 构建上下文
   */
  private async buildContext(results: SearchResultItem[], query: string): Promise<ExtractedContext> {
    const context: ExtractedContext = {
      semantic: {
        summary: '',
        relevantConcepts: [],
        confidenceScore: 0
      },
      code: {
        relevantFiles: [],
        relevantFunctions: []
      },
      metadata: {
        searchQuery: query,
        resultsCount: results.length,
        extractionMethod: 'neo4j-graph-rag',
        timestamp: new Date().toISOString()
      }
    };

    let currentLength = 0;
    const maxLength = this.config.contextConfig.maxContextLength!;
    
    // 构建语义总结
    const conceptCounts = new Map<string, number>();
    const summaryParts: string[] = [];

    for (const result of results) {
      const { node, score, depth } = result;
      
      // 检查长度限制
      const nodeContentLength = (node.content || '').length;
      if (currentLength + nodeContentLength > maxLength) {
        break;
      }

      // 添加到相关概念
      if (node.type) {
        conceptCounts.set(node.type, (conceptCounts.get(node.type) || 0) + 1);
      }

      // 权重计算
      const weight = this.calculateContextWeight(score, depth);

      // 根据节点类型添加到相应的上下文
      if (node.type === 'file') {
        context.code.relevantFiles.push({
          path: node.id,
          summary: node.content || '',
          relevance: weight,
          contextLines: node.content ? node.content.split('\n') : [],
          startLine: 1,
          endLine: node.content ? node.content.split('\n').length : 0
        });
      } else if (node.type === 'function' || node.type === 'class') {
        context.code.relevantFunctions.push({
          name: node.name || '',
          signature: node.content || '',
          docstring: node.metadata?.docstring || '',
          relevance: weight,
          filePath: node.metadata?.filePath || '',
          startLine: node.metadata?.startLine || 0,
          endLine: node.metadata?.endLine || 0
        });
      }

      // 添加到摘要
      if (node.content) {
        summaryParts.push(`${node.name || node.id}: ${node.content.substring(0, 200)}...`);
      }

      currentLength += nodeContentLength;
    }

    // 生成相关概念
    context.semantic.relevantConcepts = Array.from(conceptCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([concept, count]) => ({ concept, weight: count / results.length }));

    // 生成摘要
    context.semantic.summary = summaryParts.join('\n\n');

    // 计算置信度分数
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    context.semantic.confidenceScore = Math.min(avgScore * 0.9, 1.0);

    return context;
  }

  /**
   * 计算上下文权重
   */
  private calculateContextWeight(score: number, depth: number): number {
    const depthPenalty = Math.pow(0.8, depth);
    
    switch (this.config.contextConfig.weightFunction) {
      case 'linear':
        return score * depthPenalty;
      case 'exponential':
        return Math.pow(score, 1.5) * depthPenalty;
      case 'logarithmic':
        return Math.log(1 + score) * depthPenalty;
      default:
        return score * depthPenalty;
    }
  }

  /**
   * 集成对话历史
   */
  private integrateConversationHistory(context: ExtractedContext, history?: any[]): ExtractedContext {
    if (!history || history.length === 0) {
      return context;
    }

    // 添加对话历史到元数据
    context.metadata = {
      ...context.metadata,
      conversationHistory: history.slice(-5).map(h => ({
        role: h.role,
        content: h.content.substring(0, 200)
      }))
    };

    return context;
  }

  /**
   * 降级提取
   */
  private async fallbackExtraction(
    userInput: string,
    conversationHistory?: any[],
    maxResults?: number
  ): Promise<ExtractedContext> {
    console.log('[Neo4jGraphRAGExtractor] 使用降级提取模式');

    // 尝试基础的文本搜索
    try {
      const graphQuery: GraphQuery = {
        searchTerm: userInput,
        maxResults: maxResults || 5,
        includeRelationships: false,
        nodeTypes: undefined,
        metadata: undefined
      };

      const results = await this.graphProvider.query(graphQuery);
      
      return {
        semantic: {
          summary: `基于关键词"${userInput}"的基础搜索结果`,
          relevantConcepts: [],
          confidenceScore: 0.5
        },
        code: {
          relevantFiles: results.nodes.filter(n => n.type === 'file').map(n => ({
            path: n.id,
            summary: n.content || '',
            relevance: 0.5,
            contextLines: [],
            startLine: 1,
            endLine: 1
          })),
          relevantFunctions: results.nodes.filter(n => n.type === 'function').map(n => ({
            name: n.name || '',
            signature: n.content || '',
            docstring: '',
            relevance: 0.5,
            filePath: '',
            startLine: 0,
            endLine: 0
          }))
        },
        metadata: {
          searchQuery: userInput,
          resultsCount: results.nodes.length,
          extractionMethod: 'neo4j-fallback',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('[Neo4jGraphRAGExtractor] 降级提取也失败:', error);
      
      // 返回空上下文
      return {
        semantic: {
          summary: '上下文提取失败',
          relevantConcepts: [],
          confidenceScore: 0
        },
        code: {
          relevantFiles: [],
          relevantFunctions: []
        },
        metadata: {
          searchQuery: userInput,
          resultsCount: 0,
          extractionMethod: 'neo4j-error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * 获取提取器统计信息
   */
  async getStatistics(): Promise<{
    graphStats: any;
    isHealthy: boolean;
    config: Neo4jGraphRAGConfig;
  }> {
    const isHealthy = await this.graphProvider.healthCheck();
    const graphStats = isHealthy ? await this.graphProvider.getStatistics() : null;

    return {
      graphStats,
      isHealthy,
      config: this.config
    };
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    await this.graphProvider.dispose();
    this.isInitialized = false;
  }
}
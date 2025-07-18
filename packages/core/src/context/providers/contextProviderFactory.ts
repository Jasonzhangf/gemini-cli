/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IContextProviderFactory, 
  IKnowledgeGraphProvider, 
  IVectorSearchProvider, 
  IContextExtractor,
  ContextProviderConfig 
} from '../interfaces/contextProviders.js';

// Import concrete implementations
import { SiliconFlowEmbeddingProvider } from './vector/siliconFlowEmbeddingProvider.js';
import { RAGContextExtractor } from './extractor/ragContextExtractor.js';
import { Neo4jKnowledgeGraphProvider } from './graph/Neo4jKnowledgeGraphProvider.js';
import { Neo4jGraphRAGExtractor } from './extractor/Neo4jGraphRAGExtractor.js';

/**
 * Factory for creating pluggable context providers
 * Supports multiple implementations that can be swapped at runtime
 */
export class ContextProviderFactory implements IContextProviderFactory {
  private static instance: ContextProviderFactory;
  
  // Registry of available provider types
  private vectorProviders = new Map<string, new (...args: any[]) => IVectorSearchProvider>();
  private extractorProviders = new Map<string, new (...args: any[]) => IContextExtractor>();
  private graphProviders = new Map<string, new (...args: any[]) => IKnowledgeGraphProvider>();

  private constructor() {
    this.registerDefaultProviders();
  }

  static getInstance(): ContextProviderFactory {
    if (!ContextProviderFactory.instance) {
      ContextProviderFactory.instance = new ContextProviderFactory();
    }
    return ContextProviderFactory.instance;
  }

  /**
   * Register default provider implementations
   */
  private registerDefaultProviders(): void {
    // Vector providers
    this.vectorProviders.set('siliconflow', SiliconFlowEmbeddingProvider);
    
    // Graph providers
    this.graphProviders.set('neo4j', Neo4jKnowledgeGraphProvider as any);
    
    // Extractor providers - support both RAG and Neo4j Graph RAG
    this.extractorProviders.set('rag', RAGContextExtractor);
    this.extractorProviders.set('neo4j-graph-rag', Neo4jGraphRAGExtractor);
  }


  /**
   * Register a custom vector provider
   */
  registerVectorProvider(type: string, providerClass: new (...args: any[]) => IVectorSearchProvider): void {
    this.vectorProviders.set(type, providerClass);
  }

  /**
   * Register a custom extractor provider
   */
  registerExtractorProvider(type: string, providerClass: new (...args: any[]) => IContextExtractor): void {
    this.extractorProviders.set(type, providerClass);
  }

  /**
   * Register a custom graph provider
   */
  registerGraphProvider(type: string, providerClass: new (...args: any[]) => IKnowledgeGraphProvider): void {
    this.graphProviders.set(type, providerClass);
  }


  /**
   * Create vector search provider
   */
  createVectorProvider(config: ContextProviderConfig['vectorProvider']): IVectorSearchProvider {
    const ProviderClass = this.vectorProviders.get(config.type);
    
    if (!ProviderClass) {
      throw new Error(`Unknown vector provider type: ${config.type}`);
    }

    // Add environment-specific config for certain providers
    let enhancedConfig = { ...config.config };
    
    if (config.type === 'siliconflow') {
      enhancedConfig = {
        ...enhancedConfig,
        apiKey: process.env.SILICONFLOW_API_KEY || enhancedConfig.apiKey || '',
        baseUrl: process.env.SILICONFLOW_BASE_URL || enhancedConfig.baseUrl || 'https://api.siliconflow.cn/v1',
        model: process.env.SILICONFLOW_EMBEDDING_MODEL || enhancedConfig.model || 'BAAI/bge-m3',
        dimensions: enhancedConfig.dimensions || 1024,
        timeout: enhancedConfig.timeout || 30000
      };
    }

    return new ProviderClass(enhancedConfig);
  }

  /**
   * Create graph provider
   */
  createGraphProvider(config: { type: 'local' | 'neo4j' | 'memory' | 'custom'; config: Record<string, any>; }, projectRoot?: string): IKnowledgeGraphProvider {
    const ProviderClass = this.graphProviders.get(config.type);
    
    if (!ProviderClass) {
      throw new Error(`Unknown graph provider type: ${config.type}`);
    }

    // Neo4j specific configuration enhancement
    let enhancedConfig = { ...config.config };
    if (config.type === 'neo4j') {
      enhancedConfig = {
        ...enhancedConfig,
        uri: process.env.NEO4J_URI || enhancedConfig.uri || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || enhancedConfig.username || 'neo4j',
        password: process.env.NEO4J_PASSWORD || enhancedConfig.password || 'password',
        database: process.env.NEO4J_DATABASE || enhancedConfig.database || 'neo4j',
        enableDebug: enhancedConfig.enableDebug ?? false
      };
    }

    return new ProviderClass(enhancedConfig);
  }

  /**
   * Create context extractor - support both RAG and Neo4j Graph RAG
   */
  createContextExtractor(
    config: ContextProviderConfig['extractorProvider'],
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ): IContextExtractor {
    const ExtractorClass = this.extractorProviders.get(config.type);
    if (!ExtractorClass) {
      throw new Error(`Unknown extractor provider: ${config.type}`);
    }

    if (config.type === 'neo4j-graph-rag') {
      // Neo4j Graph RAG extractor configuration
      const enhancedConfig = {
        neo4jConfig: {
          uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
          username: process.env.NEO4J_USERNAME || 'neo4j',
          password: process.env.NEO4J_PASSWORD || 'password',
          database: process.env.NEO4J_DATABASE || 'neo4j',
          enableDebug: config.config?.enableDebug ?? false
        },
        vectorConfig: {
          apiKey: process.env.SILICONFLOW_API_KEY,
          baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
          model: process.env.SILICONFLOW_EMBEDDING_MODEL || 'BAAI/bge-m3',
          enableFallback: true
        },
        searchConfig: {
          maxResults: config.config?.maxResults || 20,
          similarityThreshold: config.config?.similarityThreshold || 0.5,
          includeRelationships: config.config?.includeRelationships ?? true,
          expandRelationships: config.config?.expandRelationships ?? true,
          maxExpansionDepth: config.config?.maxExpansionDepth || 2,
          enableHybridSearch: config.config?.enableHybridSearch ?? true
        },
        contextConfig: {
          maxContextLength: config.config?.maxContextLength || 8000,
          includeMetadata: config.config?.includeMetadata ?? true,
          includePath: config.config?.includePath ?? true,
          enableSemanticClustering: config.config?.enableSemanticClustering ?? true,
          weightFunction: config.config?.weightFunction || 'exponential'
        },
        ...config.config
      };

      return new ExtractorClass(enhancedConfig);
    } else if (config.type === 'rag') {
      // Original RAG extractor
      if (!vectorProvider) {
        throw new Error('Vector provider is required for RAG extractor');
      }

      const enhancedConfig = {
        ...config.config,
        projectRoot: process.cwd(),
        debugMode: true // Enable debug mode for RAG
      };

      return new ExtractorClass(enhancedConfig, graphProvider, vectorProvider);
    } else {
      throw new Error(`Unsupported extractor type: ${config.type}`);
    }
  }

  /**
   * Get available provider types
   */
  getAvailableProviders(): { vector: string[]; extractor: string[]; graph: string[] } {
    return {
      vector: Array.from(this.vectorProviders.keys()),
      extractor: Array.from(this.extractorProviders.keys()),
      graph: Array.from(this.graphProviders.keys())
    };
  }

  /**
   * Create a complete provider setup with recommended defaults
   * Neo4j Graph RAG is now the default RAG provider
   */
  createRecommendedSetup(
    projectSize: 'small' | 'medium' | 'large' = 'medium',
    useNeo4j?: boolean
  ): ContextProviderConfig {
    // 自动检测是否应该使用Neo4j
    if (useNeo4j === undefined) {
      useNeo4j = process.env.DEFAULT_RAG_PROVIDER === 'neo4j-graph-rag' || 
                 process.env.ENABLE_NEO4J_GRAPH_RAG === 'true' ||
                 true; // 默认使用Neo4j
    }
    const baseVectorConfig = {
      type: 'siliconflow' as const,
      config: {
        modelName: 'BAAI/bge-m3',
        dimensions: 1024,
        batchSize: projectSize === 'small' ? 20 : 100
      }
    };

    let baseExtractorConfig;
    
    if (useNeo4j) {
      // Use Neo4j Graph RAG as primary extractor
      baseExtractorConfig = {
        type: 'neo4j-graph-rag' as const,
        config: {
          maxResults: projectSize === 'small' ? 10 : projectSize === 'large' ? 30 : 20,
          similarityThreshold: 0.5,
          includeRelationships: true,
          expandRelationships: projectSize !== 'small',
          maxExpansionDepth: projectSize === 'large' ? 3 : 2,
          enableHybridSearch: true,
          maxContextLength: projectSize === 'small' ? 4000 : projectSize === 'large' ? 12000 : 8000,
          enableSemanticClustering: projectSize !== 'small',
          enableDebug: false
        }
      };
    } else {
      // Use traditional RAG extractor
      baseExtractorConfig = {
        type: 'rag' as const,
        config: { 
          maxResults: projectSize === 'small' ? 5 : projectSize === 'large' ? 10 : 8,
          threshold: 0.1
        }
      };
    }

    return {
      graphProvider: {
        type: 'neo4j' as const,
        config: {
          uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
          username: process.env.NEO4J_USERNAME || 'neo4j',
          password: process.env.NEO4J_PASSWORD || 'password',
          database: process.env.NEO4J_DATABASE || 'neo4j',
          enableDebug: false
        }
      },
      vectorProvider: baseVectorConfig,
      extractorProvider: baseExtractorConfig
    };
  }

  /**
   * Create Neo4j backup configuration
   */
  createNeo4jBackupSetup(primaryConfig: ContextProviderConfig): {
    primary: ContextProviderConfig;
    backup: ContextProviderConfig;
  } {
    const backupConfig = this.createRecommendedSetup('medium', true);
    
    return {
      primary: primaryConfig,
      backup: backupConfig
    };
  }

  /**
   * Validate provider configuration
   */
  validateConfig(config: ContextProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if provider types exist
    if (!this.vectorProviders.has(config.vectorProvider.type)) {
      errors.push(`Unknown vector provider: ${config.vectorProvider.type}`);
    }

    if (!this.extractorProviders.has(config.extractorProvider.type)) {
      errors.push(`Unknown extractor provider: ${config.extractorProvider.type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

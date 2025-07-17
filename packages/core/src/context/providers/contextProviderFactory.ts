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

/**
 * Factory for creating pluggable context providers
 * Supports multiple implementations that can be swapped at runtime
 */
export class ContextProviderFactory implements IContextProviderFactory {
  private static instance: ContextProviderFactory;
  
  // Registry of available provider types
  private vectorProviders = new Map<string, new (...args: any[]) => IVectorSearchProvider>();
  private extractorProviders = new Map<string, new (...args: any[]) => IContextExtractor>();

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
    
    // Extractor providers - only keep RAG, remove simple rule-based and hybrid
    this.extractorProviders.set('rag', RAGContextExtractor);
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
   * Create context extractor - simplified to only support RAG
   */
  createContextExtractor(
    config: ContextProviderConfig['extractorProvider'],
    vectorProvider: IVectorSearchProvider,
    projectRoot?: string
  ): IContextExtractor {
    // Only RAG extractor is supported
    if (config.type !== 'rag') {
      throw new Error(`Only RAG extractor is supported, got: ${config.type}`);
    }
    
    const ExtractorClass = this.extractorProviders.get('rag');
    if (!ExtractorClass) {
      throw new Error('RAG extractor not found');
    }

    const enhancedConfig = {
      ...config.config,
      projectRoot: projectRoot || process.cwd(),
      debugMode: true // Enable debug mode for RAG
    };

    return new ExtractorClass(enhancedConfig, null, vectorProvider);
  }

  /**
   * Get available provider types
   */
  getAvailableProviders(): { vector: string[]; extractor: string[] } {
    return {
      vector: Array.from(this.vectorProviders.keys()),
      extractor: Array.from(this.extractorProviders.keys())
    };
  }

  /**
   * Create a complete provider setup with recommended defaults
   */
  createRecommendedSetup(projectSize: 'small' | 'medium' | 'large' = 'medium'): ContextProviderConfig {
    const baseVectorConfig = {
      type: 'siliconflow' as const,
      config: {
        modelName: 'BAAI/bge-m3',
        dimensions: 1024,
        batchSize: projectSize === 'small' ? 20 : 100
      }
    };

    const baseExtractorConfig = {
      type: 'rag' as const,
      config: { 
        maxResults: projectSize === 'small' ? 5 : projectSize === 'large' ? 10 : 8,
        threshold: 0.1
      }
    };

    return {
      vectorProvider: baseVectorConfig,
      extractorProvider: baseExtractorConfig
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

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
import { LocalKnowledgeGraphProvider } from './graph/localKnowledgeGraph.js';
import { MemoryKnowledgeGraphProvider } from './graph/memoryKnowledgeGraph.js';
import { TFIDFVectorProvider } from './vector/tfidfVectorProvider.js';
import { LocalEmbeddingVectorProvider } from './vector/localEmbeddingProvider.js';
import { RAGContextExtractor } from './extractor/ragContextExtractor.js';
import { RuleBasedContextExtractor } from './extractor/ruleBasedExtractor.js';
import { HybridContextExtractor } from './extractor/hybridExtractor.js';

/**
 * Factory for creating pluggable context providers
 * Supports multiple implementations that can be swapped at runtime
 */
export class ContextProviderFactory implements IContextProviderFactory {
  private static instance: ContextProviderFactory;
  
  // Registry of available provider types
  private graphProviders = new Map<string, new (...args: any[]) => IKnowledgeGraphProvider>();
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
    // Graph providers
    this.graphProviders.set('local', LocalKnowledgeGraphProvider);
    this.graphProviders.set('memory', MemoryKnowledgeGraphProvider);
    
    // Vector providers
    this.vectorProviders.set('tfidf', TFIDFVectorProvider);
    this.vectorProviders.set('local', LocalEmbeddingVectorProvider);
    
    // Extractor providers
    this.extractorProviders.set('rag', RAGContextExtractor);
    this.extractorProviders.set('rule_based', RuleBasedContextExtractor);
    this.extractorProviders.set('hybrid', HybridContextExtractor);
  }

  /**
   * Register a custom graph provider
   */
  registerGraphProvider(type: string, providerClass: new (...args: any[]) => IKnowledgeGraphProvider): void {
    this.graphProviders.set(type, providerClass);
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
   * Create knowledge graph provider
   */
  createGraphProvider(config: ContextProviderConfig['graphProvider']): IKnowledgeGraphProvider {
    const ProviderClass = this.graphProviders.get(config.type);
    
    if (!ProviderClass) {
      throw new Error(`Unknown graph provider type: ${config.type}`);
    }

    return new ProviderClass(config.config);
  }

  /**
   * Create vector search provider
   */
  createVectorProvider(config: ContextProviderConfig['vectorProvider']): IVectorSearchProvider {
    const ProviderClass = this.vectorProviders.get(config.type);
    
    if (!ProviderClass) {
      throw new Error(`Unknown vector provider type: ${config.type}`);
    }

    return new ProviderClass(config.config);
  }

  /**
   * Create context extractor
   */
  createContextExtractor(
    config: ContextProviderConfig['extractorProvider'],
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ): IContextExtractor {
    const ExtractorClass = this.extractorProviders.get(config.type);
    
    if (!ExtractorClass) {
      throw new Error(`Unknown extractor provider type: ${config.type}`);
    }

    return new ExtractorClass(config.config, graphProvider, vectorProvider);
  }

  /**
   * Get available provider types
   */
  getAvailableProviders(): { graph: string[]; vector: string[]; extractor: string[] } {
    return {
      graph: Array.from(this.graphProviders.keys()),
      vector: Array.from(this.vectorProviders.keys()),
      extractor: Array.from(this.extractorProviders.keys())
    };
  }

  /**
   * Create a complete provider setup with recommended defaults
   */
  createRecommendedSetup(projectSize: 'small' | 'medium' | 'large' = 'medium'): ContextProviderConfig {
    switch (projectSize) {
      case 'small':
        return {
          graphProvider: {
            type: 'memory',
            config: { maxNodes: 1000 }
          },
          vectorProvider: {
            type: 'tfidf',
            config: { maxFeatures: 500 }
          },
          extractorProvider: {
            type: 'rule_based',
            config: { maxResults: 5 }
          }
        };

      case 'large':
        return {
          graphProvider: {
            type: 'local',
            config: { 
              persistToDisk: true,
              maxNodes: 50000,
              compressionEnabled: true
            }
          },
          vectorProvider: {
            type: 'local',
            config: { 
              modelName: 'all-MiniLM-L6-v2',
              dimensions: 384,
              batchSize: 100
            }
          },
          extractorProvider: {
            type: 'hybrid',
            config: { 
              ragWeight: 0.7,
              ruleWeight: 0.3,
              maxResults: 10
            }
          }
        };

      case 'medium':
      default:
        return {
          graphProvider: {
            type: 'local',
            config: { 
              persistToDisk: true,
              maxNodes: 10000
            }
          },
          vectorProvider: {
            type: 'tfidf',
            config: { 
              maxFeatures: 2000,
              minDocFreq: 2
            }
          },
          extractorProvider: {
            type: 'rag',
            config: { 
              maxResults: 8,
              threshold: 0.1
            }
          }
        };
    }
  }

  /**
   * Validate provider configuration
   */
  validateConfig(config: ContextProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if provider types exist
    if (!this.graphProviders.has(config.graphProvider.type)) {
      errors.push(`Unknown graph provider: ${config.graphProvider.type}`);
    }

    if (!this.vectorProviders.has(config.vectorProvider.type)) {
      errors.push(`Unknown vector provider: ${config.vectorProvider.type}`);
    }

    if (!this.extractorProviders.has(config.extractorProvider.type)) {
      errors.push(`Unknown extractor provider: ${config.extractorProvider.type}`);
    }

    // Validate hybrid extractor dependencies
    if (config.extractorProvider.type === 'hybrid') {
      if (config.vectorProvider.type === 'tfidf' && config.graphProvider.type === 'memory') {
        errors.push('Hybrid extractor requires more capable providers for optimal performance');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
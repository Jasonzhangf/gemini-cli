/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextProviderFactory } from './contextProviderFactory.js';
import { ContextProviderConfig } from '../interfaces/contextProviders.js';

describe('ContextProviderFactory', () => {
  let factory: ContextProviderFactory;

  beforeEach(() => {
    factory = ContextProviderFactory.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const factory1 = ContextProviderFactory.getInstance();
      const factory2 = ContextProviderFactory.getInstance();
      expect(factory1).toBe(factory2);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return all available provider types', () => {
      const providers = factory.getAvailableProviders();
      
      expect(providers.graph).toContain('local');
      expect(providers.graph).toContain('memory');
      expect(providers.vector).toContain('tfidf');
      expect(providers.vector).toContain('local');
      expect(providers.extractor).toContain('rag');
      expect(providers.extractor).toContain('rule_based');
      expect(providers.extractor).toContain('hybrid');
    });
  });

  describe('createRecommendedSetup', () => {
    it('should create small project configuration', () => {
      const config = factory.createRecommendedSetup('small');
      
      expect(config.graphProvider.type).toBe('memory');
      expect(config.graphProvider.config.maxNodes).toBe(1000);
      expect(config.vectorProvider.type).toBe('tfidf');
      expect(config.vectorProvider.config.maxFeatures).toBe(500);
      expect(config.extractorProvider.type).toBe('rule_based');
    });

    it('should create medium project configuration', () => {
      const config = factory.createRecommendedSetup('medium');
      
      expect(config.graphProvider.type).toBe('local');
      expect(config.graphProvider.config.persistToDisk).toBe(true);
      expect(config.graphProvider.config.maxNodes).toBe(10000);
      expect(config.vectorProvider.type).toBe('tfidf');
      expect(config.vectorProvider.config.maxFeatures).toBe(2000);
      expect(config.extractorProvider.type).toBe('rag');
    });

    it('should create large project configuration', () => {
      const config = factory.createRecommendedSetup('large');
      
      expect(config.graphProvider.type).toBe('local');
      expect(config.graphProvider.config.persistToDisk).toBe(true);
      expect(config.graphProvider.config.maxNodes).toBe(50000);
      expect(config.graphProvider.config.compressionEnabled).toBe(true);
      expect(config.vectorProvider.type).toBe('local');
      expect(config.extractorProvider.type).toBe('hybrid');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const config: ContextProviderConfig = {
        graphProvider: { type: 'memory', config: {} },
        vectorProvider: { type: 'tfidf', config: {} },
        extractorProvider: { type: 'rag', config: {} }
      };

      const result = factory.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid graph provider', () => {
      const config: ContextProviderConfig = {
        graphProvider: { type: 'invalid' as any, config: {} },
        vectorProvider: { type: 'tfidf', config: {} },
        extractorProvider: { type: 'rag', config: {} }
      };

      const result = factory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown graph provider: invalid');
    });

    it('should detect invalid vector provider', () => {
      const config: ContextProviderConfig = {
        graphProvider: { type: 'memory', config: {} },
        vectorProvider: { type: 'invalid' as any, config: {} },
        extractorProvider: { type: 'rag', config: {} }
      };

      const result = factory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown vector provider: invalid');
    });

    it('should detect invalid extractor provider', () => {
      const config: ContextProviderConfig = {
        graphProvider: { type: 'memory', config: {} },
        vectorProvider: { type: 'tfidf', config: {} },
        extractorProvider: { type: 'invalid' as any, config: {} }
      };

      const result = factory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown extractor provider: invalid');
    });

    it('should warn about hybrid extractor with basic providers', () => {
      const config: ContextProviderConfig = {
        graphProvider: { type: 'memory', config: {} },
        vectorProvider: { type: 'tfidf', config: {} },
        extractorProvider: { type: 'hybrid', config: {} }
      };

      const result = factory.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Hybrid extractor requires more capable providers for optimal performance');
    });
  });

  describe('createGraphProvider', () => {
    it('should create memory graph provider', () => {
      const provider = factory.createGraphProvider({
        type: 'memory',
        config: { maxNodes: 500 }
      });

      expect(provider).toBeDefined();
      expect(provider.constructor.name).toBe('MemoryKnowledgeGraphProvider');
    });

    it('should create local graph provider', () => {
      const provider = factory.createGraphProvider({
        type: 'local',
        config: { persistToDisk: true }
      });

      expect(provider).toBeDefined();
      expect(provider.constructor.name).toBe('LocalKnowledgeGraphProvider');
    });

    it('should throw error for unknown graph provider', () => {
      expect(() => {
        factory.createGraphProvider({
          type: 'unknown' as any,
          config: {}
        });
      }).toThrow('Unknown graph provider type: unknown');
    });
  });

  describe('createVectorProvider', () => {
    it('should create TFIDF vector provider', () => {
      const provider = factory.createVectorProvider({
        type: 'tfidf',
        config: { maxFeatures: 1000 }
      });

      expect(provider).toBeDefined();
      expect(provider.constructor.name).toBe('TFIDFVectorProvider');
    });

    it('should create local embedding provider', () => {
      const provider = factory.createVectorProvider({
        type: 'local',
        config: { dimensions: 384 }
      });

      expect(provider).toBeDefined();
      expect(provider.constructor.name).toBe('LocalEmbeddingVectorProvider');
    });

    it('should throw error for unknown vector provider', () => {
      expect(() => {
        factory.createVectorProvider({
          type: 'unknown' as any,
          config: {}
        });
      }).toThrow('Unknown vector provider type: unknown');
    });
  });

  describe('createContextExtractor', () => {
    let mockGraphProvider: any;
    let mockVectorProvider: any;

    beforeEach(() => {
      mockGraphProvider = {
        initialize: async () => {},
        query: async () => ({ nodes: [], relationships: [], totalCount: 0, queryTime: 0 }),
        getNode: async () => null,
        getNeighbors: async () => [],
        upsertNode: async () => {},
        removeNode: async () => {},
        getStatistics: async () => ({ totalNodes: 0, totalRelationships: 0, nodeTypeDistribution: {}, lastUpdated: '' }),
        dispose: async () => {}
      };

      mockVectorProvider = {
        initialize: async () => {},
        indexDocument: async () => {},
        search: async () => ({ query: '', results: [], searchTime: 0, totalDocuments: 0 }),
        removeDocument: async () => {},
        getIndexStats: async () => ({ documentCount: 0, vectorDimensions: 0, indexSize: '', lastUpdated: '' }),
        dispose: async () => {}
      };
    });

    it('should create RAG context extractor', () => {
      const extractor = factory.createContextExtractor(
        { type: 'rag', config: {} },
        mockGraphProvider,
        mockVectorProvider
      );

      expect(extractor).toBeDefined();
      expect(extractor.constructor.name).toBe('RAGContextExtractor');
    });

    it('should create rule-based context extractor', () => {
      const extractor = factory.createContextExtractor(
        { type: 'rule_based', config: {} },
        mockGraphProvider,
        mockVectorProvider
      );

      expect(extractor).toBeDefined();
      expect(extractor.constructor.name).toBe('RuleBasedContextExtractor');
    });

    it('should create hybrid context extractor', () => {
      const extractor = factory.createContextExtractor(
        { type: 'hybrid', config: {} },
        mockGraphProvider,
        mockVectorProvider
      );

      expect(extractor).toBeDefined();
      expect(extractor.constructor.name).toBe('HybridContextExtractor');
    });

    it('should throw error for unknown extractor provider', () => {
      expect(() => {
        factory.createContextExtractor(
          { type: 'unknown' as any, config: {} },
          mockGraphProvider,
          mockVectorProvider
        );
      }).toThrow('Unknown extractor provider type: unknown');
    });
  });
});
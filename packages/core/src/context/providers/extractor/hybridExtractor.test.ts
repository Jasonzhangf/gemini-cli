/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridContextExtractor } from './hybridExtractor.js';
import { 
  IKnowledgeGraphProvider, 
  IVectorSearchProvider,
  ContextQuery,
  ExtractedContext 
} from '../../interfaces/contextProviders.js';

describe('HybridContextExtractor', () => {
  let extractor: HybridContextExtractor;
  let mockGraphProvider: IKnowledgeGraphProvider;
  let mockVectorProvider: IVectorSearchProvider;

  const createMockExtractedContext = (intent: string, confidence: number): ExtractedContext => ({
    semantic: {
      intent,
      confidence,
      entities: ['test', 'entity'],
      concepts: ['concept1', 'concept2']
    },
    code: {
      relevantFiles: [
        { path: '/src/test.ts', relevance: 0.8, summary: 'Test file' }
      ],
      relevantFunctions: [
        { name: 'testFunc', filePath: '/src/test.ts', relevance: 0.7 }
      ],
      relatedPatterns: [
        { pattern: 'test_pattern', description: 'Test pattern', examples: [] }
      ]
    },
    conversation: {
      topicProgression: ['topic1', 'topic2'],
      userGoals: ['goal1', 'goal2'],
      contextContinuity: ['context1', 'context2']
    },
    operational: {
      recentActions: ['action1', 'action2'],
      errorContext: [],
      workflowSuggestions: ['suggestion1']
    }
  });

  beforeEach(async () => {
    // Mock providers
    mockGraphProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ nodes: [], relationships: [], totalCount: 0, queryTime: 0 }),
      getNode: vi.fn().mockResolvedValue(null),
      getNeighbors: vi.fn().mockResolvedValue([]),
      upsertNode: vi.fn().mockResolvedValue(undefined),
      removeNode: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({
        totalNodes: 0, totalRelationships: 0, nodeTypeDistribution: {}, lastUpdated: ''
      }),
      dispose: vi.fn().mockResolvedValue(undefined)
    };

    mockVectorProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      indexDocument: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        query: '', results: [], searchTime: 0, totalDocuments: 0
      }),
      removeDocument: vi.fn().mockResolvedValue(undefined),
      getIndexStats: vi.fn().mockResolvedValue({
        documentCount: 0, vectorDimensions: 0, indexSize: '', lastUpdated: ''
      }),
      dispose: vi.fn().mockResolvedValue(undefined)
    };

    extractor = new HybridContextExtractor(
      {
        ragWeight: 0.7,
        ruleWeight: 0.3,
        maxResults: 10,
        enableFallback: true,
        combineStrategies: 'weighted',
        debugMode: false
      },
      mockGraphProvider,
      mockVectorProvider
    );

    await extractor.initialize();
  });

  describe('initialize', () => {
    it('should initialize both sub-extractors', async () => {
      const newExtractor = new HybridContextExtractor({}, mockGraphProvider, mockVectorProvider);
      await newExtractor.initialize();

      expect(mockGraphProvider.initialize).toHaveBeenCalled();
      expect(mockVectorProvider.initialize).toHaveBeenCalled();
    });
  });

  describe('extractContext', () => {
    it('should combine RAG and rule-based results using weighted strategy', async () => {
      const query: ContextQuery = {
        userInput: '实现用户认证系统',
        conversationHistory: []
      };

      // Mock sub-extractor results
      const ragContext = createMockExtractedContext('development', 0.8);
      const ruleContext = createMockExtractedContext('development', 0.6);

      // Mock the sub-extractors
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockResolvedValue(ragContext)
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockResolvedValue(ruleContext)
      });

      const result = await extractor.extractContext(query);

      expect(result.semantic.intent).toBe('development');
      expect(result.semantic.confidence).toBeCloseTo(0.8 * 0.7 + 0.6 * 0.3, 1);
      expect(result.semantic.entities).toContain('test');
      expect(result.semantic.entities).toContain('entity');
    });

    it('should handle RAG extractor failure with fallback', async () => {
      const query: ContextQuery = {
        userInput: '测试fallback机制',
        conversationHistory: []
      };

      const ruleContext = createMockExtractedContext('general', 0.5);

      // Mock RAG failure and rule success
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockRejectedValue(new Error('RAG failed'))
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockResolvedValue(ruleContext)
      });

      const result = await extractor.extractContext(query);

      expect(result.semantic.intent).toBe('general');
      expect(result.semantic.confidence).toBe(0.5);
    });

    it('should handle rule-based extractor failure with fallback', async () => {
      const query: ContextQuery = {
        userInput: '测试RAG fallback',
        conversationHistory: []
      };

      const ragContext = createMockExtractedContext('analysis', 0.7);

      // Mock rule failure and RAG success
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockResolvedValue(ragContext)
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockRejectedValue(new Error('Rule failed'))
      });

      const result = await extractor.extractContext(query);

      expect(result.semantic.intent).toBe('analysis');
      expect(result.semantic.confidence).toBe(0.7);
    });

    it('should return empty context when both extractors fail', async () => {
      const query: ContextQuery = {
        userInput: '测试双重失败',
        conversationHistory: []
      };

      // Mock both failures
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockRejectedValue(new Error('RAG failed'))
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        extractContext: vi.fn().mockRejectedValue(new Error('Rule failed'))
      });

      const result = await extractor.extractContext(query);

      expect(result.semantic.intent).toBe('general');
      expect(result.semantic.confidence).toBe(0.1);
      expect(result.code.relevantFiles).toHaveLength(0);
    });
  });

  describe('combination strategies', () => {
    let ragContext: ExtractedContext;
    let ruleContext: ExtractedContext;

    beforeEach(() => {
      ragContext = {
        semantic: {
          intent: 'development',
          confidence: 0.8,
          entities: ['React', 'TypeScript'],
          concepts: ['component', 'interface']
        },
        code: {
          relevantFiles: [
            { path: '/src/component.tsx', relevance: 0.9, summary: 'React component' }
          ],
          relevantFunctions: [
            { name: 'createComponent', filePath: '/src/component.tsx', relevance: 0.8 }
          ],
          relatedPatterns: []
        },
        conversation: {
          topicProgression: ['React', 'components'],
          userGoals: ['build UI'],
          contextContinuity: ['component discussion']
        },
        operational: {
          recentActions: ['read component file'],
          errorContext: [],
          workflowSuggestions: ['add tests']
        }
      };

      ruleContext = {
        semantic: {
          intent: 'development',
          confidence: 0.6,
          entities: ['JavaScript', 'frontend'],
          concepts: ['development', 'coding']
        },
        code: {
          relevantFiles: [
            { path: '/src/utils.js', relevance: 0.7, summary: 'Utility functions' }
          ],
          relevantFunctions: [
            { name: 'helper', filePath: '/src/utils.js', relevance: 0.6 }
          ],
          relatedPatterns: []
        },
        conversation: {
          topicProgression: ['JavaScript', 'utilities'],
          userGoals: ['write functions'],
          contextContinuity: ['utility discussion']
        },
        operational: {
          recentActions: ['edit utils file'],
          errorContext: [],
          workflowSuggestions: ['optimize code']
        }
      };
    });

    it('should use weighted combination strategy', async () => {
      extractor.setCombinationStrategy('weighted');

      const result = await (extractor as any).combineWeighted(ragContext, ruleContext);

      expect(result.semantic.intent).toBe('development');
      expect(result.semantic.confidence).toBeCloseTo(0.8 * 0.7 + 0.6 * 0.3, 1);
      expect(result.semantic.entities).toContain('React');
      expect(result.semantic.entities).toContain('TypeScript');
      expect(result.semantic.entities).toContain('JavaScript');
      expect(result.code.relevantFiles).toHaveLength(2);
    });

    it('should use consensus combination strategy', async () => {
      extractor.setCombinationStrategy('consensus');

      // Add overlapping items for consensus
      ruleContext.semantic.entities.push('TypeScript');
      ruleContext.semantic.concepts.push('component');

      const result = await (extractor as any).combineConsensus(ragContext, ruleContext);

      expect(result.semantic.intent).toBe('development');
      expect(result.semantic.confidence).toBe(0.8); // Max of both
      expect(result.semantic.entities).toContain('TypeScript'); // Consensus item
      expect(result.semantic.concepts).toContain('component'); // Consensus item
    });

    it('should use best-first combination strategy', async () => {
      extractor.setCombinationStrategy('best_first');

      const query: ContextQuery = {
        userInput: '测试best-first策略',
        conversationHistory: []
      };

      const result = await (extractor as any).combineBestFirst(ragContext, ruleContext, query);

      // RAG context should be primary (higher score)
      expect(result.semantic.intent).toBe('development');
      expect(result.semantic.entities).toContain('React');
      expect(result.semantic.entities).toContain('TypeScript');
    });
  });

  describe('updateContext', () => {
    it('should update both sub-extractors', async () => {
      const ragUpdate = vi.fn().mockResolvedValue(undefined);
      const ruleUpdate = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        updateContext: ragUpdate
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        updateContext: ruleUpdate
      });

      const update = {
        type: 'file_change' as const,
        data: { filePath: '/src/test.ts', content: 'test content' }
      };

      await extractor.updateContext(update);

      expect(ragUpdate).toHaveBeenCalledWith(update);
      expect(ruleUpdate).toHaveBeenCalledWith(update);
    });
  });

  describe('getConfig', () => {
    it('should return hybrid extractor configuration', async () => {
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        getConfig: vi.fn().mockResolvedValue({
          provider: 'RAGContextExtractor',
          version: '1.0.0',
          capabilities: ['semantic_analysis', 'graph_query']
        })
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        getConfig: vi.fn().mockResolvedValue({
          provider: 'RuleBasedContextExtractor',
          version: '1.0.0',
          capabilities: ['pattern_matching', 'intent_classification']
        })
      });

      const config = await extractor.getConfig();

      expect(config.provider).toBe('HybridContextExtractor');
      expect(config.version).toBe('1.0.0');
      expect(config.capabilities).toContain('hybrid_extraction');
      expect(config.capabilities).toContain('weighted_combination');
      expect(config.capabilities).toContain('fallback_support');
      expect(config.capabilities).toContain('semantic_analysis');
      expect(config.capabilities).toContain('pattern_matching');
    });
  });

  describe('dispose', () => {
    it('should dispose both sub-extractors', async () => {
      const ragDispose = vi.fn().mockResolvedValue(undefined);
      const ruleDispose = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        dispose: ragDispose
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        dispose: ruleDispose
      });

      await extractor.dispose();

      expect(ragDispose).toHaveBeenCalled();
      expect(ruleDispose).toHaveBeenCalled();
    });
  });

  describe('weight management', () => {
    it('should update extraction weights', () => {
      extractor.updateWeights(0.8, 0.2);

      const config = (extractor as any).config;
      expect(config.ragWeight).toBe(0.8);
      expect(config.ruleWeight).toBe(0.2);
    });

    it('should change combination strategy', () => {
      extractor.setCombinationStrategy('consensus');

      const config = (extractor as any).config;
      expect(config.combineStrategies).toBe('consensus');
    });
  });

  describe('getExtractionStats', () => {
    it('should return statistics from both extractors', async () => {
      vi.spyOn(extractor as any, 'ragExtractor', 'get').mockReturnValue({
        getConfig: vi.fn().mockResolvedValue({
          provider: 'RAGContextExtractor',
          version: '1.0.0',
          capabilities: ['semantic_analysis']
        })
      });
      vi.spyOn(extractor as any, 'ruleBasedExtractor', 'get').mockReturnValue({
        getConfig: vi.fn().mockResolvedValue({
          provider: 'RuleBasedContextExtractor',
          version: '1.0.0',
          capabilities: ['pattern_matching']
        })
      });

      const stats = await extractor.getExtractionStats();

      expect(stats.ragExtractor.provider).toBe('RAGContextExtractor');
      expect(stats.ruleExtractor.provider).toBe('RuleBasedContextExtractor');
      expect(stats.hybridConfig.ragWeight).toBe(0.7);
      expect(stats.hybridConfig.ruleWeight).toBe(0.3);
    });
  });

  describe('context scoring', () => {
    it('should calculate context scores correctly', () => {
      const highScoreContext: ExtractedContext = {
        semantic: {
          intent: 'development',
          confidence: 0.9,
          entities: ['React', 'TypeScript', 'Node.js'],
          concepts: ['component', 'interface', 'module']
        },
        code: {
          relevantFiles: [
            { path: '/src/component.tsx', relevance: 0.9, summary: 'Main component' },
            { path: '/src/types.ts', relevance: 0.8, summary: 'Type definitions' }
          ],
          relevantFunctions: [
            { name: 'createComponent', filePath: '/src/component.tsx', relevance: 0.9 },
            { name: 'validateProps', filePath: '/src/types.ts', relevance: 0.8 }
          ],
          relatedPatterns: [
            { pattern: 'factory', description: 'Factory pattern', examples: [] }
          ]
        },
        conversation: {
          topicProgression: ['React', 'TypeScript'],
          userGoals: ['build component', 'add types'],
          contextContinuity: ['discussion about components']
        },
        operational: {
          recentActions: ['read file', 'edit component'],
          errorContext: [],
          workflowSuggestions: ['add tests', 'optimize']
        }
      };

      const lowScoreContext: ExtractedContext = {
        semantic: {
          intent: 'general',
          confidence: 0.3,
          entities: [],
          concepts: []
        },
        code: {
          relevantFiles: [],
          relevantFunctions: [],
          relatedPatterns: []
        },
        conversation: {
          topicProgression: [],
          userGoals: [],
          contextContinuity: []
        },
        operational: {
          recentActions: [],
          errorContext: [],
          workflowSuggestions: []
        }
      };

      const query: ContextQuery = { userInput: 'test', conversationHistory: [] };

      const highScore = (extractor as any).calculateContextScore(highScoreContext, query);
      const lowScore = (extractor as any).calculateContextScore(lowScoreContext, query);

      expect(highScore).toBeGreaterThan(lowScore);
      expect(highScore).toBeGreaterThan(1.0);
      expect(lowScore).toBeLessThan(0.5);
    });
  });

  describe('error handling in combination', () => {
    it('should handle malformed context objects', async () => {
      const invalidContext = {
        semantic: null,
        code: undefined,
        conversation: {},
        operational: {}
      } as any;

      const validContext = createMockExtractedContext('general', 0.5);

      await expect((extractor as any).combineWeighted(invalidContext, validContext))
        .resolves.toBeDefined();
    });

    it('should handle empty arrays in combination', async () => {
      const emptyContext: ExtractedContext = {
        semantic: {
          intent: 'general',
          confidence: 0.5,
          entities: [],
          concepts: []
        },
        code: {
          relevantFiles: [],
          relevantFunctions: [],
          relatedPatterns: []
        },
        conversation: {
          topicProgression: [],
          userGoals: [],
          contextContinuity: []
        },
        operational: {
          recentActions: [],
          errorContext: [],
          workflowSuggestions: []
        }
      };

      const result = await (extractor as any).combineWeighted(emptyContext, emptyContext);

      expect(result.semantic.entities).toHaveLength(0);
      expect(result.code.relevantFiles).toHaveLength(0);
    });
  });
});
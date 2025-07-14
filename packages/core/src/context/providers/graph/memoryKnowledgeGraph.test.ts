/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryKnowledgeGraphProvider } from './memoryKnowledgeGraph.js';
import { KnowledgeNode } from '../../interfaces/contextProviders.js';

describe('MemoryKnowledgeGraphProvider', () => {
  let provider: MemoryKnowledgeGraphProvider;

  beforeEach(async () => {
    provider = new MemoryKnowledgeGraphProvider({
      maxNodes: 100,
      indexByType: true,
      enableLRU: true
    });
    await provider.initialize();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const newProvider = new MemoryKnowledgeGraphProvider();
      await expect(newProvider.initialize()).resolves.not.toThrow();
    });
  });

  describe('upsertNode', () => {
    it('should add new node successfully', async () => {
      const node: KnowledgeNode = {
        id: 'test-node-1',
        type: 'function',
        name: 'testFunction',
        content: 'A test function that does something useful',
        metadata: {
          filePath: '/src/test.ts',
          lineStart: 10,
          lineEnd: 20
        },
        relationships: []
      };

      await provider.upsertNode(node);

      const retrievedNode = await provider.getNode('test-node-1');
      expect(retrievedNode).toEqual(node);
    });

    it('should update existing node', async () => {
      const originalNode: KnowledgeNode = {
        id: 'test-node-1',
        type: 'function',
        name: 'originalName',
        content: 'Original content',
        metadata: {},
        relationships: []
      };

      const updatedNode: KnowledgeNode = {
        id: 'test-node-1',
        type: 'function',
        name: 'updatedName',
        content: 'Updated content',
        metadata: { updated: true },
        relationships: []
      };

      await provider.upsertNode(originalNode);
      await provider.upsertNode(updatedNode);

      const retrievedNode = await provider.getNode('test-node-1');
      expect(retrievedNode?.name).toBe('updatedName');
      expect(retrievedNode?.content).toBe('Updated content');
    });

    it('should handle nodes with relationships', async () => {
      const node1: KnowledgeNode = {
        id: 'node-1',
        type: 'class',
        name: 'TestClass',
        content: 'A test class',
        metadata: {},
        relationships: [
          { targetId: 'node-2', type: 'contains', weight: 1.0 }
        ]
      };

      const node2: KnowledgeNode = {
        id: 'node-2',
        type: 'function',
        name: 'testMethod',
        content: 'A test method',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(node1);
      await provider.upsertNode(node2);

      const retrievedNode = await provider.getNode('node-1');
      expect(retrievedNode?.relationships).toHaveLength(1);
      expect(retrievedNode?.relationships[0].targetId).toBe('node-2');
    });

    it('should enforce max nodes limit with LRU eviction', async () => {
      const smallProvider = new MemoryKnowledgeGraphProvider({
        maxNodes: 3,
        enableLRU: true
      });
      await smallProvider.initialize();

      // Add 4 nodes to exceed limit
      for (let i = 1; i <= 4; i++) {
        const node: KnowledgeNode = {
          id: `node-${i}`,
          type: 'concept',
          name: `Node ${i}`,
          content: `Content for node ${i}`,
          metadata: {},
          relationships: []
        };
        await smallProvider.upsertNode(node);
      }

      const stats = await smallProvider.getStatistics();
      expect(stats.totalNodes).toBe(3);

      // First node should be evicted
      const firstNode = await smallProvider.getNode('node-1');
      expect(firstNode).toBeNull();

      // Last node should still exist
      const lastNode = await smallProvider.getNode('node-4');
      expect(lastNode).not.toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Set up test data
      const nodes: KnowledgeNode[] = [
        {
          id: 'file-1',
          type: 'file',
          name: 'userService.ts',
          content: 'User service implementation',
          metadata: { filePath: '/src/services/userService.ts' },
          relationships: [{ targetId: 'func-1', type: 'contains' }]
        },
        {
          id: 'func-1',
          type: 'function',
          name: 'createUser',
          content: 'Creates a new user in the system',
          metadata: { filePath: '/src/services/userService.ts', lineStart: 10 },
          relationships: [{ targetId: 'func-2', type: 'calls' }]
        },
        {
          id: 'func-2',
          type: 'function',
          name: 'validateUser',
          content: 'Validates user input data',
          metadata: { filePath: '/src/utils/validation.ts', lineStart: 5 },
          relationships: []
        },
        {
          id: 'class-1',
          type: 'class',
          name: 'UserController',
          content: 'Handles user-related HTTP requests',
          metadata: { filePath: '/src/controllers/userController.ts' },
          relationships: [{ targetId: 'func-1', type: 'references' }]
        }
      ];

      for (const node of nodes) {
        await provider.upsertNode(node);
      }
    });

    it('should query all nodes without filters', async () => {
      const result = await provider.query({});

      expect(result.nodes).toHaveLength(4);
      expect(result.totalCount).toBe(4);
      expect(result.queryTime).toBeGreaterThan(0);
    });

    it('should filter by node types', async () => {
      const result = await provider.query({
        nodeTypes: ['function']
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.every(n => n.type === 'function')).toBe(true);
    });

    it('should filter by search term', async () => {
      const result = await provider.query({
        searchTerm: 'user'
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes.every(n => 
        n.name.toLowerCase().includes('user') || 
        n.content.toLowerCase().includes('user')
      )).toBe(true);
    });

    it('should apply custom filters', async () => {
      const result = await provider.query({
        filters: { filePath: '/src/services/userService.ts' }
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes.every(n => n.metadata.filePath === '/src/services/userService.ts')).toBe(true);
    });

    it('should respect maxResults parameter', async () => {
      const result = await provider.query({
        maxResults: 2
      });

      expect(result.nodes).toHaveLength(2);
    });

    it('should include relationships when requested', async () => {
      const result = await provider.query({
        nodeTypes: ['file'],
        includeNeighbors: true
      });

      expect(result.relationships.length).toBeGreaterThan(0);
      expect(result.relationships[0]).toHaveProperty('sourceId');
      expect(result.relationships[0]).toHaveProperty('targetId');
      expect(result.relationships[0]).toHaveProperty('type');
    });

    it('should combine multiple filters', async () => {
      const result = await provider.query({
        nodeTypes: ['function'],
        searchTerm: 'user',
        maxResults: 1
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('function');
      expect(
        result.nodes[0].name.toLowerCase().includes('user') ||
        result.nodes[0].content.toLowerCase().includes('user')
      ).toBe(true);
    });
  });

  describe('getNode', () => {
    it('should retrieve existing node', async () => {
      const node: KnowledgeNode = {
        id: 'test-node',
        type: 'concept',
        name: 'TestConcept',
        content: 'A test concept',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(node);
      const retrieved = await provider.getNode('test-node');

      expect(retrieved).toEqual(node);
    });

    it('should return null for non-existent node', async () => {
      const retrieved = await provider.getNode('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update LRU access order', async () => {
      const node: KnowledgeNode = {
        id: 'test-node',
        type: 'concept',
        name: 'TestConcept',
        content: 'A test concept',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(node);
      
      // Access the node multiple times
      await provider.getNode('test-node');
      await provider.getNode('test-node');

      // Node should still be accessible
      const retrieved = await provider.getNode('test-node');
      expect(retrieved).not.toBeNull();
    });
  });

  describe('getNeighbors', () => {
    beforeEach(async () => {
      // Create a small graph: A -> B -> C
      const nodeA: KnowledgeNode = {
        id: 'node-a',
        type: 'class',
        name: 'NodeA',
        content: 'Node A content',
        metadata: {},
        relationships: [{ targetId: 'node-b', type: 'references' }]
      };

      const nodeB: KnowledgeNode = {
        id: 'node-b',
        type: 'function',
        name: 'NodeB',
        content: 'Node B content',
        metadata: {},
        relationships: [{ targetId: 'node-c', type: 'calls' }]
      };

      const nodeC: KnowledgeNode = {
        id: 'node-c',
        type: 'module',
        name: 'NodeC',
        content: 'Node C content',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(nodeA);
      await provider.upsertNode(nodeB);
      await provider.upsertNode(nodeC);
    });

    it('should get immediate neighbors (depth 1)', async () => {
      const neighbors = await provider.getNeighbors('node-a', 1);

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('node-b');
    });

    it('should get neighbors at depth 2', async () => {
      const neighbors = await provider.getNeighbors('node-a', 2);

      expect(neighbors).toHaveLength(2);
      expect(neighbors.some(n => n.id === 'node-b')).toBe(true);
      expect(neighbors.some(n => n.id === 'node-c')).toBe(true);
    });

    it('should handle non-existent nodes', async () => {
      const neighbors = await provider.getNeighbors('non-existent');
      expect(neighbors).toHaveLength(0);
    });

    it('should handle nodes with no relationships', async () => {
      const neighbors = await provider.getNeighbors('node-c');
      expect(neighbors).toHaveLength(0);
    });
  });

  describe('removeNode', () => {
    beforeEach(async () => {
      const nodes: KnowledgeNode[] = [
        {
          id: 'node-1',
          type: 'class',
          name: 'TestClass',
          content: 'A test class',
          metadata: {},
          relationships: [{ targetId: 'node-2', type: 'contains' }]
        },
        {
          id: 'node-2',
          type: 'function',
          name: 'TestFunction',
          content: 'A test function',
          metadata: {},
          relationships: [{ targetId: 'node-1', type: 'belongs_to' }]
        }
      ];

      for (const node of nodes) {
        await provider.upsertNode(node);
      }
    });

    it('should remove node successfully', async () => {
      await provider.removeNode('node-1');

      const retrievedNode = await provider.getNode('node-1');
      expect(retrievedNode).toBeNull();

      const stats = await provider.getStatistics();
      expect(stats.totalNodes).toBe(1);
    });

    it('should remove relationships to deleted node', async () => {
      await provider.removeNode('node-1');

      const remainingNode = await provider.getNode('node-2');
      expect(remainingNode?.relationships).toHaveLength(0);
    });

    it('should handle removing non-existent node', async () => {
      await expect(provider.removeNode('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      const nodes: KnowledgeNode[] = [
        {
          id: 'file-1',
          type: 'file',
          name: 'test.ts',
          content: 'Test file',
          metadata: {},
          relationships: [{ targetId: 'func-1', type: 'contains' }]
        },
        {
          id: 'func-1',
          type: 'function',
          name: 'testFunc',
          content: 'Test function',
          metadata: {},
          relationships: []
        },
        {
          id: 'class-1',
          type: 'class',
          name: 'TestClass',
          content: 'Test class',
          metadata: {},
          relationships: []
        }
      ];

      for (const node of nodes) {
        await provider.upsertNode(node);
      }
    });

    it('should return correct statistics', async () => {
      const stats = await provider.getStatistics();

      expect(stats.totalNodes).toBe(3);
      expect(stats.totalRelationships).toBe(1);
      expect(stats.nodeTypeDistribution).toEqual({
        file: 1,
        function: 1,
        class: 1
      });
      expect(stats.lastUpdated).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should clear all data', async () => {
      const node: KnowledgeNode = {
        id: 'test-node',
        type: 'concept',
        name: 'TestConcept',
        content: 'Test content',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(node);
      await provider.dispose();

      const stats = await provider.getStatistics();
      expect(stats.totalNodes).toBe(0);

      const memoryStats = provider.getMemoryStats();
      expect(memoryStats.nodeCount).toBe(0);
      expect(memoryStats.typeIndexSize).toBe(0);
      expect(memoryStats.accessOrderSize).toBe(0);
    });
  });

  describe('memory management', () => {
    it('should track memory statistics', () => {
      const stats = provider.getMemoryStats();

      expect(stats).toHaveProperty('nodeCount');
      expect(stats).toHaveProperty('typeIndexSize');
      expect(stats).toHaveProperty('accessOrderSize');
      expect(stats).toHaveProperty('maxNodes');
    });

    it('should clear all data with clear method', async () => {
      const node: KnowledgeNode = {
        id: 'test-node',
        type: 'concept',
        name: 'TestConcept',
        content: 'Test content',
        metadata: {},
        relationships: []
      };

      await provider.upsertNode(node);
      await provider.clear();

      const stats = provider.getMemoryStats();
      expect(stats.nodeCount).toBe(0);
    });
  });

  describe('type indexing', () => {
    beforeEach(async () => {
      const nodes: KnowledgeNode[] = [
        { id: 'f1', type: 'file', name: 'File1', content: '', metadata: {}, relationships: [] },
        { id: 'f2', type: 'file', name: 'File2', content: '', metadata: {}, relationships: [] },
        { id: 'fn1', type: 'function', name: 'Func1', content: '', metadata: {}, relationships: [] },
        { id: 'c1', type: 'class', name: 'Class1', content: '', metadata: {}, relationships: [] }
      ];

      for (const node of nodes) {
        await provider.upsertNode(node);
      }
    });

    it('should efficiently query by type when indexing is enabled', async () => {
      const result = await provider.query({
        nodeTypes: ['file']
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.every(n => n.type === 'file')).toBe(true);
      expect(result.queryTime).toBeLessThan(100); // Should be fast with indexing
    });

    it('should handle queries for multiple types', async () => {
      const result = await provider.query({
        nodeTypes: ['file', 'function']
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes.every(n => n.type === 'file' || n.type === 'function')).toBe(true);
    });
  });
});
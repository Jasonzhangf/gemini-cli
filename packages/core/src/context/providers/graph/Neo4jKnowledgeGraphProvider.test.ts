/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';
import { Neo4jKnowledgeGraphProvider, Neo4jConfig } from './Neo4jKnowledgeGraphProvider.js';
import { KnowledgeNode, KnowledgeRelationship, GraphQuery } from '../interfaces/knowledgeGraphProvider.js';

// Mock neo4j-driver
const mockDriver = {
  verifyConnectivity: vi.fn().mockResolvedValue(undefined),
  session: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined)
};

const mockSession = {
  run: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined)
};

const mockRecord = {
  get: vi.fn(),
  toObject: vi.fn()
};

const mockResult = {
  records: [mockRecord]
};

vi.mock('neo4j-driver', () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: {
      basic: vi.fn()
    }
  }
}));

// 修复beforeEach中的mock设置
vi.mocked(mockDriver.verifyConnectivity).mockResolvedValue(undefined);

describe('Neo4jKnowledgeGraphProvider', () => {
  let provider: Neo4jKnowledgeGraphProvider;
  let config: Neo4jConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'password',
      database: 'neo4j',
      enableDebug: false
    };

    // 重置所有mock
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    mockDriver.session.mockReturnValue(mockSession);
    mockSession.run.mockResolvedValue(mockResult);
    mockRecord.get.mockReturnValue({ toNumber: () => 1 });

    provider = new Neo4jKnowledgeGraphProvider(config);
  });

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('应该成功初始化连接', async () => {
      await provider.initialize();
      
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
      expect(mockDriver.session).toHaveBeenCalledWith({ database: 'neo4j' });
    });

    it('应该创建必要的索引和约束', async () => {
      await provider.initialize();
      
      // 验证索引创建查询被调用
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT node_id_unique')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX node_type_index')
      );
    });

    it('应该处理连接失败', async () => {
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection failed'));
      
      await expect(provider.initialize()).rejects.toThrow('Failed to initialize Neo4j connection');
    });
  });

  describe('node operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该插入或更新节点', async () => {
      const node: KnowledgeNode = {
        id: 'test-node-1',
        type: 'function',
        name: 'testFunction',
        content: 'function testFunction() { return true; }',
        metadata: { filePath: '/test/file.ts' }
      };

      await provider.upsertNode(node);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Node {id: $id})'),
        expect.objectContaining({
          id: 'test-node-1',
          type: 'function',
          name: 'testFunction',
          content: 'function testFunction() { return true; }',
          metadata: JSON.stringify({ filePath: '/test/file.ts' })
        })
      );
    });

    it('应该批量插入节点', async () => {
      const nodes: KnowledgeNode[] = [
        {
          id: 'node-1',
          type: 'function',
          name: 'func1',
          content: 'function func1() {}',
          metadata: {}
        },
        {
          id: 'node-2',
          type: 'class',
          name: 'Class2',
          content: 'class Class2 {}',
          metadata: {}
        }
      ];

      await provider.batchUpsertNodes(nodes);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('UNWIND $nodes as nodeData'),
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 'node-1', type: 'function' }),
            expect.objectContaining({ id: 'node-2', type: 'class' })
          ])
        })
      );
    });

    it('应该删除节点', async () => {
      await provider.deleteNode('test-node-1');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE n'),
        { id: 'test-node-1' }
      );
    });
  });

  describe('querying', () => {
    beforeEach(async () => {
      await provider.initialize();
      
      // Setup mock response for query
      const mockNodeProperties = {
        id: 'test-node',
        type: 'function',
        name: 'testFunction',
        content: 'function test() {}',
        metadata: JSON.stringify({ filePath: '/test.ts' })
      };

      mockRecord.get.mockImplementation((key: string) => {
        if (key === 'n') {
          return { properties: mockNodeProperties };
        }
        if (key === 'relationships') {
          return [];
        }
        return null;
      });
    });

    it('应该查询节点', async () => {
      const query: GraphQuery = {
        searchTerm: 'test',
        maxResults: 10,
        includeRelationships: true
      };

      const result = await provider.query(query);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]).toMatchObject({
        id: 'test-node',
        type: 'function',
        name: 'testFunction',
        content: 'function test() {}'
      });
    });

    it('应该根据类型过滤节点', async () => {
      const query: GraphQuery = {
        nodeTypes: ['function', 'class'],
        maxResults: 5,
        includeRelationships: false
      };

      await provider.query(query);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE n.type IN $nodeTypes'),
        expect.objectContaining({
          nodeTypes: ['function', 'class']
        })
      );
    });

    it('应该支持搜索词过滤', async () => {
      const query: GraphQuery = {
        searchTerm: 'testFunction',
        maxResults: 10
      };

      await provider.query(query);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('(n.name CONTAINS $searchTerm OR n.content CONTAINS $searchTerm)'),
        expect.objectContaining({
          searchTerm: 'testFunction'
        })
      );
    });

    it('应该支持元数据过滤', async () => {
      const query: GraphQuery = {
        metadata: { filePath: '/test.ts' },
        maxResults: 10
      };

      await provider.query(query);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('n.metadata CONTAINS'),
        expect.objectContaining({
          metadata_filePath: '"filePath":"/test.ts"'
        })
      );
    });
  });

  describe('relationships', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该创建节点关系', async () => {
      const node: KnowledgeNode = {
        id: 'parent-node',
        type: 'class',
        name: 'ParentClass',
        content: 'class ParentClass {}',
        metadata: {},
        relationships: [
          {
            type: 'contains',
            toId: 'child-node',
            weight: 1.0,
            metadata: { relationType: 'composition' }
          }
        ]
      };

      await provider.upsertNode(node);

      // 验证关系创建查询
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (from)-[r:RELATES_TO {type: $relType}]->(to)'),
        expect.objectContaining({
          fromId: 'parent-node',
          toId: 'child-node',
          relType: 'contains',
          weight: 1.0,
          metadata: JSON.stringify({ relationType: 'composition' })
        })
      );
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该获取数据库统计信息', async () => {
      // Mock统计查询结果
      mockSession.run
        .mockResolvedValueOnce({ records: [{ get: () => ({ toNumber: () => 100 }) }] }) // 节点数
        .mockResolvedValueOnce({ records: [{ get: () => ({ toNumber: () => 50 }) }] })  // 关系数
        .mockResolvedValueOnce({ records: [{ get: () => 'function' }, { get: () => 'class' }] }) // 节点类型
        .mockResolvedValueOnce({ records: [{ get: () => 'contains' }, { get: () => 'depends_on' }] }); // 关系类型

      const stats = await provider.getStatistics();

      expect(stats).toMatchObject({
        nodeCount: 100,
        relationshipCount: 50,
        nodeTypes: expect.arrayContaining(['function', 'class']),
        relationshipTypes: expect.arrayContaining(['contains', 'depends_on'])
      });
    });
  });

  describe('health check', () => {
    it('应该在连接正常时返回true', async () => {
      await provider.initialize();
      
      const isHealthy = await provider.healthCheck();
      
      expect(isHealthy).toBe(true);
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
    });

    it('应该在连接异常时返回false', async () => {
      await provider.initialize();
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection lost'));
      
      const isHealthy = await provider.healthCheck();
      
      expect(isHealthy).toBe(false);
    });

    it('应该在未初始化时返回false', async () => {
      const isHealthy = await provider.healthCheck();
      
      expect(isHealthy).toBe(false);
    });
  });

  describe('raw query execution', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该执行原生Cypher查询', async () => {
      const cypherQuery = 'MATCH (n:Node) WHERE n.type = $type RETURN n';
      const params = { type: 'function' };

      mockRecord.toObject.mockReturnValue({ node: { id: 'test', type: 'function' } });

      const result = await provider.executeRawQuery(cypherQuery, params);

      expect(mockSession.run).toHaveBeenCalledWith(cypherQuery, params);
      expect(result).toEqual([{ node: { id: 'test', type: 'function' } }]);
    });
  });

  describe('configuration', () => {
    it('应该使用环境变量配置', () => {
      const envConfig = {
        NEO4J_URI: 'bolt://test:7687',
        NEO4J_USERNAME: 'testuser',
        NEO4J_PASSWORD: 'testpass',
        NEO4J_DATABASE: 'testdb'
      };

      Object.assign(process.env, envConfig);

      const provider = new Neo4jKnowledgeGraphProvider();
      
      // 通过检查初始化调用来验证配置
      expect(provider).toBeDefined();
    });

    it('应该使用默认配置', () => {
      const provider = new Neo4jKnowledgeGraphProvider();
      
      expect(provider).toBeDefined();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该处理查询错误', async () => {
      mockSession.run.mockRejectedValue(new Error('Query failed'));

      const query: GraphQuery = {
        searchTerm: 'test',
        maxResults: 10
      };

      await expect(provider.query(query)).rejects.toThrow('Query failed');
    });

    it('应该处理节点更新错误', async () => {
      mockSession.run.mockRejectedValue(new Error('Update failed'));

      const node: KnowledgeNode = {
        id: 'error-node',
        type: 'test',
        name: 'ErrorNode',
        content: 'test content',
        metadata: {}
      };

      await expect(provider.upsertNode(node)).rejects.toThrow('Update failed');
    });
  });

  describe('disposal', () => {
    it('应该正确清理资源', async () => {
      await provider.initialize();
      await provider.dispose();

      expect(mockSession.close).toHaveBeenCalled();
      expect(mockDriver.close).toHaveBeenCalled();
    });

    it('应该处理清理过程中的错误', async () => {
      await provider.initialize();
      mockSession.close.mockRejectedValue(new Error('Close failed'));

      // 应该不抛出错误
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

// Neo4j driver is optional - will be loaded dynamically
// import neo4j, { Driver, Session, Result, Record } from 'neo4j-driver';
import { 
  IKnowledgeGraphProvider, 
  KnowledgeNode, 
  KnowledgeRelationship,
  GraphQuery, 
  GraphQueryResult 
} from '../../interfaces/contextProviders.js';

/**
 * Neo4j配置接口
 */
export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
  enableEncryption?: boolean;
  trustStrategy?: string;
  enableDebug?: boolean;
}

/**
 * Neo4j知识图谱提供者
 * 
 * 作为Silicon Flow的备份方案，提供企业级的图数据库支持
 * 
 * 特性：
 * - 高可用性和可扩展性
 * - 强大的Cypher查询语言
 * - 复杂关系建模和查询
 * - 自动索引和性能优化
 * - 数据持久化和备份
 */
export class Neo4jKnowledgeGraphProvider implements IKnowledgeGraphProvider {
  private driver: any | null = null;
  private session: any | null = null;
  private config: Neo4jConfig;
  private isInitialized = false;
  
  constructor(config: Partial<Neo4jConfig> = {}) {
    this.config = {
      uri: config.uri || process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: config.username || process.env.NEO4J_USERNAME || 'neo4j',
      password: config.password || process.env.NEO4J_PASSWORD || 'password',
      database: config.database || process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: config.maxConnectionPoolSize || 50,
      connectionTimeout: config.connectionTimeout || 30000,
      enableEncryption: config.enableEncryption ?? true,
      trustStrategy: config.trustStrategy || 'TRUST_ALL_CERTIFICATES',
      enableDebug: config.enableDebug ?? false
    };
    
    if (this.config.enableDebug) {
      console.log('[Neo4jKnowledgeGraphProvider] 初始化配置:', {
        uri: this.config.uri,
        username: this.config.username,
        database: this.config.database
      });
    }
  }

  /**
   * 初始化Neo4j连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 动态加载Neo4j驱动程序
      const neo4j = await import('neo4j-driver');
      
      // 创建驱动程序
      this.driver = neo4j.default.driver(
        this.config.uri,
        neo4j.default.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionTimeout: this.config.connectionTimeout,
          encrypted: this.config.enableEncryption ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
          trust: this.config.trustStrategy as any
        }
      );

      // 验证连接
      await this.driver.verifyConnectivity();
      
      // 创建会话
      this.session = this.driver.session({ 
        database: this.config.database 
      });

      // 创建必要的索引和约束
      await this.createIndexesAndConstraints();
      
      this.isInitialized = true;
      
      if (this.config.enableDebug) {
        console.log('[Neo4jKnowledgeGraphProvider] 成功连接到Neo4j数据库');
      }
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 初始化失败:', error);
      throw new Error(`Failed to initialize Neo4j connection: ${error}`);
    }
  }

  /**
   * 创建数据库索引和约束
   */
  private async createIndexesAndConstraints(): Promise<void> {
    if (!this.session) {
      throw new Error('Neo4j session not initialized');
    }

    const queries = [
      // 节点唯一性约束
      'CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE',
      
      // 节点索引
      'CREATE INDEX node_type_index IF NOT EXISTS FOR (n:Node) ON (n.type)',
      'CREATE INDEX node_name_index IF NOT EXISTS FOR (n:Node) ON (n.name)',
      'CREATE TEXT INDEX node_content_index IF NOT EXISTS FOR (n:Node) ON (n.content)',
      
      // 关系索引
      'CREATE INDEX relationship_type_index IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.type)',
      'CREATE INDEX relationship_weight_index IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.weight)',
      
      // 复合索引用于性能优化
      'CREATE INDEX node_type_name_index IF NOT EXISTS FOR (n:Node) ON (n.type, n.name)'
    ];

    for (const query of queries) {
      try {
        await this.session.run(query);
        if (this.config.enableDebug) {
          console.log(`[Neo4jKnowledgeGraphProvider] 执行索引创建: ${query}`);
        }
      } catch (error) {
        // 索引可能已存在，忽略错误
        if (this.config.enableDebug) {
          console.warn(`[Neo4jKnowledgeGraphProvider] 索引创建警告: ${error}`);
        }
      }
    }
  }

  /**
   * 检查连接状态
   */
  private ensureConnection(): void {
    if (!this.isInitialized || !this.session) {
      throw new Error('Neo4j provider not initialized. Call initialize() first.');
    }
  }

  /**
   * 插入或更新节点
   */
  async upsertNode(node: KnowledgeNode): Promise<void> {
    this.ensureConnection();

    const query = `
      MERGE (n:Node {id: $id})
      SET n.type = $type,
          n.name = $name,
          n.content = $content,
          n.metadata = $metadata,
          n.lastUpdated = datetime()
      RETURN n.id as id
    `;

    const params = {
      id: node.id,
      type: node.type,
      name: node.name,
      content: node.content || '',
      metadata: JSON.stringify(node.metadata || {})
    };

    try {
      const result = await this.session!.run(query, params);
      
      if (this.config.enableDebug) {
        console.log(`[Neo4jKnowledgeGraphProvider] 节点已更新: ${node.id}`);
      }
      
      // 处理节点关系
      if (node.relationships && node.relationships.length > 0) {
        await this.updateNodeRelationships(node.id, node.relationships);
      }
    } catch (error) {
      console.error(`[Neo4jKnowledgeGraphProvider] 节点更新失败 ${node.id}:`, error);
      throw error;
    }
  }

  /**
   * 批量插入或更新节点
   */
  async batchUpsertNodes(nodes: KnowledgeNode[]): Promise<void> {
    this.ensureConnection();

    if (nodes.length === 0) {
      return;
    }

    const query = `
      UNWIND $nodes as nodeData
      MERGE (n:Node {id: nodeData.id})
      SET n.type = nodeData.type,
          n.name = nodeData.name,
          n.content = nodeData.content,
          n.metadata = nodeData.metadata,
          n.lastUpdated = datetime()
      RETURN count(n) as updatedCount
    `;

    const params = {
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.type,
        name: node.name,
        content: node.content || '',
        metadata: JSON.stringify(node.metadata || {})
      }))
    };

    try {
      const result = await this.session!.run(query, params);
      const count = result.records[0]?.get('updatedCount')?.toNumber() || 0;
      
      if (this.config.enableDebug) {
        console.log(`[Neo4jKnowledgeGraphProvider] 批量更新节点: ${count}个`);
      }

      // 批量处理关系
      for (const node of nodes) {
        if (node.relationships && node.relationships.length > 0) {
          await this.updateNodeRelationships(node.id, node.relationships);
        }
      }
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 批量节点更新失败:', error);
      throw error;
    }
  }

  /**
   * 更新节点关系
   */
  private async updateNodeRelationships(nodeId: string, relationships: KnowledgeRelationship[]): Promise<void> {
    for (const rel of relationships) {
      const query = `
        MATCH (from:Node {id: $fromId})
        MATCH (to:Node {id: $toId})
        MERGE (from)-[r:RELATES_TO {type: $relType}]->(to)
        SET r.weight = $weight,
            r.metadata = $metadata,
            r.lastUpdated = datetime()
        RETURN r
      `;

      const params = {
        fromId: nodeId,
        toId: rel.toId,
        relType: rel.type,
        weight: rel.weight || 1.0,
        metadata: JSON.stringify(rel.metadata || {})
      };

      try {
        await this.session!.run(query, params);
      } catch (error) {
        console.error(`[Neo4jKnowledgeGraphProvider] 关系更新失败 ${nodeId}->${rel.toId}:`, error);
        // 继续处理其他关系，不中断整个过程
      }
    }
  }

  /**
   * 删除节点
   */
  async removeNode(nodeId: string): Promise<void> {
    this.ensureConnection();

    const query = `
      MATCH (n:Node {id: $id})
      DETACH DELETE n
      RETURN count(n) as deletedCount
    `;

    try {
      const result = await this.session!.run(query, { id: nodeId });
      const count = result.records[0]?.get('deletedCount')?.toNumber() || 0;
      
      if (this.config.enableDebug) {
        console.log(`[Neo4jKnowledgeGraphProvider] 节点已删除: ${nodeId}, 数量: ${count}`);
      }
    } catch (error) {
      console.error(`[Neo4jKnowledgeGraphProvider] 节点删除失败 ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * 查询图数据
   */
  async query(searchTerm: string, options?: { maxResults?: number }): Promise<KnowledgeNode[]>;
  async query(query: GraphQuery): Promise<GraphQueryResult>;
  async query(queryOrSearchTerm: GraphQuery | string, options?: { maxResults?: number }): Promise<GraphQueryResult | KnowledgeNode[]> {
    // Handle string search term overload
    if (typeof queryOrSearchTerm === 'string') {
      const graphQuery: GraphQuery = {
        searchTerm: queryOrSearchTerm,
        maxResults: options?.maxResults
      };
      const result = await this.query(graphQuery);
      return result.nodes;
    }
    
    // Handle GraphQuery overload
    const query = queryOrSearchTerm;
    this.ensureConnection();

    let cypherQuery = 'MATCH (n:Node)';
    const params: Record<string, any> = {};
    const conditions: string[] = [];

    // 构建查询条件
    if (query.nodeTypes && query.nodeTypes.length > 0) {
      conditions.push('n.type IN $nodeTypes');
      params.nodeTypes = query.nodeTypes;
    }

    if (query.searchTerm) {
      conditions.push('(n.name CONTAINS $searchTerm OR n.content CONTAINS $searchTerm)');
      params.searchTerm = query.searchTerm;
    }

    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        const paramKey = `filter_${key}`;
        conditions.push(`n.${key} = $${paramKey}`);
        params[paramKey] = value;
      }
    }

    // 添加WHERE条件
    if (conditions.length > 0) {
      cypherQuery += ' WHERE ' + conditions.join(' AND ');
    }

    // 添加关系查询
    if (query.includeNeighbors) {
      cypherQuery += ' OPTIONAL MATCH (n)-[r:RELATES_TO]-(related:Node)';
      cypherQuery += ' RETURN n, collect({relationship: r, node: related}) as relationships';
    } else {
      cypherQuery += ' RETURN n, [] as relationships';
    }

    // 添加排序和限制
    if (query.orderBy) {
      cypherQuery += ` ORDER BY n.${query.orderBy}`;
      if (query.orderDirection === 'DESC') {
        cypherQuery += ' DESC';
      }
    }

    if (query.maxResults) {
      cypherQuery += ' LIMIT $maxResults';
      params.maxResults = query.maxResults;
    }

    try {
      const result = await this.session!.run(cypherQuery, params);
      return this.processQueryResult(result);
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 查询执行失败:', error);
      throw error;
    }
  }

  /**
   * 处理查询结果
   */
  private processQueryResult(result: any): GraphQueryResult {
    const nodes: KnowledgeNode[] = [];
    const relationships: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      weight?: number;
    }> = [];

    for (const record of result.records as any[]) {
      const nodeRecord = record.get('n');
      const relationshipData = record.get('relationships') || [];

      // 处理节点
      if (nodeRecord) {
        const node: KnowledgeNode = {
          id: nodeRecord.properties.id,
          type: nodeRecord.properties.type,
          name: nodeRecord.properties.name,
          content: nodeRecord.properties.content || '',
          metadata: nodeRecord.properties.metadata ? 
            JSON.parse(nodeRecord.properties.metadata) : {},
          relationships: []
        };

        // 处理关系
        for (const relData of relationshipData) {
          if (relData.relationship && relData.node) {
            const relationship: KnowledgeRelationship = {
              type: relData.relationship.properties.type,
              toId: relData.node.properties.id,
              targetId: relData.node.properties.id,
              weight: relData.relationship.properties.weight || 1.0,
              metadata: relData.relationship.properties.metadata ? 
                JSON.parse(relData.relationship.properties.metadata) : {}
            };

            node.relationships!.push(relationship);
            relationships.push({
              sourceId: node.id,
              targetId: relationship.toId,
              type: relationship.type,
              weight: relationship.weight
            });
          }
        }

        nodes.push(node);
      }
    }

    if (this.config.enableDebug) {
      console.log(`[Neo4jKnowledgeGraphProvider] 查询返回: ${nodes.length}个节点, ${relationships.length}个关系`);
    }

    return {
      nodes,
      relationships,
      totalCount: nodes.length
    };
  }

  /**
   * 执行原生Cypher查询
   */
  async executeRawQuery(cypherQuery: string, params: Record<string, any> = {}): Promise<any[]> {
    this.ensureConnection();

    try {
      const result = await this.session!.run(cypherQuery, params);
      return result.records.map((record: any) => record.toObject());
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 原生查询执行失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{
    totalNodes: number;
    totalRelationships: number;
    nodeTypeDistribution: Record<string, number>;
    lastUpdated: string;
  }> {
    this.ensureConnection();

    try {
      // 获取节点数量
      const nodeCountResult = await this.session!.run('MATCH (n:Node) RETURN count(n) as count');
      const nodeCount = nodeCountResult.records[0]?.get('count')?.toNumber() || 0;

      // 获取关系数量
      const relCountResult = await this.session!.run('MATCH ()-[r:RELATES_TO]-() RETURN count(r) as count');
      const relationshipCount = relCountResult.records[0]?.get('count')?.toNumber() || 0;

      // 获取节点类型
      const nodeTypesResult = await this.session!.run('MATCH (n:Node) RETURN DISTINCT n.type as type');
      const nodeTypes = nodeTypesResult.records.map((r: any) => r.get('type')).filter(Boolean);

      // 获取关系类型
      const relTypesResult = await this.session!.run('MATCH ()-[r:RELATES_TO]-() RETURN DISTINCT r.type as type');
      const relationshipTypes = relTypesResult.records.map((r: any) => r.get('type')).filter(Boolean);

      const nodeTypeDistribution: Record<string, number> = {};
      nodeTypes.forEach((type: string) => {
        nodeTypeDistribution[type] = 0; // 这里可以进一步优化来获取实际计数
      });

      return {
        totalNodes: nodeCount,
        totalRelationships: relationshipCount,
        nodeTypeDistribution: nodeTypeDistribution as Record<string, number>,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 统计信息获取失败:', error);
      const emptyDistribution: Record<string, number> = {};
      return {
        totalNodes: 0,
        totalRelationships: 0,
        nodeTypeDistribution: emptyDistribution,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * 查询图数据（完整结果）
   */
  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    return this.query(query);
  }

  /**
   * 获取特定节点
   */
  async getNode(nodeId: string): Promise<KnowledgeNode | null> {
    this.ensureConnection();
    
    const query = `
      MATCH (n:Node {id: $id})
      OPTIONAL MATCH (n)-[r:RELATES_TO]-(related:Node)
      RETURN n, collect({relationship: r, node: related}) as relationships
    `;
    
    try {
      const result = await this.session!.run(query, { id: nodeId });
      if (result.records.length === 0) {
        return null;
      }
      
      const record = result.records[0];
      const nodeRecord = record.get('n');
      const relationshipData = record.get('relationships') || [];
      
      const node: KnowledgeNode = {
        id: nodeRecord.properties.id,
        type: nodeRecord.properties.type,
        name: nodeRecord.properties.name,
        content: nodeRecord.properties.content || '',
        metadata: nodeRecord.properties.metadata ? 
          JSON.parse(nodeRecord.properties.metadata) : {},
        relationships: []
      };
      
      // 处理关系
      for (const relData of relationshipData) {
        if (relData.relationship && relData.node) {
          const relationship: KnowledgeRelationship = {
            type: relData.relationship.properties.type,
            toId: relData.node.properties.id,
            targetId: relData.node.properties.id,
            weight: relData.relationship.properties.weight || 1.0,
            metadata: relData.relationship.properties.metadata ?
              JSON.parse(relData.relationship.properties.metadata) : {}
          };
          node.relationships.push(relationship);
        }
      }
      
      return node;
    } catch (error) {
      console.error(`[Neo4jKnowledgeGraphProvider] 获取节点失败 ${nodeId}:`, error);
      return null;
    }
  }

  /**
   * 获取节点的邻居
   */
  async getNeighbors(nodeId: string, maxDepth: number = 1): Promise<KnowledgeNode[]> {
    this.ensureConnection();
    
    const query = `
      MATCH (start:Node {id: $id})
      MATCH (start)-[r:RELATES_TO*1..${maxDepth}]-(neighbor:Node)
      RETURN DISTINCT neighbor
      LIMIT 100
    `;
    
    try {
      const result = await this.session!.run(query, { id: nodeId });
      const neighbors: KnowledgeNode[] = [];
      
      for (const record of result.records as any[]) {
        const neighborRecord = record.get('neighbor');
        const neighbor: KnowledgeNode = {
          id: neighborRecord.properties.id,
          type: neighborRecord.properties.type,
          name: neighborRecord.properties.name,
          content: neighborRecord.properties.content || '',
          metadata: neighborRecord.properties.metadata ?
            JSON.parse(neighborRecord.properties.metadata) : {},
          relationships: []
        };
        neighbors.push(neighbor);
      }
      
      return neighbors;
    } catch (error) {
      console.error(`[Neo4jKnowledgeGraphProvider] 获取邻居失败 ${nodeId}:`, error);
      return [];
    }
  }

  /**
   * 查找相关节点
   */
  async findRelatedNodes(pathOrId: string, maxDepth: number = 2): Promise<any[]> {
    this.ensureConnection();
    
    const query = `
      MATCH (start:Node {id: $pathOrId})
      MATCH (start)-[r:RELATES_TO*1..${maxDepth}]-(related:Node)
      RETURN DISTINCT related
      LIMIT 50
    `;
    
    try {
      const result = await this.session!.run(query, { pathOrId });
      const relatedNodes: any[] = [];
      
      for (const record of result.records as any[]) {
        const relatedRecord = record.get('related');
        const relatedNode = {
          id: relatedRecord.properties.id,
          name: relatedRecord.properties.name,
          content: relatedRecord.properties.content || '',
          metadata: relatedRecord.properties.metadata ?
            JSON.parse(relatedRecord.properties.metadata) : {}
        };
        relatedNodes.push(relatedNode);
      }
      
      return relatedNodes;
    } catch (error) {
      console.error(`[Neo4jKnowledgeGraphProvider] 查找相关节点失败 ${pathOrId}:`, error);
      return [];
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.driver) {
        return false;
      }

      await this.driver.verifyConnectivity();
      
      // 执行简单查询验证
      if (this.session) {
        await this.session.run('RETURN 1 as test');
      }
      
      return true;
    } catch (error) {
      if (this.config.enableDebug) {
        console.error('[Neo4jKnowledgeGraphProvider] 健康检查失败:', error);
      }
      return false;
    }
  }

  /**
   * 清理和关闭连接
   */
  async dispose(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }

      this.isInitialized = false;
      
      if (this.config.enableDebug) {
        console.log('[Neo4jKnowledgeGraphProvider] 连接已关闭');
      }
    } catch (error) {
      console.error('[Neo4jKnowledgeGraphProvider] 连接关闭失败:', error);
    }
  }
}
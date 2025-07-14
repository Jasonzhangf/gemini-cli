/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IKnowledgeGraphProvider, 
  KnowledgeNode, 
  GraphQuery, 
  GraphQueryResult 
} from '../../interfaces/contextProviders.js';

interface MemoryGraphConfig {
  maxNodes?: number;
  indexByType?: boolean;
  enableLRU?: boolean;
}

/**
 * In-memory knowledge graph provider
 * Fast but non-persistent storage for small to medium projects
 */
export class MemoryKnowledgeGraphProvider implements IKnowledgeGraphProvider {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private nodesByType: Map<string, Set<string>> = new Map();
  private accessOrder: Map<string, number> = new Map();
  private config: MemoryGraphConfig;
  private accessCounter = 0;

  constructor(config: MemoryGraphConfig = {}) {
    this.config = {
      maxNodes: 1000,
      indexByType: true,
      enableLRU: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    // Memory provider is ready immediately
  }

  async query(query: GraphQuery): Promise<GraphQueryResult> {
    const startTime = Date.now();
    const results: KnowledgeNode[] = [];
    const relationships: Array<{ sourceId: string; targetId: string; type: string; weight?: number }> = [];

    // Use type index for faster queries if available
    let candidateIds: Iterable<string>;
    if (query.nodeTypes && this.config.indexByType) {
      candidateIds = this.getCandidatesByType(query.nodeTypes);
    } else {
      candidateIds = this.nodes.keys();
    }

    // Filter candidates
    for (const nodeId of candidateIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // Track access for LRU
      if (this.config.enableLRU) {
        this.accessOrder.set(nodeId, this.accessCounter++);
      }

      let matches = true;

      // Filter by search term
      if (query.searchTerm && matches) {
        const searchLower = query.searchTerm.toLowerCase();
        matches = node.name.toLowerCase().includes(searchLower) ||
                 (node.content && node.content.toLowerCase().includes(searchLower));
      }

      // Apply custom filters
      if (query.filters && matches) {
        for (const [key, value] of Object.entries(query.filters)) {
          if (node.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        results.push(node);

        // Include relationships if requested
        if (query.includeNeighbors) {
          for (const rel of node.relationships) {
            relationships.push({
              sourceId: nodeId,
              targetId: rel.targetId,
              type: rel.type,
              weight: rel.weight
            });
          }
        }
      }

      // Limit results
      if (query.maxResults && results.length >= query.maxResults) {
        break;
      }
    }

    return {
      nodes: results,
      relationships,
      totalCount: results.length,
      queryTime: Date.now() - startTime
    };
  }

  async getNode(nodeId: string): Promise<KnowledgeNode | null> {
    const node = this.nodes.get(nodeId);
    if (node && this.config.enableLRU) {
      this.accessOrder.set(nodeId, this.accessCounter++);
    }
    return node || null;
  }

  async getNeighbors(nodeId: string, maxDepth: number = 1): Promise<KnowledgeNode[]> {
    const visited = new Set<string>();
    const neighbors: KnowledgeNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth >= maxDepth) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) continue;

      // Track access for LRU
      if (this.config.enableLRU) {
        this.accessOrder.set(id, this.accessCounter++);
      }

      for (const rel of node.relationships) {
        if (!visited.has(rel.targetId)) {
          const neighborNode = this.nodes.get(rel.targetId);
          if (neighborNode) {
            neighbors.push(neighborNode);
            queue.push({ id: rel.targetId, depth: depth + 1 });
          }
        }
      }
    }

    return neighbors;
  }

  async upsertNode(node: KnowledgeNode): Promise<void> {
    // Check max nodes limit
    if (!this.nodes.has(node.id) && this.nodes.size >= this.config.maxNodes!) {
      await this.evictLeastRecentlyUsedNode();
    }

    // Remove from old type index if it exists
    if (this.config.indexByType && this.nodes.has(node.id)) {
      const oldNode = this.nodes.get(node.id)!;
      const oldTypeSet = this.nodesByType.get(oldNode.type);
      if (oldTypeSet) {
        oldTypeSet.delete(node.id);
        if (oldTypeSet.size === 0) {
          this.nodesByType.delete(oldNode.type);
        }
      }
    }

    // Update node
    this.nodes.set(node.id, node);

    // Update type index
    if (this.config.indexByType) {
      let typeSet = this.nodesByType.get(node.type);
      if (!typeSet) {
        typeSet = new Set();
        this.nodesByType.set(node.type, typeSet);
      }
      typeSet.add(node.id);
    }

    // Update access order
    if (this.config.enableLRU) {
      this.accessOrder.set(node.id, this.accessCounter++);
    }
  }

  async removeNode(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from main storage
    this.nodes.delete(nodeId);

    // Remove from type index
    if (this.config.indexByType) {
      const typeSet = this.nodesByType.get(node.type);
      if (typeSet) {
        typeSet.delete(nodeId);
        if (typeSet.size === 0) {
          this.nodesByType.delete(node.type);
        }
      }
    }

    // Remove from access order
    if (this.config.enableLRU) {
      this.accessOrder.delete(nodeId);
    }

    // Remove relationships pointing to this node
    for (const [id, otherNode] of this.nodes) {
      const filteredRels = otherNode.relationships.filter(rel => rel.targetId !== nodeId);
      if (filteredRels.length !== otherNode.relationships.length) {
        this.nodes.set(id, {
          ...otherNode,
          relationships: filteredRels
        });
      }
    }
  }

  async getStatistics(): Promise<{
    totalNodes: number;
    totalRelationships: number;
    nodeTypeDistribution: Record<string, number>;
    lastUpdated: string;
  }> {
    const nodeTypeDistribution: Record<string, number> = {};
    let totalRelationships = 0;

    for (const node of this.nodes.values()) {
      nodeTypeDistribution[node.type] = (nodeTypeDistribution[node.type] || 0) + 1;
      totalRelationships += node.relationships.length;
    }

    return {
      totalNodes: this.nodes.size,
      totalRelationships,
      nodeTypeDistribution,
      lastUpdated: new Date().toISOString()
    };
  }

  async dispose(): Promise<void> {
    this.nodes.clear();
    this.nodesByType.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  private getCandidatesByType(nodeTypes: string[]): Set<string> {
    const candidates = new Set<string>();
    
    for (const type of nodeTypes) {
      const typeSet = this.nodesByType.get(type);
      if (typeSet) {
        for (const nodeId of typeSet) {
          candidates.add(nodeId);
        }
      }
    }
    
    return candidates;
  }

  private async evictLeastRecentlyUsedNode(): Promise<void> {
    if (!this.config.enableLRU || this.accessOrder.size === 0) {
      // Fallback: remove first node
      const firstNodeId = this.nodes.keys().next().value;
      if (firstNodeId) {
        await this.removeNode(firstNodeId);
      }
      return;
    }

    // Find least recently used node
    let lruNodeId: string | null = null;
    let lruTime = Number.MAX_SAFE_INTEGER;

    for (const [nodeId, accessTime] of this.accessOrder) {
      if (accessTime < lruTime) {
        lruTime = accessTime;
        lruNodeId = nodeId;
      }
    }

    if (lruNodeId) {
      await this.removeNode(lruNodeId);
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    nodeCount: number;
    typeIndexSize: number;
    accessOrderSize: number;
    maxNodes: number;
  } {
    return {
      nodeCount: this.nodes.size,
      typeIndexSize: this.nodesByType.size,
      accessOrderSize: this.accessOrder.size,
      maxNodes: this.config.maxNodes!
    };
  }

  /**
   * Clear all data and reset counters
   */
  async clear(): Promise<void> {
    await this.dispose();
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { 
  IKnowledgeGraphProvider, 
  KnowledgeNode, 
  GraphQuery, 
  GraphQueryResult 
} from '../../interfaces/contextProviders.js';

interface LocalGraphConfig {
  persistToDisk?: boolean;
  maxNodes?: number;
  compressionEnabled?: boolean;
  storageDir?: string;
}

/**
 * Local file-based knowledge graph provider
 * Stores graph data in local files with optional persistence
 */
export class LocalKnowledgeGraphProvider implements IKnowledgeGraphProvider {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private relationships: Map<string, Array<{ targetId: string; type: string; weight?: number }>> = new Map();
  private config: LocalGraphConfig;
  private storageDir: string;
  private isInitialized = false;

  constructor(config: LocalGraphConfig = {}) {
    this.config = {
      persistToDisk: true,
      maxNodes: 10000,
      compressionEnabled: false,
      storageDir: './.gemini/knowledge-graph',
      ...config
    };
    this.storageDir = this.config.storageDir!;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.config.persistToDisk) {
      await this.ensureStorageDirectory();
      await this.loadFromDisk();
    }

    this.isInitialized = true;
  }

  async query(query: GraphQuery): Promise<GraphQueryResult> {
    const startTime = Date.now();
    const results: KnowledgeNode[] = [];
    const relationships: Array<{ sourceId: string; targetId: string; type: string; weight?: number }> = [];

    // Filter nodes based on query criteria
    for (const [nodeId, node] of this.nodes) {
      let matches = true;

      // Filter by node types
      if (query.nodeTypes && !query.nodeTypes.includes(node.type)) {
        matches = false;
      }

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
          const nodeRelationships = this.relationships.get(nodeId) || [];
          for (const rel of nodeRelationships) {
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
    return this.nodes.get(nodeId) || null;
  }

  async getNeighbors(nodeId: string, maxDepth: number = 1): Promise<KnowledgeNode[]> {
    const visited = new Set<string>();
    const neighbors: KnowledgeNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth >= maxDepth) continue;
      visited.add(id);

      const nodeRelationships = this.relationships.get(id) || [];
      for (const rel of nodeRelationships) {
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
      // Remove least recently used node
      await this.removeLeastRecentlyUsedNode();
    }

    // Update node
    this.nodes.set(node.id, node);

    // Update relationships
    this.relationships.set(node.id, node.relationships);

    // Update reverse relationships
    for (const rel of node.relationships) {
      const reverseRels = this.relationships.get(rel.targetId) || [];
      const existingRel = reverseRels.find(r => r.targetId === node.id);
      if (!existingRel) {
        reverseRels.push({
          targetId: node.id,
          type: this.getReverseRelationType(rel.type),
          weight: rel.weight
        });
        this.relationships.set(rel.targetId, reverseRels);
      }
    }

    // Persist to disk if enabled
    if (this.config.persistToDisk) {
      await this.saveToDisk();
    }
  }

  async removeNode(nodeId: string): Promise<void> {
    this.nodes.delete(nodeId);
    this.relationships.delete(nodeId);

    // Remove references from other nodes
    for (const [id, rels] of this.relationships) {
      const filtered = rels.filter(rel => rel.targetId !== nodeId);
      if (filtered.length !== rels.length) {
        this.relationships.set(id, filtered);
      }
    }

    // Persist to disk if enabled
    if (this.config.persistToDisk) {
      await this.saveToDisk();
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
    if (this.config.persistToDisk) {
      await this.saveToDisk();
    }
    this.nodes.clear();
    this.relationships.clear();
    this.isInitialized = false;
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const nodesFile = path.join(this.storageDir, 'nodes.json');
      const relationshipsFile = path.join(this.storageDir, 'relationships.json');

      // Load nodes
      try {
        const nodesData = await fs.readFile(nodesFile, 'utf-8');
        const nodesArray: KnowledgeNode[] = JSON.parse(nodesData);
        for (const node of nodesArray) {
          this.nodes.set(node.id, node);
        }
      } catch {
        // File doesn't exist or is corrupted
      }

      // Load relationships
      try {
        const relationshipsData = await fs.readFile(relationshipsFile, 'utf-8');
        const relationshipsObj = JSON.parse(relationshipsData);
        for (const [nodeId, rels] of Object.entries(relationshipsObj)) {
          this.relationships.set(nodeId, rels as any);
        }
      } catch {
        // File doesn't exist or is corrupted
      }
    } catch (error) {
      console.warn('[LocalKnowledgeGraph] Failed to load from disk:', error);
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const nodesFile = path.join(this.storageDir, 'nodes.json');
      const relationshipsFile = path.join(this.storageDir, 'relationships.json');

      // Save nodes
      const nodesArray = Array.from(this.nodes.values());
      await fs.writeFile(nodesFile, JSON.stringify(nodesArray, null, 2));

      // Save relationships
      const relationshipsObj = Object.fromEntries(this.relationships);
      await fs.writeFile(relationshipsFile, JSON.stringify(relationshipsObj, null, 2));
    } catch (error) {
      console.warn('[LocalKnowledgeGraph] Failed to save to disk:', error);
    }
  }

  private async removeLeastRecentlyUsedNode(): Promise<void> {
    let oldestNode: KnowledgeNode | null = null;
    let oldestTime = Date.now();

    for (const node of this.nodes.values()) {
      const lastUsed = node.metadata.lastUsed ? new Date(node.metadata.lastUsed).getTime() : 0;
      if (lastUsed < oldestTime) {
        oldestTime = lastUsed;
        oldestNode = node;
      }
    }

    if (oldestNode) {
      await this.removeNode(oldestNode.id);
    }
  }

  private getReverseRelationType(type: string): string {
    const reverseMap: Record<string, string> = {
      'imports': 'imported_by',
      'calls': 'called_by',
      'contains': 'contained_by',
      'references': 'referenced_by',
      'implements': 'implemented_by'
    };
    return reverseMap[type] || 'related_to';
  }
}
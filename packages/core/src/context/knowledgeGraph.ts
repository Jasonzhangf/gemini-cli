/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DirectedGraph } from 'graphology';
import { CodeNode, CodeRelation } from './staticAnalyzer.js';

export interface GraphMetadata {
  projectDir: string;
  lastUpdated: Date;
  version: string;
  totalNodes: number;
  totalEdges: number;
  fileCount: number;
  analysisTime: number;
}

export interface KnowledgeGraphData {
  metadata: GraphMetadata;
  graph: any; // Serialized graph data
}

/**
 * Knowledge Graph Storage for ContextAgent
 * Uses graphology to store and manage the project's code graph
 */
export class KnowledgeGraph {
  private graph: DirectedGraph;
  private projectDir: string;
  private graphPath: string;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
    this.graphPath = path.join(this.projectDir, '.gemini', 'context_graph.json');
    this.graph = new DirectedGraph({
      allowSelfLoops: false,
      multi: false
    });
  }

  /**
   * Initialize the knowledge graph
   */
  async initialize(): Promise<void> {
    // Ensure .gemini directory exists
    const geminiDir = path.dirname(this.graphPath);
    await fs.mkdir(geminiDir, { recursive: true });

    // Try to load existing graph
    await this.loadGraph();
  }

  /**
   * Add nodes and relations from static analysis
   */
  async addAnalysisResult(nodes: CodeNode[], relations: CodeRelation[]): Promise<void> {
    const startTime = Date.now();

    // Add all nodes
    for (const node of nodes) {
      if (!this.graph.hasNode(node.id)) {
        this.graph.addNode(node.id, {
          type: node.type,
          data: node
        });
      } else {
        // Update existing node data
        this.graph.setNodeAttribute(node.id, 'data', node);
      }
    }

    // Add all relations as edges
    for (const relation of relations) {
      // Ensure both nodes exist before adding edge
      if (!this.graph.hasNode(relation.from)) {
        console.warn(`[KnowledgeGraph] Source node not found: ${relation.from}`);
        continue;
      }
      
      if (relation.type === 'IMPORTS') {
        // For imports, the target might be an external module
        // Create a module node if it doesn't exist
        if (!this.graph.hasNode(relation.to)) {
          this.graph.addNode(relation.to, {
            type: 'module',
            data: {
              id: relation.to,
              type: 'module',
              name: relation.to,
              isExternal: !relation.to.startsWith('.')
            }
          });
        }
      } else if (!this.graph.hasNode(relation.to)) {
        console.warn(`[KnowledgeGraph] Target node not found: ${relation.to}`);
        continue;
      }

      // Add edge if it doesn't exist
      const edgeKey = `${relation.from}-${relation.type}-${relation.to}`;
      if (!this.graph.hasDirectedEdge(relation.from, relation.to)) {
        try {
          this.graph.addDirectedEdgeWithKey(edgeKey, relation.from, relation.to, {
            type: relation.type,
            data: relation
          });
        } catch (error) {
          console.warn(`[KnowledgeGraph] Failed to add edge ${edgeKey}:`, error);
        }
      } else {
        // Update existing edge data if edge exists with this key
        if (this.graph.hasEdge(edgeKey)) {
          this.graph.setEdgeAttribute(edgeKey, 'data', relation);
        }
      }
    }

    const analysisTime = Date.now() - startTime;
    console.log(`[KnowledgeGraph] Updated graph with ${nodes.length} nodes and ${relations.length} relations in ${analysisTime}ms`);
  }

  /**
   * Remove nodes and relations for a file (for incremental updates)
   */
  async removeFileNodes(filePath: string): Promise<void> {
    const fileNodeId = `file:${filePath}`;
    
    // Find all nodes belonging to this file
    const nodesToRemove: string[] = [];
    
    this.graph.forEachNode((nodeId: string, attributes: any) => {
      const nodeData = attributes.data;
      if (nodeData.filePath === filePath || nodeId === fileNodeId) {
        nodesToRemove.push(nodeId);
      }
    });

    // Remove all nodes (this will also remove connected edges)
    for (const nodeId of nodesToRemove) {
      if (this.graph.hasNode(nodeId)) {
        this.graph.dropNode(nodeId);
      }
    }

    console.log(`[KnowledgeGraph] Removed ${nodesToRemove.length} nodes for file: ${filePath}`);
  }

  /**
   * Save graph to disk
   */
  async saveGraph(): Promise<void> {
    try {
      const metadata: GraphMetadata = {
        projectDir: this.projectDir,
        lastUpdated: new Date(),
        version: '1.0.0',
        totalNodes: this.graph.order,
        totalEdges: this.graph.size,
        fileCount: this.getFileNodeCount(),
        analysisTime: 0 // Will be set by caller
      };

      const graphData: KnowledgeGraphData = {
        metadata,
        graph: this.graph.export()
      };

      await fs.writeFile(this.graphPath, JSON.stringify(graphData, null, 2), 'utf-8');
      console.log(`[KnowledgeGraph] Saved graph to ${this.graphPath} (${metadata.totalNodes} nodes, ${metadata.totalEdges} edges)`);
    } catch (error) {
      console.error('[KnowledgeGraph] Failed to save graph:', error);
      throw error;
    }
  }

  /**
   * Load graph from disk
   */
  async loadGraph(): Promise<boolean> {
    try {
      const exists = await fs.access(this.graphPath).then(() => true).catch(() => false);
      if (!exists) {
        console.log('[KnowledgeGraph] No existing graph found, starting with empty graph');
        return false;
      }

      const content = await fs.readFile(this.graphPath, 'utf-8');
      const graphData: KnowledgeGraphData = JSON.parse(content);

      // Import the graph data
      this.graph.import(graphData.graph);

      console.log(`[KnowledgeGraph] Loaded graph from ${this.graphPath} (${graphData.metadata.totalNodes} nodes, ${graphData.metadata.totalEdges} edges)`);
      return true;
    } catch (error) {
      console.warn('[KnowledgeGraph] Failed to load existing graph, starting fresh:', error);
      this.graph.clear();
      return false;
    }
  }

  /**
   * Query the graph for context generation
   */
  queryRelatedNodes(nodeId: string, maxDepth: number = 2): CodeNode[] {
    const visited = new Set<string>();
    const result: CodeNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth > maxDepth) {
        continue;
      }
      
      visited.add(id);

      if (this.graph.hasNode(id)) {
        const nodeData = this.graph.getNodeAttribute(id, 'data');
        if (nodeData) {
          result.push(nodeData);
        }

        // Add neighbors to queue
        if (depth < maxDepth) {
          this.graph.forEachNeighbor(id, (neighborId: string) => {
            if (!visited.has(neighborId)) {
              queue.push({ id: neighborId, depth: depth + 1 });
            }
          });
        }
      }
    }

    return result;
  }

  /**
   * Find files that import a given module/file
   */
  findImporters(modulePath: string): string[] {
    const importers: string[] = [];
    
    this.graph.forEachInEdge(modulePath, (edgeKey: string, attributes: any, source: string) => {
      if (attributes.type === 'IMPORTS') {
        importers.push(source);
      }
    });

    return importers;
  }

  /**
   * Find functions that call a given function
   */
  findCallers(functionName: string): Array<{ functionId: string; filePath: string; line: number }> {
    const callers: Array<{ functionId: string; filePath: string; line: number }> = [];
    
    this.graph.forEachEdge((edgeKey: string, attributes: any, source: string, target: string) => {
      if (attributes.type === 'CALLS' && attributes.data.to === functionName) {
        callers.push({
          functionId: source,
          filePath: attributes.data.filePath,
          line: attributes.data.line
        });
      }
    });

    return callers;
  }

  /**
   * Get relations for a specific entity (Milestone 4)
   */
  async getRelationsForEntity(entityId: string): Promise<CodeRelation[]> {
    const relations: CodeRelation[] = [];
    
    if (!this.graph.hasNode(entityId)) {
      return relations;
    }

    // Get outgoing edges
    this.graph.forEachOutEdge(entityId, (edgeKey: string, attributes: any) => {
      if (attributes.data) {
        relations.push(attributes.data);
      }
    });

    // Get incoming edges
    this.graph.forEachInEdge(entityId, (edgeKey: string, attributes: any) => {
      if (attributes.data) {
        relations.push(attributes.data);
      }
    });

    return relations;
  }

  /**
   * Get direct neighbors of an entity (Milestone 4)
   */
  async getNeighbors(entityId: string): Promise<string[]> {
    const neighbors: string[] = [];
    
    if (!this.graph.hasNode(entityId)) {
      return neighbors;
    }

    this.graph.forEachNeighbor(entityId, (neighborId: string) => {
      neighbors.push(neighborId);
    });

    return neighbors;
  }

  /**
   * Find entities by pattern matching (Milestone 4)
   */
  findEntitiesByPattern(pattern: string): string[] {
    const results: string[] = [];
    const lowerPattern = pattern.toLowerCase();

    this.graph.forEachNode((nodeId: string, attributes: any) => {
      const nodeData = attributes.data;
      if (nodeData && nodeData.name) {
        if (nodeData.name.toLowerCase().includes(lowerPattern) ||
            nodeId.toLowerCase().includes(lowerPattern)) {
          results.push(nodeId);
        }
      }
    });

    return results;
  }

  /**
   * Get entities by type (Milestone 4)
   */
  getEntitiesByType(entityType: string): string[] {
    const results: string[] = [];

    this.graph.forEachNode((nodeId: string, attributes: any) => {
      if (attributes.type === entityType) {
        results.push(nodeId);
      }
    });

    return results;
  }

  /**
   * Get graph statistics
   */
  getStatistics(): {
    totalNodes: number;
    totalEdges: number;
    fileNodes: number;
    functionNodes: number;
    classNodes: number;
    moduleNodes: number;
    importRelations: number;
    callRelations: number;
    containsRelations: number;
    referenceRelations?: number;
    implementsRelations?: number;
    instantiatesRelations?: number;
  } {
    const stats = {
      totalNodes: this.graph.order,
      totalEdges: this.graph.size,
      fileNodes: 0,
      functionNodes: 0,
      classNodes: 0,
      moduleNodes: 0,
      importRelations: 0,
      callRelations: 0,
      containsRelations: 0,
      referenceRelations: 0,
      implementsRelations: 0,
      instantiatesRelations: 0
    };

    // Count node types
    this.graph.forEachNode((nodeId: string, attributes: any) => {
      const nodeType = attributes.data?.type || attributes.type;
      switch (nodeType) {
        case 'file': stats.fileNodes++; break;
        case 'function': 
        case 'method': stats.functionNodes++; break;
        case 'class': stats.classNodes++; break;
        case 'module': stats.moduleNodes++; break;
      }
    });

    // Count edge types
    this.graph.forEachEdge((edgeKey: string, attributes: any) => {
      switch (attributes.type) {
        case 'IMPORTS': stats.importRelations++; break;
        case 'CALLS': stats.callRelations++; break;
        case 'CONTAINS': stats.containsRelations++; break;
        case 'REFERENCES': stats.referenceRelations++; break;
        case 'IMPLEMENTS': stats.implementsRelations++; break;
        case 'INSTANTIATES': stats.instantiatesRelations++; break;
      }
    });

    return stats;
  }

  /**
   * Get file node count
   */
  private getFileNodeCount(): number {
    let count = 0;
    this.graph.forEachNode((nodeId: string, attributes: any) => {
      if (attributes.data?.type === 'file') {
        count++;
      }
    });
    return count;
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.graph.clear();
  }

  /**
   * Get the raw graph instance (for advanced operations)
   */
  getRawGraph(): DirectedGraph {
    return this.graph;
  }
}
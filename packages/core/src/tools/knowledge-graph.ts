/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../config/config.js';
import { Tool } from '@google/genai';

interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

/**
 * Parameters for creating entities
 */
export interface CreateEntitiesParams {
  entities: Array<{
    name: string;
    entityType: string;
    observations: string[];
  }>;
}

/**
 * Parameters for creating relations
 */
export interface CreateRelationsParams {
  relations: Array<{
    from: string;
    to: string;
    relationType: string;
  }>;
}

/**
 * Parameters for adding observations
 */
export interface AddObservationsParams {
  observations: Array<{
    entityName: string;
    contents: string[];
  }>;
}

/**
 * Parameters for deleting entities
 */
export interface DeleteEntitiesParams {
  entityNames: string[];
}

/**
 * Parameters for deleting observations
 */
export interface DeleteObservationsParams {
  deletions: Array<{
    entityName: string;
    observations: string[];
  }>;
}

/**
 * Parameters for deleting relations
 */
export interface DeleteRelationsParams {
  relations: Array<{
    from: string;
    to: string;
    relationType: string;
  }>;
}

/**
 * Parameters for searching nodes
 */
export interface SearchNodesParams {
  query: string;
}

/**
 * Parameters for opening specific nodes
 */
export interface OpenNodesParams {
  names: string[];
}

/**
 * Knowledge Graph tool for persistent memory management
 */
export class KnowledgeGraphTool extends BaseTool<any, ToolResult> {
  static readonly Name: string = 'knowledge_graph';
  private memoryPath: string;

  constructor(private readonly config: Config, memoryPath?: string) {
    super(
      KnowledgeGraphTool.Name,
      'KnowledgeGraph',
      'Persistent memory management through a knowledge graph. Supports creating entities, relations, observations, and querying the graph for context retention across conversations.',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'create_entities',
              'create_relations', 
              'add_observations',
              'delete_entities',
              'delete_observations',
              'delete_relations',
              'read_graph',
              'search_nodes',
              'open_nodes'
            ],
            description: 'The action to perform on the knowledge graph'
          },
          data: {
            type: 'object',
            description: 'Data specific to the action being performed'
          }
        },
        required: ['action']
      }
    );

    this.memoryPath = memoryPath || path.join(this.config.getTargetDir(), 'memory.json');
  }

  getToolDefinition(): Tool {
    return {
      functionDeclarations: [
        {
          name: this.name,
          description: this.description,
          parameters: this.schema.parameters,
        },
      ],
    };
  }

  validateParams(params: any): string | null {
    if (!params.action) {
      return 'Action is required';
    }

    const validActions = [
      'create_entities',
      'create_relations',
      'add_observations', 
      'delete_entities',
      'delete_observations',
      'delete_relations',
      'read_graph',
      'search_nodes',
      'open_nodes'
    ];

    if (!validActions.includes(params.action)) {
      return `Invalid action. Must be one of: ${validActions.join(', ')}`;
    }

    // Validate action-specific data
    switch (params.action) {
      case 'create_entities':
        // Handle both formats: data.entities or data as direct array
        const entities = params.data?.entities || params.data;
        if (!Array.isArray(entities)) {
          return 'create_entities requires entities array (either data.entities or data as array)';
        }
        // Normalize the format
        if (!params.data?.entities && Array.isArray(params.data)) {
          params.data = { entities: params.data };
        }
        break;
      case 'create_relations':
        const relations = params.data?.relations || params.data;
        if (!Array.isArray(relations)) {
          return 'create_relations requires relations array (either data.relations or data as array)';
        }
        if (!params.data?.relations && Array.isArray(params.data)) {
          params.data = { relations: params.data };
        }
        break;
      case 'add_observations':
        const observations = params.data?.observations || params.data;
        if (!Array.isArray(observations)) {
          return 'add_observations requires observations array (either data.observations or data as array)';
        }
        if (!params.data?.observations && Array.isArray(params.data)) {
          params.data = { observations: params.data };
        }
        break;
      case 'delete_entities':
        const entityNames = params.data?.entityNames || params.data;
        if (!Array.isArray(entityNames)) {
          return 'delete_entities requires entityNames array (either data.entityNames or data as array)';
        }
        if (!params.data?.entityNames && Array.isArray(params.data)) {
          params.data = { entityNames: params.data };
        }
        break;
      case 'delete_observations':
        const deletions = params.data?.deletions || params.data;
        if (!Array.isArray(deletions)) {
          return 'delete_observations requires deletions array (either data.deletions or data as array)';
        }
        if (!params.data?.deletions && Array.isArray(params.data)) {
          params.data = { deletions: params.data };
        }
        break;
      case 'delete_relations':
        const delRelations = params.data?.relations || params.data;
        if (!Array.isArray(delRelations)) {
          return 'delete_relations requires relations array (either data.relations or data as array)';
        }
        if (!params.data?.relations && Array.isArray(params.data)) {
          params.data = { relations: params.data };
        }
        break;
      case 'search_nodes':
        const query = params.data?.query || (typeof params.data === 'string' ? params.data : null);
        if (!query || typeof query !== 'string') {
          return 'search_nodes requires query string (either data.query or data as string)';
        }
        if (typeof params.data === 'string') {
          params.data = { query: params.data };
        }
        break;
      case 'open_nodes':
        const names = params.data?.names || params.data;
        if (!Array.isArray(names)) {
          return 'open_nodes requires names array (either data.names or data as array)';
        }
        if (!params.data?.names && Array.isArray(params.data)) {
          params.data = { names: params.data };
        }
        break;
    }

    return null;
  }

  getDescription(params: any): string {
    return `Knowledge Graph: ${params.action}${params.data ? ` with ${JSON.stringify(params.data).substring(0, 100)}...` : ''}`;
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist, return empty graph
      return { entities: [], relations: [] };
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    await fs.writeFile(this.memoryPath, JSON.stringify(graph, null, 2));
  }

  private findEntity(graph: KnowledgeGraph, name: string): Entity | undefined {
    return graph.entities.find(entity => entity.name === name);
  }

  private async createEntities(params: CreateEntitiesParams): Promise<string> {
    const graph = await this.loadGraph();
    let created = 0;
    let updated = 0;

    for (const entityData of params.entities) {
      const existing = this.findEntity(graph, entityData.name);
      if (existing) {
        existing.entityType = entityData.entityType;
        existing.observations = [...existing.observations, ...entityData.observations];
        updated++;
      } else {
        graph.entities.push({
          name: entityData.name,
          entityType: entityData.entityType,
          observations: [...entityData.observations]
        });
        created++;
      }
    }

    await this.saveGraph(graph);
    return `Created ${created} new entities, updated ${updated} existing entities`;
  }

  private async createRelations(params: CreateRelationsParams): Promise<string> {
    const graph = await this.loadGraph();
    let created = 0;

    for (const relationData of params.relations) {
      // Check if relation already exists
      const exists = graph.relations.some(rel => 
        rel.from === relationData.from && 
        rel.to === relationData.to && 
        rel.relationType === relationData.relationType
      );

      if (!exists) {
        graph.relations.push(relationData);
        created++;
      }
    }

    await this.saveGraph(graph);
    return `Created ${created} new relations`;
  }

  private async addObservations(params: AddObservationsParams): Promise<string> {
    const graph = await this.loadGraph();
    let updated = 0;

    for (const observation of params.observations) {
      const entity = this.findEntity(graph, observation.entityName);
      if (entity) {
        entity.observations = [...entity.observations, ...observation.contents];
        updated++;
      }
    }

    await this.saveGraph(graph);
    return `Added observations to ${updated} entities`;
  }

  private async deleteEntities(params: DeleteEntitiesParams): Promise<string> {
    const graph = await this.loadGraph();
    let deleted = 0;

    for (const entityName of params.entityNames) {
      const index = graph.entities.findIndex(entity => entity.name === entityName);
      if (index !== -1) {
        graph.entities.splice(index, 1);
        // Also remove relations involving this entity
        graph.relations = graph.relations.filter(rel => 
          rel.from !== entityName && rel.to !== entityName
        );
        deleted++;
      }
    }

    await this.saveGraph(graph);
    return `Deleted ${deleted} entities and their relations`;
  }

  private async deleteObservations(params: DeleteObservationsParams): Promise<string> {
    const graph = await this.loadGraph();
    let updated = 0;

    for (const deletion of params.deletions) {
      const entity = this.findEntity(graph, deletion.entityName);
      if (entity) {
        for (const obsToDelete of deletion.observations) {
          const index = entity.observations.indexOf(obsToDelete);
          if (index !== -1) {
            entity.observations.splice(index, 1);
          }
        }
        updated++;
      }
    }

    await this.saveGraph(graph);
    return `Updated ${updated} entities by removing observations`;
  }

  private async deleteRelations(params: DeleteRelationsParams): Promise<string> {
    const graph = await this.loadGraph();
    let deleted = 0;

    for (const relationToDelete of params.relations) {
      const index = graph.relations.findIndex(rel =>
        rel.from === relationToDelete.from &&
        rel.to === relationToDelete.to &&
        rel.relationType === relationToDelete.relationType
      );
      if (index !== -1) {
        graph.relations.splice(index, 1);
        deleted++;
      }
    }

    await this.saveGraph(graph);
    return `Deleted ${deleted} relations`;
  }

  private async readGraph(): Promise<string> {
    const graph = await this.loadGraph();
    return JSON.stringify(graph, null, 2);
  }

  private async searchNodes(params: SearchNodesParams): Promise<string> {
    const graph = await this.loadGraph();
    const query = params.query.toLowerCase();
    
    const matchingEntities = graph.entities.filter(entity =>
      entity.name.toLowerCase().includes(query) ||
      entity.entityType.toLowerCase().includes(query) ||
      entity.observations.some(obs => obs.toLowerCase().includes(query))
    );

    return JSON.stringify({ entities: matchingEntities }, null, 2);
  }

  private async openNodes(params: OpenNodesParams): Promise<string> {
    const graph = await this.loadGraph();
    
    const requestedEntities = graph.entities.filter(entity =>
      params.names.includes(entity.name)
    );

    return JSON.stringify({ entities: requestedEntities }, null, 2);
  }

  async execute(params: any, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Knowledge Graph Error: ${validationError}`
      };
    }

    try {
      let result: string;

      switch (params.action) {
        case 'create_entities':
          result = await this.createEntities(params.data);
          break;
        case 'create_relations':
          result = await this.createRelations(params.data);
          break;
        case 'add_observations':
          result = await this.addObservations(params.data);
          break;
        case 'delete_entities':
          result = await this.deleteEntities(params.data);
          break;
        case 'delete_observations':
          result = await this.deleteObservations(params.data);
          break;
        case 'delete_relations':
          result = await this.deleteRelations(params.data);
          break;
        case 'read_graph':
          result = await this.readGraph();
          break;
        case 'search_nodes':
          result = await this.searchNodes(params.data);
          break;
        case 'open_nodes':
          result = await this.openNodes(params.data);
          break;
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }

      return {
        llmContent: result,
        returnDisplay: `Knowledge Graph ${params.action} completed successfully`
      };

    } catch (error) {
      const errorMessage = `Knowledge Graph ${params.action} failed: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: errorMessage
      };
    }
  }
}
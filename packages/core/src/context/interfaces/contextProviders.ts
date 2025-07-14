/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core interfaces for modular context providers
 * These interfaces allow different implementations to be swapped in/out
 */

// ============================================================================
// Knowledge Graph Provider Interface
// ============================================================================

export interface KnowledgeNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'module' | 'concept' | 'error';
  name: string;
  content?: string;
  metadata: Record<string, any>;
  relationships: Array<{
    targetId: string;
    type: 'imports' | 'calls' | 'contains' | 'references' | 'implements';
    weight?: number;
  }>;
}

export interface GraphQuery {
  nodeTypes?: string[];
  searchTerm?: string;
  maxResults?: number;
  includeNeighbors?: boolean;
  filters?: Record<string, any>;
}

export interface GraphQueryResult {
  nodes: KnowledgeNode[];
  relationships: Array<{
    sourceId: string;
    targetId: string;
    type: string;
    weight?: number;
  }>;
  totalCount: number;
  queryTime: number;
}

export interface IKnowledgeGraphProvider {
  /**
   * Initialize the graph provider
   */
  initialize(): Promise<void>;

  /**
   * Query nodes from the graph
   */
  query(query: GraphQuery): Promise<GraphQueryResult>;

  /**
   * Get a specific node by ID
   */
  getNode(nodeId: string): Promise<KnowledgeNode | null>;

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string, maxDepth?: number): Promise<KnowledgeNode[]>;

  /**
   * Add or update a node
   */
  upsertNode(node: KnowledgeNode): Promise<void>;

  /**
   * Remove a node
   */
  removeNode(nodeId: string): Promise<void>;

  /**
   * Get statistics about the graph
   */
  getStatistics(): Promise<{
    totalNodes: number;
    totalRelationships: number;
    nodeTypeDistribution: Record<string, number>;
    lastUpdated: string;
  }>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Vector Search Provider Interface
// ============================================================================

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export interface VectorQuery {
  text: string;
  topK?: number;
  threshold?: number;
  filters?: Record<string, any>;
  includeMetadata?: boolean;
}

export interface VectorSearchResponse {
  query: string;
  results: VectorSearchResult[];
  searchTime: number;
  totalDocuments: number;
}

export interface IVectorSearchProvider {
  /**
   * Initialize the vector search provider
   */
  initialize(): Promise<void>;

  /**
   * Index a document for vector search
   */
  indexDocument(id: string, content: string, metadata?: Record<string, any>): Promise<void>;

  /**
   * Search for similar documents
   */
  search(query: VectorQuery): Promise<VectorSearchResponse>;

  /**
   * Remove a document from the index
   */
  removeDocument(id: string): Promise<void>;

  /**
   * Get index statistics
   */
  getIndexStats(): Promise<{
    documentCount: number;
    vectorDimensions: number;
    indexSize: string;
    lastUpdated: string;
  }>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Context Extractor Interface
// ============================================================================

export interface ContextQuery {
  userInput: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  recentOperations?: Array<{
    type: 'tool_call' | 'file_change' | 'error';
    description: string;
    metadata?: Record<string, any>;
    timestamp: string;
  }>;
  sessionContext?: {
    sessionId: string;
    projectDir: string;
    workingFiles?: string[];
  };
}

export interface ExtractedContext {
  semantic: {
    intent: string;
    confidence: number;
    entities: string[];
    concepts: string[];
  };
  code: {
    relevantFiles: Array<{
      path: string;
      relevance: number;
      summary: string;
    }>;
    relevantFunctions: Array<{
      name: string;
      filePath: string;
      relevance: number;
      signature?: string;
    }>;
    relatedPatterns: Array<{
      pattern: string;
      description: string;
      examples: string[];
    }>;
  };
  conversation: {
    topicProgression: string[];
    userGoals: string[];
    contextContinuity: string[];
  };
  operational: {
    recentActions: string[];
    errorContext: Array<{
      error: string;
      context: string;
      suggestions: string[];
    }>;
    workflowSuggestions: string[];
  };
}

export interface IContextExtractor {
  /**
   * Initialize the context extractor
   */
  initialize(): Promise<void>;

  /**
   * Extract context based on query
   */
  extractContext(query: ContextQuery): Promise<ExtractedContext>;

  /**
   * Update the extractor with new information
   */
  updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void>;

  /**
   * Get extractor configuration
   */
  getConfig(): Promise<{
    provider: string;
    version: string;
    capabilities: string[];
  }>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Provider Factory Interface
// ============================================================================

export interface ContextProviderConfig {
  graphProvider: {
    type: 'local' | 'neo4j' | 'memory' | 'custom';
    config: Record<string, any>;
  };
  vectorProvider: {
    type: 'tfidf' | 'embedding' | 'openai' | 'local' | 'custom';
    config: Record<string, any>;
  };
  extractorProvider: {
    type: 'rag' | 'rule_based' | 'llm' | 'hybrid' | 'custom';
    config: Record<string, any>;
  };
}

export interface IContextProviderFactory {
  /**
   * Create a knowledge graph provider
   */
  createGraphProvider(config: ContextProviderConfig['graphProvider']): IKnowledgeGraphProvider;

  /**
   * Create a vector search provider
   */
  createVectorProvider(config: ContextProviderConfig['vectorProvider']): IVectorSearchProvider;

  /**
   * Create a context extractor
   */
  createContextExtractor(
    config: ContextProviderConfig['extractorProvider'],
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ): IContextExtractor;

  /**
   * List available providers
   */
  getAvailableProviders(): {
    graph: string[];
    vector: string[];
    extractor: string[];
  };
}

// ============================================================================
// Context Manager Interface (Main Orchestrator)
// ============================================================================

export interface IContextManager {
  /**
   * Initialize the context manager with providers
   */
  initialize(config: ContextProviderConfig): Promise<void>;

  /**
   * Get context for a user query
   */
  getContext(query: ContextQuery): Promise<ExtractedContext>;

  /**
   * Update context with new information
   */
  updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void>;

  /**
   * Switch to a different provider implementation
   */
  switchProvider(
    providerType: 'graph' | 'vector' | 'extractor',
    newConfig: Record<string, any>
  ): Promise<void>;

  /**
   * Get current provider status
   */
  getProviderStatus(): Promise<{
    graph: { type: string; status: 'ready' | 'loading' | 'error' };
    vector: { type: string; status: 'ready' | 'loading' | 'error' };
    extractor: { type: string; status: 'ready' | 'loading' | 'error' };
  }>;

  /**
   * Cleanup all providers
   */
  dispose(): Promise<void>;
}
/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  IntegratedContextManager, 
  RAGProvider, 
  KnowledgeGraphProvider,
  RAGResult,
  KnowledgeGraphResult,
  ContextLayer
} from './IntegratedContextManager';
import { ContextType } from './ContextHistorySeparator';

// Mock RAG provider
class MockRAGProvider implements RAGProvider {
  name = 'mock-rag';
  
  async query(input: string, limit: number = 3): Promise<RAGResult[]> {
    return [
      {
        content: `Information about ${input}. This is a relevant document.`,
        source: 'mock-source-1',
        relevance: 0.9,
      },
      {
        content: `Additional context for ${input}. More details here.`,
        source: 'mock-source-2',
        relevance: 0.7,
      },
      {
        content: `Some related information to ${input}. Less relevant but still useful.`,
        source: 'mock-source-3',
        relevance: 0.5,
      },
    ].slice(0, limit);
  }
  
  async indexDocument(document: any): Promise<void> {
    // Mock implementation
  }
  
  async updateIndex(): Promise<void> {
    // Mock implementation
  }
}

// Mock knowledge graph provider
class MockGraphProvider implements KnowledgeGraphProvider {
  name = 'mock-graph';
  
  async query(input: string): Promise<KnowledgeGraphResult> {
    return {
      nodes: [
        { id: 'node1', label: input, type: 'topic' },
        { id: 'node2', label: 'related-topic', type: 'topic' },
      ],
      edges: [
        { source: 'node1', target: 'node2', label: 'related-to' },
      ],
      insights: [
        `${input} is related to related-topic`,
        `Found 2 nodes and 1 relationship`,
      ],
    };
  }
  
  async addNode(node: any): Promise<void> {
    // Mock implementation
  }
  
  async addEdge(edge: any): Promise<void> {
    // Mock implementation
  }
  
  async updateGraph(): Promise<void> {
    // Mock implementation
  }
}

// Mock context layer
class MockContextLayer implements ContextLayer {
  constructor(
    public name: string,
    public priority: number,
    private contextContent: string
  ) {}
  
  async getContext(query: string, tokenBudget: number): Promise<string> {
    return this.contextContent.replace('{query}', query);
  }
}

describe('IntegratedContextManager', () => {
  let contextManager: IntegratedContextManager;
  let ragProvider: RAGProvider;
  let graphProvider: KnowledgeGraphProvider;
  
  beforeEach(() => {
    contextManager = new IntegratedContextManager('test-project');
    ragProvider = new MockRAGProvider();
    graphProvider = new MockGraphProvider();
    
    contextManager.setRAGProvider(ragProvider);
    contextManager.setGraphProvider(graphProvider);
    
    // Add context layers
    contextManager.addContextLayer(new MockContextLayer(
      'system',
      100,
      'System context for {query}'
    ));
    
    contextManager.addContextLayer(new MockContextLayer(
      'project',
      50,
      'Project context for {query}'
    ));
  });
  
  describe('Provider Management', () => {
    it('should set RAG provider', () => {
      const eventHandler = vi.fn();
      contextManager.on('providerSet', eventHandler);
      
      contextManager.setRAGProvider(new MockRAGProvider());
      
      expect(eventHandler).toHaveBeenCalledWith({
        type: 'rag',
        name: 'mock-rag',
      });
    });
    
    it('should set graph provider', () => {
      const eventHandler = vi.fn();
      contextManager.on('providerSet', eventHandler);
      
      contextManager.setGraphProvider(new MockGraphProvider());
      
      expect(eventHandler).toHaveBeenCalledWith({
        type: 'graph',
        name: 'mock-graph',
      });
    });
    
    it('should add context layers', () => {
      const eventHandler = vi.fn();
      contextManager.on('layerAdded', eventHandler);
      
      const layer = new MockContextLayer('test', 75, 'Test context');
      contextManager.addContextLayer(layer);
      
      expect(eventHandler).toHaveBeenCalledWith({
        name: 'test',
        priority: 75,
      });
    });
  });
  
  describe('User Input Processing', () => {
    it('should process user input and generate context', async () => {
      const input = 'test query';
      const result = await contextManager.processUserInput(input);
      
      expect(result.relevantContext).toContain('System context for test query');
      expect(result.relevantContext).toContain('Project context for test query');
      expect(result.relevantContext).toContain('Information about test query');
      expect(result.ragResults).toHaveLength(3);
      expect(result.insights).toContain('Found 3 relevant documents');
    });
    
    it('should use cache for repeated queries', async () => {
      const cacheHitHandler = vi.fn();
      contextManager.on('cacheHit', cacheHitHandler);
      
      const input = 'repeated query';
      
      // First call should not hit cache
      await contextManager.processUserInput(input);
      expect(cacheHitHandler).not.toHaveBeenCalled();
      
      // Second call should hit cache
      await contextManager.processUserInput(input);
      expect(cacheHitHandler).toHaveBeenCalledWith({ input });
    });
    
    it('should clear cache when requested', async () => {
      const input = 'cache test';
      
      // First call
      await contextManager.processUserInput(input);
      
      // Clear cache
      contextManager.clearCache();
      
      // Second call should not hit cache
      const cacheHitHandler = vi.fn();
      contextManager.on('cacheHit', cacheHitHandler);
      await contextManager.processUserInput(input);
      
      expect(cacheHitHandler).not.toHaveBeenCalled();
    });
  });
  
  describe('Model Response Processing', () => {
    it('should extract entities and code snippets from model response', async () => {
      const response = `
        Here's a solution using JavaScript:
        
        \`\`\`javascript
        function calculateSum(a, b) {
          return a + b;
        }
        \`\`\`
        
        You can also use \`Math.max()\` for finding the maximum value.
      `;
      
      const result = await contextManager.processModelResponse(response);
      
      expect(result.codeSnippets).toHaveLength(2);
      expect(result.codeSnippets[0]).toContain('function calculateSum');
      expect(result.codeSnippets[1]).toBe('Math.max()');
    });
  });
  
  describe('Conversation History Processing', () => {
    it('should separate context from conversation history', () => {
      const messages = [
        { role: 'system', content: 'System context', contextType: ContextType.SYSTEM },
        { role: 'user', content: 'User message', contextType: ContextType.USER },
        { role: 'assistant', content: 'Model response', contextType: ContextType.MODEL },
        { role: 'system', content: 'RAG results', contextType: ContextType.RAG },
        { role: 'function', content: 'Tool call', contextType: ContextType.TOOL_CALL },
      ];
      
      const { history, context } = contextManager.processConversationHistory(messages);
      
      expect(history).toHaveLength(3);
      expect(context).toHaveLength(2);
      
      expect(history.map(m => m.role)).toEqual(['user', 'assistant', 'function']);
      expect(context.map(m => m.role)).toEqual(['system', 'system']);
    });
    
    it('should create context messages with appropriate type', () => {
      const message = contextManager.createContextMessage('Test context', ContextType.STATIC);
      
      expect(message.role).toBe('system');
      expect(message.content).toBe('Test context');
      expect(message.contextType).toBe(ContextType.STATIC);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle RAG provider errors gracefully', async () => {
      const errorHandler = vi.fn();
      contextManager.on('error', errorHandler);
      
      // Replace with failing provider
      const failingProvider: RAGProvider = {
        name: 'failing-rag',
        query: async () => { throw new Error('RAG query failed'); },
        indexDocument: async () => {},
        updateIndex: async () => {},
      };
      
      contextManager.setRAGProvider(failingProvider);
      
      const result = await contextManager.processUserInput('test');
      
      expect(errorHandler).toHaveBeenCalledWith({
        type: 'rag_query',
        error: expect.any(Error),
      });
      
      // Should still return results without RAG
      expect(result.ragResults).toEqual([]);
      expect(result.relevantContext).not.toContain('Information about test');
    });
    
    it('should handle graph provider errors gracefully', async () => {
      const errorHandler = vi.fn();
      contextManager.on('error', errorHandler);
      
      // Replace with failing provider
      const failingProvider: KnowledgeGraphProvider = {
        name: 'failing-graph',
        query: async () => { throw new Error('Graph query failed'); },
        addNode: async () => {},
        addEdge: async () => {},
        updateGraph: async () => {},
      };
      
      contextManager.setGraphProvider(failingProvider);
      
      const result = await contextManager.processUserInput('test');
      
      expect(errorHandler).toHaveBeenCalledWith({
        type: 'graph_query',
        error: expect.any(Error),
      });
      
      // Should still return results without graph
      expect(result.graphResults).toBeUndefined();
    });
  });
});
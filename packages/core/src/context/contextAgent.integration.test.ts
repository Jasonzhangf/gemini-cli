/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextAgent } from './contextAgent.js';
import { Config } from '../config/config.js';

describe('ContextAgent RAG Integration', () => {
  let contextAgent: ContextAgent;
  let mockConfig: Config;

  beforeEach(() => {
    // Create a minimal mock config
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(true),
      getAnalysisMode: vi.fn().mockReturnValue('static'),
      getContextManager: vi.fn().mockReturnValue({
        clearDynamicContext: vi.fn(),
        addDynamicContext: vi.fn()
      })
    } as any;

    contextAgent = new ContextAgent({
      config: mockConfig,
      projectDir: '/tmp/test',
      sessionId: 'test-session'
    });
  });

  it('should be initialized', async () => {
    expect(contextAgent.isInitialized()).toBe(false);
  });

  it('should have access to provider factory', () => {
    const factory = (contextAgent as any).providerFactory;
    expect(factory).toBeDefined();
    
    const availableProviders = factory.getAvailableProviders();
    expect(availableProviders.extractor).toContain('rag');
    expect(availableProviders.extractor).toContain('hybrid');
    expect(availableProviders.graph).toContain('memory');
    expect(availableProviders.vector).toContain('siliconflow');
  });

  it('should handle context injection without initialization gracefully', async () => {
    await contextAgent.injectContextIntoDynamicSystem('test user input');
    
    // Should not throw and should have called the context manager
    const contextManager = mockConfig.getContextManager();
    expect(contextManager.clearDynamicContext).toHaveBeenCalled();
    expect(contextManager.addDynamicContext).toHaveBeenCalled();
  });
});

describe('ContextAgent Entity Extraction Logic', () => {
  let contextAgent: ContextAgent;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(true),
    } as any;
    contextAgent = new ContextAgent({ config: mockConfig, projectDir: '/tmp', sessionId: 'test' });
  });

  it('should NOT extract entities from natural language mentions', () => {
    const ragOutput = "The user is asking about the context agent and its core functions.";
    const entities = (contextAgent as any).extractEntitiesFromRAGOutput(ragOutput);
    expect(entities).toEqual([]);
  });

  it('should extract entities when specific keywords are used', () => {
    const ragOutput = "The main class is MainClass, and it uses the function process_data.";
    const entities = (contextAgent as any).extractEntitiesFromRAGOutput(ragOutput);
    expect(entities).toEqual(['MainClass', 'process_data']);
  });

  it('should extract file paths when correctly formatted', () => {
    const ragOutput = "Please check the file at 'src/utils/helpers.ts'.";
    const entities = (contextAgent as any).extractEntitiesFromRAGOutput(ragOutput);
    expect(entities).toEqual(['src/utils/helpers.ts']);
  });
});
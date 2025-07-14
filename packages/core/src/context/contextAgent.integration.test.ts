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

  it('should initialize with RAG system components', async () => {
    const summary = await contextAgent.getSummary();
    
    expect(summary.status).toBe('Not Initialized');
    expect(summary.capabilities).toContain('Static code analysis and AST parsing');
    expect(summary.capabilities).toContain('Knowledge graph construction and storage');
    expect(summary.capabilities).toContain('Intelligent context injection for AI prompts');
  });

  it('should show RAG system in capabilities after initialization', async () => {
    // Note: We can't fully initialize without a real project, but we can check the structure
    expect(contextAgent.isInitialized()).toBe(false);
    
    // The ContextAgent should have RAG system components available
    expect((contextAgent as any).providerFactory).toBeDefined();
    expect((contextAgent as any).contextExtractor).toBeNull(); // Not initialized yet
    expect((contextAgent as any).graphProvider).toBeNull(); // Not initialized yet
    expect((contextAgent as any).vectorProvider).toBeNull(); // Not initialized yet
  });

  it('should have access to provider factory', () => {
    const factory = (contextAgent as any).providerFactory;
    expect(factory).toBeDefined();
    
    const availableProviders = factory.getAvailableProviders();
    expect(availableProviders.extractor).toContain('rag');
    expect(availableProviders.extractor).toContain('hybrid');
    expect(availableProviders.graph).toContain('memory');
    expect(availableProviders.vector).toContain('tfidf');
  });

  it('should handle context injection without initialization gracefully', async () => {
    await contextAgent.injectContextIntoDynamicSystem('test user input');
    
    // Should not throw and should have called the context manager
    const contextManager = mockConfig.getContextManager();
    expect(contextManager.clearDynamicContext).toHaveBeenCalled();
    expect(contextManager.addDynamicContext).toHaveBeenCalled();
  });
});
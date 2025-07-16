/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderStorageAbstraction } from './providerStorageAbstraction.js';

// Simple mock for ProjectStorageManager
const mockStorageManager = {
  getMetadata: vi.fn(),
  updateMetadata: vi.fn(),
  getAvailableRAGProviders: vi.fn(),
  getAvailableKnowledgeGraphProviders: vi.fn(),
  getRAGProviderPath: vi.fn(),
  getKnowledgeGraphProviderPath: vi.fn(),
};

vi.mock('./projectStorageManager.js', () => ({
  ProjectStorageManager: vi.fn(() => mockStorageManager),
}));

describe('ProviderStorageAbstraction - Basic Tests', () => {
  let providerStorage: ProviderStorageAbstraction;

  beforeEach(() => {
    vi.clearAllMocks();
    providerStorage = new ProviderStorageAbstraction('/test/project');
  });

  describe('current provider management', () => {
    it('should get current RAG provider', async () => {
      mockStorageManager.getMetadata.mockResolvedValue({
        activeRAGProvider: 'lightrag',
      });

      const provider = await providerStorage.getCurrentProvider('rag');
      expect(provider).toBe('lightrag');
    });

    it('should return null when no current provider is set', async () => {
      mockStorageManager.getMetadata.mockResolvedValue({});

      const provider = await providerStorage.getCurrentProvider('rag');
      expect(provider).toBeNull();
    });

    it('should set current RAG provider', async () => {
      mockStorageManager.updateMetadata.mockResolvedValue(undefined);

      await providerStorage.setCurrentProvider('rag', 'llamaindex');

      expect(mockStorageManager.updateMetadata).toHaveBeenCalledWith({
        activeRAGProvider: 'llamaindex',
      });
    });
  });

  describe('available providers', () => {
    it('should get available RAG providers', async () => {
      mockStorageManager.getAvailableRAGProviders.mockResolvedValue(['lightrag', 'llamaindex']);

      const providers = await providerStorage.getAvailableProviders('rag');
      expect(providers).toEqual(['lightrag', 'llamaindex']);
    });

    it('should get available knowledge graph providers', async () => {
      mockStorageManager.getAvailableKnowledgeGraphProviders.mockResolvedValue(['neo4j', 'graphology']);

      const providers = await providerStorage.getAvailableProviders('knowledge-graph');
      expect(providers).toEqual(['neo4j', 'graphology']);
    });
  });

  describe('error handling', () => {
    it('should handle metadata loading errors gracefully', async () => {
      mockStorageManager.getMetadata.mockRejectedValue(new Error('Metadata error'));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = await providerStorage.getCurrentProvider('rag');

      expect(provider).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle provider setting errors', async () => {
      mockStorageManager.updateMetadata.mockRejectedValue(new Error('Update error'));

      await expect(providerStorage.setCurrentProvider('rag', 'lightrag')).rejects.toThrow('Update error');
    });
  });
});
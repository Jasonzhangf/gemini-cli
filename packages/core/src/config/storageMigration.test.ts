/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StorageMigration } from './storageMigration.js';
import { ProjectStorageManager } from './projectStorageManager.js';
import { ProviderStorageAbstraction } from './providerStorageAbstraction.js';

// Mock filesystem operations
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  promises: {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    copyFile: vi.fn(),
    rm: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock ProjectStorageManager
const mockStorageManager = {
  getProjectId: vi.fn(() => 'test-project'),
  isStorageInitialized: vi.fn(),
  initializeStorage: vi.fn(),
  getRAGProviderPath: vi.fn(),
  getKnowledgeGraphProviderPath: vi.fn(),
};

vi.mock('./projectStorageManager.js', () => ({
  ProjectStorageManager: vi.fn(() => mockStorageManager),
}));

// Mock ProviderStorageAbstraction
const mockProviderStorage = {
  getCurrentProvider: vi.fn(),
  setCurrentProvider: vi.fn(),
  getAvailableProviders: vi.fn(),
  setProviderConfig: vi.fn(),
  getProviderStats: vi.fn(),
};

vi.mock('./providerStorageAbstraction.js', () => ({
  ProviderStorageAbstraction: vi.fn(() => mockProviderStorage),
}));

describe('StorageMigration', () => {
  let migration: StorageMigration;
  const testProjectDir = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    migration = new StorageMigration();
  });

  describe('isMigrationNeeded', () => {
    it('should return true when legacy data exists and new storage does not', async () => {
      // Mock legacy data exists
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return pathStr.includes('/home/testuser/.gemini/rag') || pathStr.includes('/home/testuser/.gemini/knowledge-graph');
      });
      vi.mocked(fs.promises.readdir).mockResolvedValue(['provider1'] as any);
      
      // Mock new storage does not exist
      mockStorageManager.isStorageInitialized.mockReturnValue(false);

      const needed = await migration.isMigrationNeeded();
      expect(needed).toBe(true);
    });

    it('should return false when legacy data does not exist', async () => {
      // Mock legacy data does not exist
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      // Mock new storage does not exist
      mockStorageManager.isStorageInitialized.mockReturnValue(false);

      const needed = await migration.isMigrationNeeded();
      expect(needed).toBe(false);
    });

    it('should return false when new storage already exists', async () => {
      // Mock legacy data exists
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readdir).mockResolvedValue(['provider1'] as any);
      
      // Mock new storage already exists
      mockStorageManager.isStorageInitialized.mockReturnValue(true);

      const needed = await migration.isMigrationNeeded();
      expect(needed).toBe(false);
    });
  });

  describe('migrateStorage', () => {
    it('should skip migration when not needed', async () => {
      // Mock migration not needed
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockStorageManager.isStorageInitialized.mockReturnValue(true);

      const result = await migration.migrate();

      expect(result.success).toBe(true);
      expect(result.skippedFiles).toContain('Migration not needed or already performed');
      expect(mockStorageManager.initializeStorage).not.toHaveBeenCalled();
    });

    it('should handle migration errors gracefully', async () => {
      // Mock migration needed
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readdir).mockResolvedValue(['provider1'] as any);
      mockStorageManager.isStorageInitialized.mockReturnValue(false);
      
      // Mock error during migration
      mockStorageManager.initializeStorage.mockRejectedValue(new Error('Initialization error'));

      const result = await migration.migrate();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Initialization error');
    });
  });
});
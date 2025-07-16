/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectStorageManager } from './projectStorageManager.js';

export interface ProviderConfig {
  name: string;
  type: 'rag' | 'knowledge-graph';
  version?: string;
  settings?: Record<string, any>;
  enabled: boolean;
  priority?: number;
}

export interface MigrationResult {
  success: boolean;
  sourceProvider: string;
  targetProvider: string;
  migratedFiles: number;
  errors: string[];
  backupPath?: string;
}

export interface ProviderSwitchOptions {
  createBackup?: boolean;
  validateData?: boolean;
  preserveSettings?: boolean;
  cleanupSource?: boolean;
}

/**
 * ProviderStorageAbstraction handles switching between different storage providers
 * and provides data migration capabilities for RAG and knowledge graph systems.
 */
export class ProviderStorageAbstraction {
  private readonly storageManager: ProjectStorageManager;
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.storageManager = new ProjectStorageManager(projectRoot);
  }

  /**
   * Get the current active provider for a given type
   */
  async getCurrentProvider(type: 'rag' | 'knowledge-graph'): Promise<string | null> {
    try {
      const metadata = await this.storageManager.getMetadata();
      const providerKey = type === 'rag' ? 'activeRAGProvider' : 'activeKnowledgeGraphProvider';
      return (metadata as any)[providerKey] || null;
    } catch (error) {
      console.warn(`[ProviderStorageAbstraction] Failed to get current ${type} provider:`, error);
      return null;
    }
  }

  /**
   * Set the active provider for a given type
   */
  async setCurrentProvider(type: 'rag' | 'knowledge-graph', provider: string): Promise<void> {
    try {
      const providerKey = type === 'rag' ? 'activeRAGProvider' : 'activeKnowledgeGraphProvider';
      await this.storageManager.updateMetadata({
        [providerKey]: provider,
      });
    } catch (error) {
      console.error(`[ProviderStorageAbstraction] Failed to set current ${type} provider:`, error);
      throw error;
    }
  }

  /**
   * Get available providers for a given type
   */
  async getAvailableProviders(type: 'rag' | 'knowledge-graph'): Promise<string[]> {
    if (type === 'rag') {
      return await this.storageManager.getAvailableRAGProviders();
    } else {
      return await this.storageManager.getAvailableKnowledgeGraphProviders();
    }
  }

  /**
   * Get provider configuration
   */
  async getProviderConfig(type: 'rag' | 'knowledge-graph', provider: string): Promise<ProviderConfig | null> {
    try {
      const providerPath = this.getProviderPath(type, provider);
      const configPath = path.join(providerPath, 'provider.json');

      if (!fs.existsSync(configPath)) {
        return null;
      }

      const configContent = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      return {
        name: provider,
        type,
        enabled: true,
        ...config,
      };
    } catch (error) {
      console.warn(`[ProviderStorageAbstraction] Failed to get ${type} provider config for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Set provider configuration
   */
  async setProviderConfig(type: 'rag' | 'knowledge-graph', provider: string, config: Partial<ProviderConfig>): Promise<void> {
    try {
      const providerPath = this.getProviderPath(type, provider);
      const configPath = path.join(providerPath, 'provider.json');

      // Ensure provider directory exists
      await fs.promises.mkdir(providerPath, { recursive: true });

      // Merge with existing config if it exists
      let existingConfig = {};
      if (fs.existsSync(configPath)) {
        const existingContent = await fs.promises.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(existingContent);
      }

      const mergedConfig = {
        ...existingConfig,
        ...config,
        name: provider,
        type,
        updatedAt: new Date().toISOString(),
      };

      await fs.promises.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
    } catch (error) {
      console.error(`[ProviderStorageAbstraction] Failed to set ${type} provider config for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Switch from one provider to another with optional data migration
   */
  async switchProvider(
    type: 'rag' | 'knowledge-graph',
    sourceProvider: string,
    targetProvider: string,
    options: ProviderSwitchOptions = {}
  ): Promise<MigrationResult> {
    const opts = {
      createBackup: true,
      validateData: true,
      preserveSettings: true,
      cleanupSource: false,
      ...options,
    };

    const result: MigrationResult = {
      success: false,
      sourceProvider,
      targetProvider,
      migratedFiles: 0,
      errors: [],
    };

    try {
      const sourcePath = this.getProviderPath(type, sourceProvider);
      const targetPath = this.getProviderPath(type, targetProvider);

      // Validate source provider exists
      if (!fs.existsSync(sourcePath)) {
        result.errors.push(`Source provider ${sourceProvider} does not exist`);
        return result;
      }

      // Create backup if requested
      if (opts.createBackup) {
        result.backupPath = await this.createBackup(type, sourceProvider);
      }

      // Ensure target directory exists
      await fs.promises.mkdir(targetPath, { recursive: true });

      // Migrate data
      const migrationStats = await this.migrateProviderData(sourcePath, targetPath, opts);
      result.migratedFiles = migrationStats.fileCount;

      // Validate migrated data if requested
      if (opts.validateData) {
        const validationResult = await this.validateMigratedData(sourcePath, targetPath);
        if (!validationResult.valid) {
          result.errors.push(...validationResult.errors);
          return result;
        }
      }

      // Update active provider
      await this.setCurrentProvider(type, targetProvider);

      // Cleanup source if requested
      if (opts.cleanupSource) {
        await this.cleanupProvider(type, sourceProvider);
      }

      result.success = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Create a backup of provider data
   */
  async createBackup(type: 'rag' | 'knowledge-graph', provider: string): Promise<string> {
    const sourcePath = this.getProviderPath(type, provider);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      path.dirname(sourcePath),
      `${provider}-backup-${timestamp}`
    );

    await this.copyDirectory(sourcePath, backupPath);
    return backupPath;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(type: 'rag' | 'knowledge-graph', provider: string, backupPath: string): Promise<void> {
    const targetPath = this.getProviderPath(type, provider);

    // Remove current provider data
    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    }

    // Restore from backup
    await this.copyDirectory(backupPath, targetPath);
  }

  /**
   * Get storage statistics for a provider
   */
  async getProviderStats(type: 'rag' | 'knowledge-graph', provider: string): Promise<{
    size: number;
    fileCount: number;
    lastModified: Date | null;
  }> {
    const providerPath = this.getProviderPath(type, provider);

    if (!fs.existsSync(providerPath)) {
      return { size: 0, fileCount: 0, lastModified: null };
    }

    const stats = {
      size: 0,
      fileCount: 0,
      lastModified: null as Date | null,
    };

    try {
      const entries = await fs.promises.readdir(providerPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(providerPath, entry.name);

        if (entry.isDirectory()) {
          const subStats = await this.getDirectoryStats(fullPath);
          stats.size += subStats.size;
          stats.fileCount += subStats.fileCount;
          if (subStats.lastModified && (!stats.lastModified || subStats.lastModified > stats.lastModified)) {
            stats.lastModified = subStats.lastModified;
          }
        } else if (entry.isFile()) {
          const fileStat = await fs.promises.stat(fullPath);
          stats.size += fileStat.size;
          stats.fileCount++;
          if (!stats.lastModified || fileStat.mtime > stats.lastModified) {
            stats.lastModified = fileStat.mtime;
          }
        }
      }
    } catch (error) {
      console.warn(`[ProviderStorageAbstraction] Failed to get stats for ${type} provider ${provider}:`, error);
    }

    return stats;
  }

  /**
   * Clean up provider data
   */
  async cleanupProvider(type: 'rag' | 'knowledge-graph', provider: string): Promise<void> {
    const providerPath = this.getProviderPath(type, provider);

    if (fs.existsSync(providerPath)) {
      await fs.promises.rm(providerPath, { recursive: true, force: true });
    }
  }

  /**
   * Get provider storage path
   */
  private getProviderPath(type: 'rag' | 'knowledge-graph', provider: string): string {
    if (type === 'rag') {
      return this.storageManager.getRAGProviderPath(provider);
    } else {
      return this.storageManager.getKnowledgeGraphProviderPath(provider);
    }
  }

  /**
   * Migrate data between providers
   */
  private async migrateProviderData(
    sourcePath: string,
    targetPath: string,
    options: ProviderSwitchOptions
  ): Promise<{ fileCount: number }> {
    let fileCount = 0;

    try {
      const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true });

      for (const entry of entries) {
        const sourceFile = path.join(sourcePath, entry.name);
        const targetFile = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
          await fs.promises.mkdir(targetFile, { recursive: true });
          const subResult = await this.migrateProviderData(sourceFile, targetFile, options);
          fileCount += subResult.fileCount;
        } else if (entry.isFile()) {
          // Skip provider.json if not preserving settings
          if (entry.name === 'provider.json' && !options.preserveSettings) {
            continue;
          }

          await fs.promises.copyFile(sourceFile, targetFile);
          fileCount++;
        }
      }
    } catch (error) {
      console.warn('[ProviderStorageAbstraction] Error during data migration:', error);
    }

    return { fileCount };
  }

  /**
   * Validate migrated data
   */
  private async validateMigratedData(sourcePath: string, targetPath: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const result = { valid: true, errors: [] as string[] };

    try {
      // Basic validation: check if target directory exists and has content
      if (!fs.existsSync(targetPath)) {
        result.valid = false;
        result.errors.push('Target directory does not exist after migration');
        return result;
      }

      const sourceStats = await this.getDirectoryStats(sourcePath);
      const targetStats = await this.getDirectoryStats(targetPath);

      // Check if file counts match (allowing for some variance due to config files)
      if (Math.abs(sourceStats.fileCount - targetStats.fileCount) > 1) {
        result.valid = false;
        result.errors.push(`File count mismatch: source=${sourceStats.fileCount}, target=${targetStats.fileCount}`);
      }

      // Check if total size is reasonable (allowing for some variance)
      const sizeDifference = Math.abs(sourceStats.size - targetStats.size);
      const sizeThreshold = Math.max(sourceStats.size * 0.1, 1024); // 10% or 1KB
      if (sizeDifference > sizeThreshold) {
        result.valid = false;
        result.errors.push(`Size difference too large: ${sizeDifference} bytes`);
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });

    const entries = await fs.promises.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourceFile = path.join(source, entry.name);
      const targetFile = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourceFile, targetFile);
      } else if (entry.isFile()) {
        await fs.promises.copyFile(sourceFile, targetFile);
      }
    }
  }

  /**
   * Get directory statistics recursively
   */
  private async getDirectoryStats(dirPath: string): Promise<{
    size: number;
    fileCount: number;
    lastModified: Date | null;
  }> {
    const stats = { size: 0, fileCount: 0, lastModified: null as Date | null };

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subStats = await this.getDirectoryStats(fullPath);
          stats.size += subStats.size;
          stats.fileCount += subStats.fileCount;
          if (subStats.lastModified && (!stats.lastModified || subStats.lastModified > stats.lastModified)) {
            stats.lastModified = subStats.lastModified;
          }
        } else if (entry.isFile()) {
          const fileStat = await fs.promises.stat(fullPath);
          stats.size += fileStat.size;
          stats.fileCount++;
          if (!stats.lastModified || fileStat.mtime > stats.lastModified) {
            stats.lastModified = fileStat.mtime;
          }
        }
      }
    } catch (error) {
      // Ignore errors for individual files/directories
    }

    return stats;
  }
}
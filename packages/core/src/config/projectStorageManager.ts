/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getProjectFolderName } from '../utils/paths.js';

export interface ProjectMetadata {
  projectId: string;
  projectPath: string;
  createdAt: string;
  lastAccessed: string;
  displayName?: string;
  description?: string;
  version?: string;
}

export interface ProjectStorageStructure {
  projectRoot: string;
  projectId: string;
  storageRoot: string;
  ragStorage: string;
  knowledgeGraphStorage: string;
  metadataFile: string;
}

/**
 * ProjectStorageManager handles project identification and standardized storage structure
 * 
 * Storage structure:
 * ~/.gemini/projects/{project-id}/
 * ├── project_meta.json          # Project metadata
 * ├── rag/{provider}/            # RAG provider storage
 * │   ├── lightrag/
 * │   ├── llamaindex/
 * │   └── custom/
 * └── knowledge-graph/{provider}/ # Knowledge graph provider storage
 *     ├── graphology/
 *     ├── neo4j/
 *     └── networkx/
 */
export class ProjectStorageManager {
  private readonly globalStorageRoot: string;
  private readonly projectRoot: string;
  private readonly projectId: string;
  private cachedMetadata: ProjectMetadata | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.projectId = getProjectFolderName(this.projectRoot);
    this.globalStorageRoot = path.join(os.homedir(), '.gemini', 'Projects');
  }

  /**
   * Get the project ID based on absolute path
   */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Get the project root path
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Get the complete storage structure for this project
   */
  getStorageStructure(): ProjectStorageStructure {
    const storageRoot = path.join(this.globalStorageRoot, this.projectId);
    
    return {
      projectRoot: this.projectRoot,
      projectId: this.projectId,
      storageRoot,
      ragStorage: path.join(storageRoot, 'rag'),
      knowledgeGraphStorage: path.join(storageRoot, 'knowledge-graph'),
      metadataFile: path.join(storageRoot, 'project_meta.json'),
    };
  }

  /**
   * Initialize the storage structure for this project
   */
  async initializeStorage(): Promise<void> {
    const structure = this.getStorageStructure();

    try {
      // Create main storage directory
      await fs.promises.mkdir(structure.storageRoot, { recursive: true });

      // Create only Neo4j directories (simplified RAG system)
      const neo4jDir = path.join(structure.knowledgeGraphStorage, 'neo4j');
      await fs.promises.mkdir(neo4jDir, { recursive: true });
      
      // Create graphology directory for local graph storage
      const graphologyDir = path.join(structure.knowledgeGraphStorage, 'graphology');
      await fs.promises.mkdir(graphologyDir, { recursive: true });

      // Create or update project metadata
      await this.updateMetadata();

    } catch (error) {
      console.error('[ProjectStorageManager] Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * Get project metadata
   */
  async getMetadata(): Promise<ProjectMetadata> {
    if (this.cachedMetadata) {
      return this.cachedMetadata;
    }

    const structure = this.getStorageStructure();

    try {
      if (fs.existsSync(structure.metadataFile)) {
        const metadataContent = await fs.promises.readFile(structure.metadataFile, 'utf-8');
        this.cachedMetadata = JSON.parse(metadataContent);
        
        // Update last accessed time
        if (this.cachedMetadata) {
          this.cachedMetadata.lastAccessed = new Date().toISOString();
          await this.saveMetadata(this.cachedMetadata);
        }
        
        return this.cachedMetadata!;
      }
    } catch (error) {
      console.warn('[ProjectStorageManager] Failed to load metadata:', error);
    }

    // Create default metadata if not found
    const defaultMetadata: ProjectMetadata = {
      projectId: this.projectId,
      projectPath: this.projectRoot,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      displayName: path.basename(this.projectRoot),
    };

    await this.saveMetadata(defaultMetadata);
    this.cachedMetadata = defaultMetadata;
    return defaultMetadata;
  }

  /**
   * Update project metadata
   */
  async updateMetadata(updates?: Partial<ProjectMetadata>): Promise<void> {
    const currentMetadata = await this.getMetadata();
    const updatedMetadata: ProjectMetadata = {
      ...currentMetadata,
      ...updates,
      lastAccessed: new Date().toISOString(),
    };

    await this.saveMetadata(updatedMetadata);
    this.cachedMetadata = updatedMetadata;
  }

  /**
   * Save metadata to file
   */
  private async saveMetadata(metadata: ProjectMetadata): Promise<void> {
    const structure = this.getStorageStructure();

    try {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(structure.metadataFile), { recursive: true });
      
      // Write metadata
      await fs.promises.writeFile(
        structure.metadataFile,
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[ProjectStorageManager] Failed to save metadata:', error);
      throw error;
    }
  }

  /**
   * Get storage path for a specific RAG provider
   */
  getRAGProviderPath(provider: string): string {
    const structure = this.getStorageStructure();
    return path.join(structure.ragStorage, provider);
  }

  /**
   * Get storage path for a specific knowledge graph provider
   */
  getKnowledgeGraphProviderPath(provider: string): string {
    const structure = this.getStorageStructure();
    return path.join(structure.knowledgeGraphStorage, provider);
  }

  /**
   * List all available RAG providers for this project
   */
  async getAvailableRAGProviders(): Promise<string[]> {
    const structure = this.getStorageStructure();
    
    try {
      if (!fs.existsSync(structure.ragStorage)) {
        return [];
      }

      const entries = await fs.promises.readdir(structure.ragStorage, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      console.warn('[ProjectStorageManager] Failed to list RAG providers:', error);
      return [];
    }
  }

  /**
   * List all available knowledge graph providers for this project
   */
  async getAvailableKnowledgeGraphProviders(): Promise<string[]> {
    const structure = this.getStorageStructure();
    
    try {
      if (!fs.existsSync(structure.knowledgeGraphStorage)) {
        return [];
      }

      const entries = await fs.promises.readdir(structure.knowledgeGraphStorage, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      console.warn('[ProjectStorageManager] Failed to list knowledge graph providers:', error);
      return [];
    }
  }

  /**
   * Check if storage is initialized for this project
   */
  isStorageInitialized(): boolean {
    const structure = this.getStorageStructure();
    return fs.existsSync(structure.storageRoot) && fs.existsSync(structure.metadataFile);
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalSize: number;
    ragSize: number;
    knowledgeGraphSize: number;
    fileCount: number;
  }> {
    const structure = this.getStorageStructure();
    
    const stats = {
      totalSize: 0,
      ragSize: 0,
      knowledgeGraphSize: 0,
      fileCount: 0,
    };

    try {
      if (fs.existsSync(structure.storageRoot)) {
        stats.totalSize = await this.getDirectorySize(structure.storageRoot);
        stats.fileCount = await this.getFileCount(structure.storageRoot);
      }

      if (fs.existsSync(structure.ragStorage)) {
        stats.ragSize = await this.getDirectorySize(structure.ragStorage);
      }

      if (fs.existsSync(structure.knowledgeGraphStorage)) {
        stats.knowledgeGraphSize = await this.getDirectorySize(structure.knowledgeGraphStorage);
      }
    } catch (error) {
      console.warn('[ProjectStorageManager] Failed to get storage stats:', error);
    }

    return stats;
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.promises.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Ignore errors for individual files/directories
    }

    return totalSize;
  }

  /**
   * Count files recursively
   */
  private async getFileCount(dirPath: string): Promise<number> {
    let fileCount = 0;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          fileCount += await this.getFileCount(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
        }
      }
    } catch (error) {
      // Ignore errors for individual files/directories
    }

    return fileCount;
  }

  /**
   * Clean up old or unused storage
   */
  async cleanupStorage(options?: {
    removeEmptyDirectories?: boolean;
    removeOldFiles?: boolean;
    maxAge?: number; // in days
  }): Promise<void> {
    const structure = this.getStorageStructure();
    const opts = {
      removeEmptyDirectories: true,
      removeOldFiles: false,
      maxAge: 30,
      ...options,
    };

    try {
      if (opts.removeEmptyDirectories) {
        await this.removeEmptyDirectories(structure.storageRoot);
      }

      if (opts.removeOldFiles && opts.maxAge > 0) {
        const maxAgeMs = opts.maxAge * 24 * 60 * 60 * 1000;
        await this.removeOldFiles(structure.storageRoot, maxAgeMs);
      }
    } catch (error) {
      console.warn('[ProjectStorageManager] Failed to cleanup storage:', error);
    }
  }

  /**
   * Remove empty directories recursively
   */
  private async removeEmptyDirectories(dirPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);
          await this.removeEmptyDirectories(fullPath);

          // Try to remove directory if it's empty
          try {
            await fs.promises.rmdir(fullPath);
          } catch {
            // Directory not empty, ignore
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Remove files older than specified age
   */
  private async removeOldFiles(dirPath: string, maxAgeMs: number): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.removeOldFiles(fullPath, maxAgeMs);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const age = now - stats.mtime.getTime();

            if (age > maxAgeMs) {
              await fs.promises.unlink(fullPath);
            }
          } catch {
            // Ignore errors for individual files
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Clear cached metadata
   */
  clearCache(): void {
    this.cachedMetadata = null;
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectStorageManager } from './projectStorageManager.js';
import { getProjectFolderName } from '../utils/paths.js';

export interface MigrationResult {
  success: boolean;
  migratedProjects: number;
  errors: string[];
  backupPath?: string;
  skippedFiles: string[];
}

export interface MigrationOptions {
  createBackup?: boolean;
  dryRun?: boolean;
  forceOverwrite?: boolean;
  validateAfterMigration?: boolean;
}

/**
 * StorageMigration handles migration from legacy ~/.gemini/ structure
 * to the new modular project-based storage structure.
 * 
 * Legacy structure:
 * ~/.gemini/
 * ├── config.json
 * ├── models.json
 * ├── openai.json
 * ├── memories/
 * ├── todos/
 * └── [project-specific data mixed in]
 * 
 * New structure:
 * ~/.gemini/
 * ├── config.json (global)
 * ├── models.json (global)
 * ├── openai.json (global)
 * ├── globalrules/
 * ├── memories/ (global)
 * └── projects/{project-id}/
 *     ├── project_meta.json
 *     ├── rag/{provider}/
 *     ├── knowledge-graph/{provider}/
 *     └── memories/ (project-specific)
 */
export class StorageMigration {
  private readonly geminiDir: string;
  private readonly projectsDir: string;
  private readonly backupDir: string;

  constructor() {
    this.geminiDir = path.join(os.homedir(), '.gemini');
    this.projectsDir = path.join(this.geminiDir, 'projects');
    this.backupDir = path.join(this.geminiDir, 'backups');
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if legacy structure exists
      if (!fs.existsSync(this.geminiDir)) {
        return false;
      }

      // Check if new structure already exists
      if (fs.existsSync(this.projectsDir)) {
        // Migration might have been partially completed
        const projectEntries = await fs.promises.readdir(this.projectsDir);
        return projectEntries.length === 0; // Empty projects dir means incomplete migration
      }

      // Check for legacy project-specific data that needs migration
      const entries = await fs.promises.readdir(this.geminiDir);
      const hasLegacyData = entries.some(entry => {
        const fullPath = path.join(this.geminiDir, entry);
        const stat = fs.statSync(fullPath);
        
        // Skip global config files and new structure directories
        if (['config.json', 'models.json', 'openai.json', 'globalrules', 'memories', 'projects', 'backups'].includes(entry)) {
          return false;
        }
        
        // Look for directories that might contain project-specific data
        return stat.isDirectory();
      });

      return hasLegacyData;
    } catch (error) {
      console.warn('[StorageMigration] Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Perform the migration
   */
  async migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
    const opts = {
      createBackup: true,
      dryRun: false,
      forceOverwrite: false,
      validateAfterMigration: true,
      ...options,
    };

    const result: MigrationResult = {
      success: false,
      migratedProjects: 0,
      errors: [],
      skippedFiles: [],
    };

    try {
      console.log('[StorageMigration] Starting storage migration...');

      // Check if migration is needed
      const migrationNeeded = await this.isMigrationNeeded();
      if (!migrationNeeded) {
        console.log('[StorageMigration] No migration needed');
        result.success = true;
        return result;
      }

      // Create backup if requested
      if (opts.createBackup && !opts.dryRun) {
        result.backupPath = await this.createBackup();
        console.log(`[StorageMigration] Backup created at: ${result.backupPath}`);
      }

      // Ensure new structure directories exist
      if (!opts.dryRun) {
        await this.ensureNewStructure();
      }

      // Migrate global configuration files
      await this.migrateGlobalConfig(opts, result);

      // Migrate project-specific data
      await this.migrateProjectData(opts, result);

      // Validate migration if requested
      if (opts.validateAfterMigration && !opts.dryRun) {
        const validationResult = await this.validateMigration();
        if (!validationResult.valid) {
          result.errors.push(...validationResult.errors);
          result.success = false;
          return result;
        }
      }

      result.success = true;
      console.log(`[StorageMigration] Migration completed successfully. Migrated ${result.migratedProjects} projects.`);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      console.error('[StorageMigration] Migration failed:', error);
    }

    return result;
  }

  /**
   * Create backup of existing structure
   */
  private async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `migration-backup-${timestamp}`);

    await fs.promises.mkdir(this.backupDir, { recursive: true });
    await this.copyDirectory(this.geminiDir, backupPath, ['backups']); // Exclude backups directory itself

    return backupPath;
  }

  /**
   * Ensure new directory structure exists
   */
  private async ensureNewStructure(): Promise<void> {
    const directories = [
      this.projectsDir,
      path.join(this.geminiDir, 'globalrules'),
      path.join(this.geminiDir, 'memories'),
    ];

    for (const dir of directories) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Migrate global configuration files
   */
  private async migrateGlobalConfig(options: MigrationOptions, result: MigrationResult): Promise<void> {
    const globalFiles = ['config.json', 'models.json', 'openai.json'];

    for (const file of globalFiles) {
      const sourcePath = path.join(this.geminiDir, file);
      
      if (fs.existsSync(sourcePath)) {
        try {
          // Global config files should already be in the right place
          // Just validate they're properly formatted
          if (!options.dryRun) {
            const content = await fs.promises.readFile(sourcePath, 'utf-8');
            JSON.parse(content); // Validate JSON
          }
          
          console.log(`[StorageMigration] Global config file validated: ${file}`);
        } catch (error) {
          result.errors.push(`Failed to validate global config ${file}: ${error}`);
        }
      }
    }
  }

  /**
   * Migrate project-specific data
   */
  private async migrateProjectData(options: MigrationOptions, result: MigrationResult): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.geminiDir);

      for (const entry of entries) {
        const entryPath = path.join(this.geminiDir, entry);
        const stat = await fs.promises.stat(entryPath);

        // Skip global files and new structure directories
        if (['config.json', 'models.json', 'openai.json', 'globalrules', 'memories', 'projects', 'backups'].includes(entry)) {
          continue;
        }

        if (stat.isDirectory()) {
          await this.migrateProjectDirectory(entry, entryPath, options, result);
        } else {
          // Handle orphaned files
          result.skippedFiles.push(entry);
          console.warn(`[StorageMigration] Skipping orphaned file: ${entry}`);
        }
      }
    } catch (error) {
      result.errors.push(`Failed to migrate project data: ${error}`);
    }
  }

  /**
   * Migrate a project directory
   */
  private async migrateProjectDirectory(
    dirName: string,
    dirPath: string,
    options: MigrationOptions,
    result: MigrationResult
  ): Promise<void> {
    try {
      // Try to determine if this is a project directory
      const projectPath = await this.inferProjectPath(dirName, dirPath);
      
      if (!projectPath) {
        result.skippedFiles.push(dirName);
        console.warn(`[StorageMigration] Could not determine project path for directory: ${dirName}`);
        return;
      }

      const projectId = getProjectFolderName(projectPath);
      const targetProjectDir = path.join(this.projectsDir, projectId);

      console.log(`[StorageMigration] Migrating project: ${dirName} -> ${projectId}`);

      if (!options.dryRun) {
        // Create project storage structure
        const storageManager = new ProjectStorageManager(projectPath);
        await storageManager.initializeStorage();

        // Copy project data
        await this.copyProjectData(dirPath, targetProjectDir);

        // Update project metadata
        await storageManager.updateMetadata({
          displayName: dirName,
          description: `Migrated from legacy storage: ${dirName}`,
        });
      }

      result.migratedProjects++;
    } catch (error) {
      result.errors.push(`Failed to migrate project ${dirName}: ${error}`);
    }
  }

  /**
   * Infer project path from directory name or contents
   */
  private async inferProjectPath(dirName: string, dirPath: string): Promise<string | null> {
    try {
      // Check if there's a project metadata file
      const metadataPath = path.join(dirPath, 'project_meta.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
        if (metadata.projectPath) {
          return metadata.projectPath;
        }
      }

      // Try to infer from directory name (reverse of getProjectFolderName)
      const inferredPath = this.reverseProjectFolderName(dirName);
      if (inferredPath && fs.existsSync(inferredPath)) {
        return inferredPath;
      }

      // Fallback: use current working directory with directory name
      const fallbackPath = path.join(process.cwd(), dirName);
      return fallbackPath;
    } catch (error) {
      console.warn(`[StorageMigration] Error inferring project path for ${dirName}:`, error);
      return null;
    }
  }

  /**
   * Reverse the project folder name transformation
   */
  private reverseProjectFolderName(folderName: string): string {
    // This is a best-effort reverse transformation
    let path = folderName.replace(/-/g, '/');
    
    // Add leading slash for Unix-like paths
    if (!path.startsWith('/') && process.platform !== 'win32') {
      path = '/' + path;
    }
    
    // Handle Windows drive letters
    if (process.platform === 'win32' && path.match(/^[a-zA-Z]-/)) {
      path = path.replace(/^([a-zA-Z])-/, '$1:/');
    }
    
    return path;
  }

  /**
   * Copy project data to new structure
   */
  private async copyProjectData(sourcePath: string, targetPath: string): Promise<void> {
    await fs.promises.mkdir(targetPath, { recursive: true });

    const entries = await fs.promises.readdir(sourcePath);

    for (const entry of entries) {
      const sourceFile = path.join(sourcePath, entry);
      const targetFile = path.join(targetPath, entry);
      const stat = await fs.promises.stat(sourceFile);

      if (stat.isDirectory()) {
        await this.copyDirectory(sourceFile, targetFile);
      } else if (stat.isFile()) {
        await fs.promises.copyFile(sourceFile, targetFile);
      }
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string, excludeDirs: string[] = []): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });

    const entries = await fs.promises.readdir(source);

    for (const entry of entries) {
      if (excludeDirs.includes(entry)) {
        continue;
      }

      const sourceFile = path.join(source, entry);
      const targetFile = path.join(target, entry);
      const stat = await fs.promises.stat(sourceFile);

      if (stat.isDirectory()) {
        await this.copyDirectory(sourceFile, targetFile, excludeDirs);
      } else if (stat.isFile()) {
        await fs.promises.copyFile(sourceFile, targetFile);
      }
    }
  }

  /**
   * Validate migration results
   */
  private async validateMigration(): Promise<{ valid: boolean; errors: string[] }> {
    const result = { valid: true, errors: [] as string[] };

    try {
      // Check if projects directory exists and has content
      if (!fs.existsSync(this.projectsDir)) {
        result.valid = false;
        result.errors.push('Projects directory was not created');
        return result;
      }

      const projectEntries = await fs.promises.readdir(this.projectsDir);
      if (projectEntries.length === 0) {
        console.warn('[StorageMigration] No projects were migrated');
      }

      // Validate each migrated project
      for (const projectId of projectEntries) {
        const projectPath = path.join(this.projectsDir, projectId);
        const metadataPath = path.join(projectPath, 'project_meta.json');

        if (!fs.existsSync(metadataPath)) {
          result.errors.push(`Project ${projectId} missing metadata file`);
          continue;
        }

        try {
          const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
          if (!metadata.projectId || !metadata.createdAt) {
            result.errors.push(`Project ${projectId} has invalid metadata`);
          }
        } catch (error) {
          result.errors.push(`Project ${projectId} has corrupted metadata: ${error}`);
        }
      }

      if (result.errors.length > 0) {
        result.valid = false;
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation error: ${error}`);
    }

    return result;
  }

  /**
   * Rollback migration using backup
   */
  async rollback(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[StorageMigration] Rolling back migration from backup: ${backupPath}`);

      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup path does not exist' };
      }

      // Remove current .gemini directory
      if (fs.existsSync(this.geminiDir)) {
        await fs.promises.rm(this.geminiDir, { recursive: true, force: true });
      }

      // Restore from backup
      await this.copyDirectory(backupPath, this.geminiDir);

      console.log('[StorageMigration] Rollback completed successfully');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[StorageMigration] Rollback failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Clean up old backup files
   */
  async cleanupBackups(maxAge: number = 30): Promise<void> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return;
      }

      const entries = await fs.promises.readdir(this.backupDir);
      const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const entry of entries) {
        const backupPath = path.join(this.backupDir, entry);
        const stat = await fs.promises.stat(backupPath);

        if (stat.isDirectory() && (now - stat.mtime.getTime()) > maxAgeMs) {
          await fs.promises.rm(backupPath, { recursive: true, force: true });
          console.log(`[StorageMigration] Cleaned up old backup: ${entry}`);
        }
      }
    } catch (error) {
      console.warn('[StorageMigration] Error cleaning up backups:', error);
    }
  }
}
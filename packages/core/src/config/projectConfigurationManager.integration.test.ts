/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectConfigurationManager } from './projectConfigurationManager.js';
import { Config } from './config.js';

describe('ProjectConfigurationManager Integration Tests', () => {
  let tempDir: string;
  let tempGlobalDir: string;
  let configManager: ProjectConfigurationManager;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-config-test-'));
    tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-config-test-'));
    
    // Create .gemini directories
    const projectGeminiDir = path.join(tempDir, '.gemini');
    const globalGeminiDir = path.join(tempGlobalDir, '.gemini');
    
    fs.mkdirSync(projectGeminiDir, { recursive: true });
    fs.mkdirSync(globalGeminiDir, { recursive: true });
    
    configManager = new ProjectConfigurationManager(tempDir);
    
    // Mock os.homedir to return our temp global directory
    const originalHomedir = os.homedir;
    os.homedir = () => tempGlobalDir;
    
    // Store original for cleanup
    (configManager as any).originalHomedir = originalHomedir;
  });

  afterEach(() => {
    // Restore original homedir
    if ((configManager as any).originalHomedir) {
      os.homedir = (configManager as any).originalHomedir;
    }
    
    // Clean up temporary directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempGlobalDir)) {
      fs.rmSync(tempGlobalDir, { recursive: true, force: true });
    }
  });

  describe('Real filesystem integration', () => {
    it('should create and load configuration files from filesystem', async () => {
      // Create default configuration
      await configManager.createDefaultConfiguration('global');
      await configManager.createDefaultConfiguration('project');

      // Load configuration
      const config = await configManager.loadConfiguration();

      // Verify configuration was loaded correctly
      expect(config.models?.defaultModel).toBe('gemini-1.5-flash');
      expect(config.models?.priority).toEqual(['gemini-1.5-flash', 'gemini-1.5-pro', 'gpt-4']);
      expect(config.config?.debugMode).toBe(false);
      expect(config.config?.telemetry?.enabled).toBe(true);
    });

    it('should handle project-level overrides correctly', async () => {
      // Create global configuration
      await configManager.createDefaultConfiguration('global');

      // Create project-specific overrides
      const projectGeminiDir = path.join(tempDir, '.gemini');
      const projectModelsPath = path.join(projectGeminiDir, 'models.json');
      const projectConfigPath = path.join(projectGeminiDir, 'config.json');

      fs.writeFileSync(projectModelsPath, JSON.stringify({
        defaultModel: 'gpt-4',
        priority: ['gpt-4', 'claude-3'],
      }, null, 2));

      fs.writeFileSync(projectConfigPath, JSON.stringify({
        debugMode: true,
        telemetry: { enabled: false },
      }, null, 2));

      // Load configuration
      const config = await configManager.loadConfiguration();

      // Verify project overrides take precedence
      expect(config.models?.defaultModel).toBe('gpt-4');
      expect(config.models?.priority).toEqual(['gpt-4', 'claude-3']);
      expect(config.config?.debugMode).toBe(true);
      expect(config.config?.telemetry?.enabled).toBe(false);
      
      // Verify global values are preserved where not overridden
      expect(config.models?.fallback).toBe('gemini-1.5-flash'); // From global
    });

    it('should handle missing configuration files gracefully', async () => {
      // Don't create any configuration files
      const config = await configManager.loadConfiguration();

      // Should return empty configuration without errors
      expect(config).toEqual({});
    });

    it('should validate configuration paths correctly', () => {
      const paths = configManager.getConfigurationPaths();

      expect(paths.global).toBe(path.join(tempGlobalDir, '.gemini'));
      expect(paths.project).toBe(path.join(tempDir, '.gemini'));
      expect(paths.globalExists).toBe(true); // We created it in beforeEach
      expect(paths.projectExists).toBe(true); // We created it in beforeEach
    });

    it('should cache configuration for performance', async () => {
      // Create configuration
      await configManager.createDefaultConfiguration('global');

      // First load
      const startTime1 = Date.now();
      const config1 = await configManager.loadConfiguration();
      const duration1 = Date.now() - startTime1;

      // Second load (should be cached)
      const startTime2 = Date.now();
      const config2 = await configManager.loadConfiguration();
      const duration2 = Date.now() - startTime2;

      // Verify same configuration
      expect(config1).toEqual(config2);
      
      // Second load should be significantly faster (cached)
      expect(duration2).toBeLessThan(duration1);
    });

    it('should clear cache and reload configuration', async () => {
      // Create initial configuration
      await configManager.createDefaultConfiguration('global');
      
      // Load configuration
      const config1 = await configManager.loadConfiguration();
      expect(config1.models?.defaultModel).toBe('gemini-1.5-flash');

      // Modify configuration file
      const globalModelsPath = path.join(tempGlobalDir, '.gemini', 'models.json');
      const modifiedConfig = {
        defaultModel: 'gpt-4',
        priority: ['gpt-4'],
        fallback: 'gpt-4',
      };
      fs.writeFileSync(globalModelsPath, JSON.stringify(modifiedConfig, null, 2));

      // Clear cache and reload
      configManager.clearCache();
      const config2 = await configManager.loadConfiguration();

      // Verify configuration was reloaded
      expect(config2.models?.defaultModel).toBe('gpt-4');
      expect(config2.models?.priority).toEqual(['gpt-4']);
    });
  });

  describe('Integration with existing Config class', () => {
    it('should work alongside existing Config class without conflicts', async () => {
      // Create configuration using ProjectConfigurationManager
      await configManager.createDefaultConfiguration('global');
      const projectConfig = await configManager.loadConfiguration();

      // Verify we can still create Config instances
      // (This tests that we don't break existing functionality)
      const config = new Config({
        sessionId: 'test-session',
        targetDir: tempDir,
        debugMode: false,
        cwd: tempDir,
        model: 'gemini-1.5-flash',
      });

      expect(config.getSessionId()).toBe('test-session');
      expect(config.getTargetDir()).toBe(tempDir);
      expect(config.getDebugMode()).toBe(false);
      
      // Verify ProjectConfigurationManager loaded configuration correctly
      expect(projectConfig.models?.defaultModel).toBe('gemini-1.5-flash');
    });
  });

  describe('Error handling and recovery', () => {
    it('should handle corrupted configuration files', async () => {
      // Create corrupted configuration file
      const globalGeminiDir = path.join(tempGlobalDir, '.gemini');
      const corruptedModelsPath = path.join(globalGeminiDir, 'models.json');
      
      fs.writeFileSync(corruptedModelsPath, '{ invalid json content');

      // Should handle gracefully and return empty configuration
      const config = await configManager.loadConfiguration();
      expect(config).toEqual({});
    });

    it('should handle permission errors gracefully', async () => {
      // Create configuration file with restricted permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        const globalGeminiDir = path.join(tempGlobalDir, '.gemini');
        const restrictedModelsPath = path.join(globalGeminiDir, 'models.json');
        
        fs.writeFileSync(restrictedModelsPath, '{}');
        fs.chmodSync(restrictedModelsPath, 0o000); // No permissions

        // Should handle gracefully
        const config = await configManager.loadConfiguration();
        expect(config).toEqual({});

        // Restore permissions for cleanup
        fs.chmodSync(restrictedModelsPath, 0o644);
      }
    });
  });
});
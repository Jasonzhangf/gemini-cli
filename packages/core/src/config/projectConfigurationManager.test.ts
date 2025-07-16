/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectConfigurationManager, ProjectConfiguration, ModelConfiguration, OpenAIConfiguration, GeneralConfiguration } from './projectConfigurationManager.js';

// Mock filesystem operations
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  };
});

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('ProjectConfigurationManager', () => {
  let configManager: ProjectConfigurationManager;
  const testProjectDir = '/test/project';
  const globalConfigDir = '/home/testuser/.gemini';
  const projectConfigDir = '/test/project/.gemini';

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ProjectConfigurationManager(testProjectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      const paths = configManager.getConfigurationPaths();
      expect(paths.global).toBe(globalConfigDir);
      expect(paths.project).toBe(projectConfigDir);
    });
  });

  describe('loadConfiguration', () => {
    it('should load and merge global and project configurations', async () => {
      // Mock file existence
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('models.json') || filePath.includes('config.json');
      });

      // Mock file reading
      vi.mocked(fs.promises.readFile).mockImplementation(async (filePath: string) => {
        if (filePath.includes('models.json')) {
          if (filePath.includes('/test/project/.gemini/')) {
            // Project-level models.json
            return JSON.stringify({
              defaultModel: 'gpt-4',
              priority: ['gpt-4', 'gemini-1.5-flash'],
            });
          } else {
            // Global models.json
            return JSON.stringify({
              defaultModel: 'gemini-1.5-flash',
              priority: ['gemini-1.5-flash', 'gemini-1.5-pro'],
              fallback: 'gemini-1.5-flash',
            });
          }
        }
        if (filePath.includes('config.json')) {
          return JSON.stringify({
            debugMode: true,
            telemetry: { enabled: false },
          });
        }
        return '{}';
      });

      const config = await configManager.loadConfiguration();

      expect(config.models?.defaultModel).toBe('gpt-4'); // Project overrides global
      expect(config.models?.priority).toEqual(['gpt-4', 'gemini-1.5-flash']);
      expect(config.models?.fallback).toBe('gemini-1.5-flash'); // From global
      expect(config.config?.debugMode).toBe(true);
    });

    it('should handle missing configuration files gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = await configManager.loadConfiguration();

      expect(config).toEqual({});
    });

    it('should validate configuration and throw on errors', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('models.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        priority: 'invalid', // Should be array
      }));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Configuration validation failed');
    });

    it('should cache configuration for performance', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

      // First call
      await configManager.loadConfiguration();
      expect(vi.mocked(fs.promises.readFile)).toHaveBeenCalled();

      // Reset mock call count
      vi.mocked(fs.promises.readFile).mockClear();

      // Second call should use cache
      await configManager.loadConfiguration();
      expect(vi.mocked(fs.promises.readFile)).not.toHaveBeenCalled();
    });
  });

  describe('configuration merging', () => {
    it('should merge nested objects correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockImplementation(async (filePath: string) => {
        if (filePath.includes('/home/testuser/.gemini/')) {
          // Global config
          return JSON.stringify({
            telemetry: { enabled: true, target: 'clearcut' },
            analysis: { mode: 'static', timeout: 30000 },
          });
        } else if (filePath.includes('/test/project/.gemini/')) {
          // Project config
          return JSON.stringify({
            telemetry: { enabled: false }, // Override enabled, keep target
            analysis: { mode: 'llm' }, // Override mode, keep timeout
          });
        }
        return '{}';
      });

      const config = await configManager.loadConfiguration();

      expect(config.config?.telemetry?.enabled).toBe(false);
      expect(config.config?.telemetry?.target).toBe('clearcut');
      expect(config.config?.analysis?.mode).toBe('llm');
      expect(config.config?.analysis?.timeout).toBe(30000);
    });

    it('should merge provider configurations correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockImplementation(async (filePath: string) => {
        if (filePath.includes('/home/testuser/.gemini/')) {
          // Global models.json
          return JSON.stringify({
            providers: {
              gemini: { enabled: true, priority: 1 },
              openai: { enabled: false, priority: 2 },
            },
          });
        } else if (filePath.includes('/test/project/.gemini/')) {
          // Project models.json
          return JSON.stringify({
            providers: {
              openai: { enabled: true, apiKey: 'project-key' },
              anthropic: { enabled: true, priority: 3 },
            },
          });
        }
        return '{}';
      });

      const config = await configManager.loadConfiguration();

      expect(config.models?.providers?.gemini).toEqual({ enabled: true, priority: 1 });
      expect(config.models?.providers?.openai).toEqual({ enabled: true, apiKey: 'project-key' });
      expect(config.models?.providers?.anthropic).toEqual({ enabled: true, priority: 3 });
    });
  });

  describe('configuration validation', () => {
    it('should validate model priority as array', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('models.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        priority: 'not-an-array',
      }));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Priority must be an array');
    });

    it('should validate analysis mode values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('config.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        analysis: { mode: 'invalid-mode' },
      }));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Analysis mode must be one of');
    });

    it('should validate approval mode values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('config.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        approvalMode: 'invalid-mode',
      }));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Approval mode must be one of');
    });

    it('should validate timeout as positive number', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('config.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        analysis: { timeout: -1000 },
      }));

      await expect(configManager.loadConfiguration()).rejects.toThrow('timeout must be a positive number');
    });

    it('should warn about invalid URLs but not fail', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('openai.json');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
        baseURL: 'not-a-valid-url',
      }));

      const config = await configManager.loadConfiguration();
      
      expect(config.openai?.baseURL).toBe('not-a-valid-url');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration warnings'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('createDefaultConfiguration', () => {
    it('should create default global configuration', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await configManager.createDefaultConfiguration('global');

      expect(vi.mocked(fs.promises.mkdir)).toHaveBeenCalledWith(globalConfigDir, { recursive: true });
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledTimes(2); // models.json and config.json
    });

    it('should create default project configuration', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await configManager.createDefaultConfiguration('project');

      expect(vi.mocked(fs.promises.mkdir)).toHaveBeenCalledWith(projectConfigDir, { recursive: true });
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledTimes(2);
    });

    it('should not overwrite existing configuration files', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath.includes('.json'); // Simulate existing files
      });
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await configManager.createDefaultConfiguration('global');

      expect(vi.mocked(fs.promises.writeFile)).not.toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue('{}');

      // Load configuration to populate cache
      await configManager.loadConfiguration();
      vi.mocked(fs.promises.readFile).mockClear();

      // Clear cache
      configManager.clearCache();

      // Next load should read from filesystem again
      await configManager.loadConfiguration();
      expect(vi.mocked(fs.promises.readFile)).toHaveBeenCalled();
    });
  });

  describe('getConfigurationPaths', () => {
    it('should return correct paths and existence status', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        return filePath === globalConfigDir;
      });

      const paths = configManager.getConfigurationPaths();

      expect(paths.global).toBe(globalConfigDir);
      expect(paths.project).toBe(projectConfigDir);
      expect(paths.globalExists).toBe(true);
      expect(paths.projectExists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue('invalid-json');

      const config = await configManager.loadConfiguration();

      expect(config).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('[ProjectConfigurationManager] Error loading global configuration:', expect.any(SyntaxError));
      
      consoleSpy.mockRestore();
    });

    it('should handle file system errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('File system error'));

      const config = await configManager.loadConfiguration();

      expect(config).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('[ProjectConfigurationManager] Error loading global configuration:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});
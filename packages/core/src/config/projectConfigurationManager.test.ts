/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { ProjectConfigurationManager } from './projectConfigurationManager.js';

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
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const path = String(filePath);
        return path.includes('models.json') || path.includes('config.json');
      });

      // Mock file reading
      vi.mocked(fs.promises.readFile).mockImplementation(async (filePath: any) => {
        const path = String(filePath);
        if (path.includes('models.json')) {
          if (path.includes('/test/project/.gemini/')) {
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
        if (path.includes('config.json')) {
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
  });
});
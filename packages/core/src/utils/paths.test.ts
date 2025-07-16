/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getProjectFolderName } from './paths.js';

describe('getProjectFolderName', () => {
  it('should convert Unix paths correctly', () => {
    expect(getProjectFolderName('/home/user/projects/my-app')).toBe('home-user-projects-my-app');
    expect(getProjectFolderName('/Users/john/Documents/workspace/gemini-cli')).toBe('Users-john-Documents-workspace-gemini-cli');
    expect(getProjectFolderName('/var/www/html')).toBe('var-www-html');
  });

  it('should handle Windows paths correctly', () => {
    // Mock Windows platform
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    
    try {
      expect(getProjectFolderName('C:\\Users\\john\\Documents\\projects\\my-app')).toBe('Users-john-Documents-projects-my-app');
      expect(getProjectFolderName('D:\\workspace\\gemini-cli')).toBe('workspace-gemini-cli');
      expect(getProjectFolderName('C:\\Program Files\\MyApp')).toBe('Program_Files-MyApp');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('should handle special characters', () => {
    expect(getProjectFolderName('/home/user/My Project with spaces')).toBe('home-user-My_Project_with_spaces');
    expect(getProjectFolderName('/home/user/project.with.dots')).toBe('home-user-project.with.dots');
    expect(getProjectFolderName('/home/user/project-with-dashes')).toBe('home-user-project-with-dashes');
  });

  it('should handle root directory', () => {
    expect(getProjectFolderName('/')).toBe('root');
    expect(getProjectFolderName('/.')).toBe('root');
  });

  it('should handle current directory', () => {
    const cwd = process.cwd();
    const result = getProjectFolderName(cwd);
    expect(result).toBeTruthy();
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
  });

  it('should handle long paths', () => {
    const longPath = '/very/long/path/that/has/many/segments/to/test/the/length/limitation/functionality/of/the/folder/name/generator/function/which/should/truncate/at/100/characters/maximum';
    const result = getProjectFolderName(longPath);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).not.toContain('/');
  });

  it('should handle paths with multiple consecutive slashes', () => {
    expect(getProjectFolderName('/home//user///projects////my-app')).toBe('home-user-projects-my-app');
  });

  it('should handle paths with trailing slashes', () => {
    expect(getProjectFolderName('/home/user/projects/my-app/')).toBe('home-user-projects-my-app');
    expect(getProjectFolderName('/home/user/projects/my-app///')).toBe('home-user-projects-my-app');
  });

  it('should create valid folder names', () => {
    const testPaths = [
      '/home/user/projects/my-app',
      '/Users/john/Documents/workspace/gemini-cli',
      '/var/www/html',
      '/opt/apps/my-service',
      '/tmp/test-project'
    ];

    testPaths.forEach(testPath => {
      const result = getProjectFolderName(testPath);
      
      // Should not contain invalid characters
      expect(result).not.toMatch(/[<>:"|?*]/);
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      
      // Should not be empty
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      
      // Should not start or end with dash
      expect(result).not.toMatch(/^-/);
      expect(result).not.toMatch(/-$/);
    });
  });
});

describe('RAG Storage Directory Examples', () => {
  it('should generate expected storage paths', () => {
    const testCases = [
      {
        projectRoot: '/Users/fanzhang/Documents/github/gemini-cli',
        expectedFolder: 'Users-fanzhang-Documents-github-gemini-cli',
        expectedPath: '/Users/fanzhang/.gemini/projects/Users-fanzhang-Documents-github-gemini-cli/rag'
      },
      {
        projectRoot: '/home/user/workspace/my-project',
        expectedFolder: 'home-user-workspace-my-project',
        expectedPath: '/home/user/.gemini/projects/home-user-workspace-my-project/rag'
      },
      {
        projectRoot: '/var/www/html/site',
        expectedFolder: 'var-www-html-site',
        expectedPath: '/var/www/.gemini/projects/var-www-html-site/rag'
      }
    ];

    testCases.forEach(({ projectRoot, expectedFolder }) => {
      const result = getProjectFolderName(projectRoot);
      expect(result).toBe(expectedFolder);
    });
  });
});
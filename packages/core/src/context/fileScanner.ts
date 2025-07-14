/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import ignore from 'ignore';

export interface FileScanOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  respectGitIgnore?: boolean;
  respectScanIgnore?: boolean;
  maxFiles?: number;
}

export interface ScanResult {
  files: string[];
  skippedCount: number;
  totalScanned: number;
}

/**
 * File Scanner for ContextAgent
 * Handles .gitignore and .scanignore rules for project file discovery
 */
export class FileScanner {
  private projectDir: string;
  private gitIgnore: ReturnType<typeof ignore> | null = null;
  private scanIgnore: ReturnType<typeof ignore> | null = null;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
  }

  /**
   * Initialize ignore rules from .gitignore and .scanignore
   */
  async initialize(): Promise<void> {
    // Load .gitignore
    try {
      const gitIgnorePath = path.join(this.projectDir, '.gitignore');
      const gitIgnoreContent = await fs.readFile(gitIgnorePath, 'utf-8');
      this.gitIgnore = ignore().add(gitIgnoreContent);
    } catch (error) {
      // .gitignore not found or not readable - continue without it
      this.gitIgnore = null;
    }

    // Load .scanignore
    try {
      const scanIgnorePath = path.join(this.projectDir, '.scanignore');
      const scanIgnoreContent = await fs.readFile(scanIgnorePath, 'utf-8');
      this.scanIgnore = ignore().add(scanIgnoreContent);
    } catch (error) {
      // .scanignore not found or not readable - continue without it
      this.scanIgnore = null;
    }

    // Add default ignore patterns for ContextAgent
    if (!this.scanIgnore) {
      this.scanIgnore = ignore();
    }
    
    // Default exclusions for ContextAgent scanning
    this.scanIgnore.add([
      'node_modules/**',
      '.git/**',
      '.gemini/**',
      'dist/**', 
      'build/**',
      'coverage/**',
      '.nyc_output/**',
      '*.log',
      '*.tmp',
      '.DS_Store',
      'Thumbs.db',
      '*.min.js',
      '*.min.css',
      '*.bundle.js',
      '*.bundle.css'
    ]);
  }

  /**
   * Scan project directory for files
   */
  async scanProject(options: FileScanOptions = {}): Promise<ScanResult> {
    const {
      includePatterns = ['**/*'],
      excludePatterns = [],
      respectGitIgnore = true,
      respectScanIgnore = true,
      maxFiles = 5000
    } = options;

    await this.initialize();

    const allFiles: string[] = [];
    let skippedCount = 0;
    let totalScanned = 0;

    // Use glob to find files matching include patterns
    for (const pattern of includePatterns) {
      const globOptions = {
        cwd: this.projectDir,
        absolute: false,
        nodir: true,
        dot: false // Don't include hidden files by default
      };

      const files = await glob(pattern, globOptions);
      
      for (const file of files) {
        totalScanned++;
        
        // Check if file should be ignored
        if (this.shouldIgnoreFile(file, respectGitIgnore, respectScanIgnore)) {
          skippedCount++;
          continue;
        }

        // Check exclude patterns
        if (this.matchesExcludePatterns(file, excludePatterns)) {
          skippedCount++;
          continue;
        }

        // Check file size and accessibility
        try {
          const filePath = path.join(this.projectDir, file);
          const stats = await fs.stat(filePath);
          
          // Skip very large files (> 1MB for now)
          if (stats.size > 1024 * 1024) {
            skippedCount++;
            continue;
          }

          // Skip non-text files by extension
          if (!this.isTextFile(file)) {
            skippedCount++;
            continue;
          }

          allFiles.push(file);

          // Respect max files limit
          if (allFiles.length >= maxFiles) {
            break;
          }
        } catch (error) {
          // File not accessible, skip it
          skippedCount++;
          continue;
        }
      }

      if (allFiles.length >= maxFiles) {
        break;
      }
    }

    return {
      files: allFiles.sort(),
      skippedCount,
      totalScanned
    };
  }

  /**
   * Check if file should be ignored based on .gitignore and .scanignore
   */
  private shouldIgnoreFile(
    relativePath: string, 
    respectGitIgnore: boolean, 
    respectScanIgnore: boolean
  ): boolean {
    // Always ignore .git directory and common build/cache directories
    if (relativePath.startsWith('.git/') || 
        relativePath.startsWith('node_modules/') ||
        relativePath.startsWith('.gemini/')) {
      return true;
    }

    // Check .scanignore first (has higher priority)
    if (respectScanIgnore && this.scanIgnore && this.scanIgnore.ignores(relativePath)) {
      return true;
    }

    // Check .gitignore
    if (respectGitIgnore && this.gitIgnore && this.gitIgnore.ignores(relativePath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if file matches any exclude patterns
   */
  private matchesExcludePatterns(file: string, excludePatterns: string[]): boolean {
    if (excludePatterns.length === 0) {
      return false;
    }

    // Use micromatch for pattern matching (if available)
    try {
      const micromatch = require('micromatch');
      return micromatch.isMatch(file, excludePatterns);
    } catch (error) {
      // Fallback to simple string matching
      return excludePatterns.some(pattern => file.includes(pattern));
    }
  }

  /**
   * Check if file is likely a text file based on extension
   */
  private isTextFile(filePath: string): boolean {
    const textExtensions = new Set([
      '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
      '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.vb', '.fs', '.go', '.rs', '.kt', '.swift',
      '.html', '.htm', '.xml', '.svg',
      '.css', '.scss', '.sass', '.less', '.styl',
      '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg',
      '.md', '.mdx', '.txt', '.rst', '.tex',
      '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
      '.sql', '.graphql', '.gql',
      '.dockerfile', '.dockerignore', '.gitignore', '.gitattributes',
      '.env', '.env.example', '.env.local', '.env.development', '.env.production',
      '.eslintrc', '.prettierrc', '.babelrc', '.tsconfig', '.jsconfig',
      '', // Files without extension (often config files)
    ]);

    const ext = path.extname(filePath).toLowerCase();
    
    // Special case for files without extension
    if (!ext) {
      const basename = path.basename(filePath).toLowerCase();
      const configFiles = new Set([
        'readme', 'license', 'changelog', 'authors', 'contributors',
        'makefile', 'dockerfile', 'gemfile', 'rakefile', 'gruntfile', 'gulpfile',
        'package', 'composer', 'requirements', 'setup', 'pipfile',
        '.gitignore', '.gitattributes', '.gitmodules', '.scanignore'
      ]);
      return configFiles.has(basename);
    }

    return textExtensions.has(ext);
  }

  /**
   * Get recommended .scanignore content for a project type
   */
  static getRecommendedScanIgnore(projectType?: string): string {
    const common = [
      '# ContextAgent scan ignore patterns',
      '# Binary and build artifacts',
      '*.exe',
      '*.dll',
      '*.so',
      '*.dylib',
      '*.a',
      '*.lib',
      '*.o',
      '*.obj',
      '',
      '# Package manager dependencies',
      'node_modules/',
      'vendor/',
      'target/',
      'build/',
      'dist/',
      'out/',
      '',
      '# IDE and editor files',
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '*~',
      '',
      '# Logs and temporary files',
      'logs/',
      '*.log',
      'tmp/',
      'temp/',
      '*.tmp',
      '*.temp',
      '',
      '# OS generated files',
      '.DS_Store',
      'Thumbs.db',
      '',
      '# Testing and coverage',
      'coverage/',
      '.nyc_output/',
      'test-results/',
      '',
      '# Large data files',
      '*.csv',
      '*.json',
      '*.xml',
      '# Exclude files larger than 100KB',
      '',
    ];

    const specific: Record<string, string[]> = {
      javascript: [
        '# JavaScript/Node.js specific',
        'package-lock.json',
        'yarn.lock',
        '.next/',
        '.nuxt/',
        '.cache/',
        'public/build/',
      ],
      python: [
        '# Python specific', 
        '__pycache__/',
        '*.pyc',
        '*.pyo',
        '*.pyd',
        '.pytest_cache/',
        '.tox/',
        'venv/',
        'env/',
        '.env/',
      ],
      java: [
        '# Java specific',
        '*.class',
        '*.jar',
        '*.war',
        'target/',
        '.gradle/',
        'gradle/',
      ],
    };

    const lines = [...common];
    
    if (projectType && specific[projectType]) {
      lines.push('');
      lines.push(...specific[projectType]);
    }

    return lines.join('\n') + '\n';
  }
}
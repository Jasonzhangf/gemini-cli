/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ProjectConfiguration {
  models?: ModelConfiguration;
  openai?: OpenAIConfiguration;
  config?: GeneralConfiguration;
}

export interface ModelConfiguration {
  defaultModel?: string;
  priority?: string[];
  fallback?: string;
  providers?: Record<string, ProviderConfiguration>;
}

export interface ProviderConfiguration {
  apiKey?: string;
  baseURL?: string;
  enabled?: boolean;
  priority?: number;
}

export interface OpenAIConfiguration {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  organization?: string;
  enabled?: boolean;
}

export interface GeneralConfiguration {
  debugMode?: boolean;
  telemetry?: {
    enabled?: boolean;
    target?: string;
    endpoint?: string;
  };
  analysis?: {
    mode?: 'static' | 'llm' | 'vector';
    timeout?: number;
    enableCache?: boolean;
  };
  rag?: {
    defaultProvider?: 'neo4j-graph-rag' | 'rag';
    enableHybridSearch?: boolean;
    disableTextMatching?: boolean;
  };
  approvalMode?: 'default' | 'autoEdit' | 'yolo';
  accessibility?: {
    disableLoadingPhrases?: boolean;
    useStatusBasedPhrases?: boolean;
  };
}

export interface ConfigurationValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * ProjectConfigurationManager handles hierarchical configuration loading
 * with project-level overrides taking precedence over global settings.
 * 
 * Configuration hierarchy (highest to lowest priority):
 * 1. ./.gemini/ (project-level)
 * 2. ~/.gemini/ (global)
 * 3. Default values
 */
export class ProjectConfigurationManager {
  private readonly projectDir: string;
  private readonly globalConfigDir: string;
  private readonly projectConfigDir: string;
  private cachedConfig: ProjectConfiguration | null = null;
  private lastLoadTime: number = 0;
  private readonly cacheTimeout: number = 5000; // 5 seconds

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
    this.globalConfigDir = path.join(os.homedir(), '.gemini');
    this.projectConfigDir = path.join(this.projectDir, '.gemini');
  }

  /**
   * Load and merge configuration from all sources
   */
  async loadConfiguration(): Promise<ProjectConfiguration> {
    const now = Date.now();
    
    // Return cached config if still valid
    if (this.cachedConfig && (now - this.lastLoadTime) < this.cacheTimeout) {
      return this.cachedConfig;
    }

    try {
      // Load configurations in order of precedence (lowest to highest)
      const globalConfig = await this.loadGlobalConfiguration();
      const projectConfig = await this.loadProjectConfiguration();

      // Merge configurations with project taking precedence
      const mergedConfig = this.mergeConfigurations(globalConfig, projectConfig);

      // Validate the merged configuration
      const validationErrors = this.validateConfiguration(mergedConfig);
      if (validationErrors.some(error => error.severity === 'error')) {
        throw new Error(`Configuration validation failed: ${validationErrors
          .filter(error => error.severity === 'error')
          .map(error => `${error.path}: ${error.message}`)
          .join(', ')}`);
      }

      // Log warnings
      const warnings = validationErrors.filter(error => error.severity === 'warning');
      if (warnings.length > 0) {
        console.warn('[ProjectConfigurationManager] Configuration warnings:');
        warnings.forEach(warning => {
          console.warn(`  ${warning.path}: ${warning.message}`);
        });
      }

      // Cache the result
      this.cachedConfig = mergedConfig;
      this.lastLoadTime = now;

      return mergedConfig;
    } catch (error) {
      console.error('[ProjectConfigurationManager] Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Load global configuration from ~/.gemini/
   */
  private async loadGlobalConfiguration(): Promise<ProjectConfiguration> {
    const config: ProjectConfiguration = {};

    try {
      // Load models.json
      const modelsPath = path.join(this.globalConfigDir, 'models.json');
      if (fs.existsSync(modelsPath)) {
        const modelsContent = await fs.promises.readFile(modelsPath, 'utf-8');
        config.models = JSON.parse(modelsContent);
      }

      // Load openai.json
      const openaiPath = path.join(this.globalConfigDir, 'openai.json');
      if (fs.existsSync(openaiPath)) {
        const openaiContent = await fs.promises.readFile(openaiPath, 'utf-8');
        config.openai = JSON.parse(openaiContent);
      }

      // Load config.json
      const configPath = path.join(this.globalConfigDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        config.config = JSON.parse(configContent);
      }

    } catch (error) {
      console.warn('[ProjectConfigurationManager] Error loading global configuration:', error);
    }

    return config;
  }

  /**
   * Load project-specific configuration from ./.gemini/
   */
  private async loadProjectConfiguration(): Promise<ProjectConfiguration> {
    const config: ProjectConfiguration = {};

    try {
      // Load models.json
      const modelsPath = path.join(this.projectConfigDir, 'models.json');
      if (fs.existsSync(modelsPath)) {
        const modelsContent = await fs.promises.readFile(modelsPath, 'utf-8');
        config.models = JSON.parse(modelsContent);
      }

      // Load openai.json
      const openaiPath = path.join(this.projectConfigDir, 'openai.json');
      if (fs.existsSync(openaiPath)) {
        const openaiContent = await fs.promises.readFile(openaiPath, 'utf-8');
        config.openai = JSON.parse(openaiContent);
      }

      // Load config.json
      const configPath = path.join(this.projectConfigDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        config.config = JSON.parse(configContent);
      }

    } catch (error) {
      console.warn('[ProjectConfigurationManager] Error loading project configuration:', error);
    }

    return config;
  }

  /**
   * Merge configurations with project taking precedence over global
   */
  private mergeConfigurations(
    global: ProjectConfiguration,
    project: ProjectConfiguration
  ): ProjectConfiguration {
    const merged: ProjectConfiguration = {};

    // Merge models configuration
    if (global.models || project.models) {
      merged.models = {
        ...global.models,
        ...project.models,
      };
      
      // Deep merge providers
      if (global.models?.providers || project.models?.providers) {
        merged.models.providers = {
          ...global.models?.providers,
          ...project.models?.providers,
        };
      }
    }

    // Merge OpenAI configuration
    if (global.openai || project.openai) {
      merged.openai = {
        ...global.openai,
        ...project.openai,
      };
    }

    // Merge general configuration
    if (global.config || project.config) {
      merged.config = {
        ...global.config,
        ...project.config,
      };
      
      // Deep merge nested objects
      if (global.config?.telemetry || project.config?.telemetry) {
        merged.config.telemetry = {
          ...global.config?.telemetry,
          ...project.config?.telemetry,
        };
      }
      
      if (global.config?.analysis || project.config?.analysis) {
        merged.config.analysis = {
          ...global.config?.analysis,
          ...project.config?.analysis,
        };
      }
      
      if (global.config?.accessibility || project.config?.accessibility) {
        merged.config.accessibility = {
          ...global.config?.accessibility,
          ...project.config?.accessibility,
        };
      }
    }

    return merged;
  }

  /**
   * Validate configuration and return any errors or warnings
   */
  private validateConfiguration(config: ProjectConfiguration): ConfigurationValidationError[] {
    const errors: ConfigurationValidationError[] = [];

    // Validate models configuration
    if (config.models) {
      if (config.models.priority && !Array.isArray(config.models.priority)) {
        errors.push({
          path: 'models.priority',
          message: 'Priority must be an array of model names',
          severity: 'error',
        });
      }

      if (config.models.providers) {
        Object.entries(config.models.providers).forEach(([providerName, providerConfig]) => {
          if (providerConfig.priority && typeof providerConfig.priority !== 'number') {
            errors.push({
              path: `models.providers.${providerName}.priority`,
              message: 'Provider priority must be a number',
              severity: 'error',
            });
          }

          if (providerConfig.baseURL && !this.isValidURL(providerConfig.baseURL)) {
            errors.push({
              path: `models.providers.${providerName}.baseURL`,
              message: 'Invalid base URL format',
              severity: 'warning',
            });
          }
        });
      }
    }

    // Validate OpenAI configuration
    if (config.openai) {
      if (config.openai.baseURL && !this.isValidURL(config.openai.baseURL)) {
        errors.push({
          path: 'openai.baseURL',
          message: 'Invalid base URL format',
          severity: 'warning',
        });
      }

      if (config.openai.apiKey && config.openai.apiKey.length < 10) {
        errors.push({
          path: 'openai.apiKey',
          message: 'API key appears to be too short',
          severity: 'warning',
        });
      }
    }

    // Validate general configuration
    if (config.config) {
      if (config.config.analysis?.mode && 
          !['static', 'llm', 'vector'].includes(config.config.analysis.mode)) {
        errors.push({
          path: 'config.analysis.mode',
          message: 'Analysis mode must be one of: static, llm, vector',
          severity: 'error',
        });
      }

      if (config.config.approvalMode && 
          !['default', 'autoEdit', 'yolo'].includes(config.config.approvalMode)) {
        errors.push({
          path: 'config.approvalMode',
          message: 'Approval mode must be one of: default, autoEdit, yolo',
          severity: 'error',
        });
      }

      if (config.config.analysis?.timeout && 
          (typeof config.config.analysis.timeout !== 'number' || config.config.analysis.timeout <= 0)) {
        errors.push({
          path: 'config.analysis.timeout',
          message: 'Analysis timeout must be a positive number',
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /**
   * Simple URL validation
   */
  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration directories
   */
  getConfigurationPaths(): {
    global: string;
    project: string;
    globalExists: boolean;
    projectExists: boolean;
  } {
    return {
      global: this.globalConfigDir,
      project: this.projectConfigDir,
      globalExists: fs.existsSync(this.globalConfigDir),
      projectExists: fs.existsSync(this.projectConfigDir),
    };
  }

  /**
   * Create default configuration files
   */
  async createDefaultConfiguration(location: 'global' | 'project'): Promise<void> {
    const configDir = location === 'global' ? this.globalConfigDir : this.projectConfigDir;

    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      await fs.promises.mkdir(configDir, { recursive: true });
    }

    // Create default models.json
    const defaultModels: ModelConfiguration = {
      defaultModel: 'gemini-1.5-flash',
      priority: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gpt-4'],
      fallback: 'gemini-1.5-flash',
      providers: {
        gemini: {
          enabled: true,
          priority: 1,
        },
        openai: {
          enabled: false,
          priority: 2,
        },
      },
    };

    const modelsPath = path.join(configDir, 'models.json');
    if (!fs.existsSync(modelsPath)) {
      await fs.promises.writeFile(modelsPath, JSON.stringify(defaultModels, null, 2));
    }

    // Create default config.json
    const defaultConfig: GeneralConfiguration = {
      debugMode: false,
      telemetry: {
        enabled: true,
        target: 'clearcut',
      },
      analysis: {
        mode: 'vector',
        timeout: 30000,
        enableCache: true,
      },
      rag: {
        defaultProvider: 'neo4j-graph-rag',
        enableHybridSearch: false,
        disableTextMatching: true,
      },
      approvalMode: 'default',
      accessibility: {
        disableLoadingPhrases: false,
        useStatusBasedPhrases: false,
      },
    };

    const configPath = path.join(configDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    console.log(`[ProjectConfigurationManager] Created default configuration in ${configDir}`);
  }

  /**
   * Clear cached configuration to force reload
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.lastLoadTime = 0;
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface OpenAIHijackEnvConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Cache for configuration to avoid repeated loading
let configCache: OpenAIHijackEnvConfig | null = null;

/**
 * Load OpenAI configuration from ~/.gemini/.env
 */
export function loadOpenAIConfig(): OpenAIHijackEnvConfig {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }
  const configDir = path.join(os.homedir(), '.gemini');
  const envFile = path.join(configDir, '.env');
  
  const config: OpenAIHijackEnvConfig = {
    // Default LMStudio configuration
    apiKey: 'not-needed',
    baseURL: 'http://localhost:1234/v1',
    model: 'local-model',
    temperature: 0.7,
    maxTokens: 4096,
  };

  try {
    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf-8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=', 2);
          if (key && value) {
            const cleanKey = key.trim();
            const cleanValue = value.trim().replace(/^["']|["']$/g, ''); // Remove quotes
            
            switch (cleanKey) {
              case 'OPENAI_API_KEY':
                config.apiKey = cleanValue;
                break;
              case 'OPENAI_BASE_URL':
                config.baseURL = cleanValue;
                break;
              case 'OPENAI_MODEL':
                config.model = cleanValue;
                break;
              case 'OPENAI_TEMPERATURE':
                config.temperature = parseFloat(cleanValue) || 0.7;
                break;
              case 'OPENAI_MAX_TOKENS':
                config.maxTokens = parseInt(cleanValue) || 4096;
                break;
            }
          }
        }
      }
      
      console.log('[OpenAI Config] Loaded configuration from ~/.gemini/.env');
      console.log('[OpenAI Config] Base URL:', config.baseURL);
      console.log('[OpenAI Config] Model:', config.model);
    } else {
      console.log('[OpenAI Config] No ~/.gemini/.env found, using default LMStudio configuration');
    }
  } catch (error) {
    console.warn('[OpenAI Config] Error reading ~/.gemini/.env:', error);
    console.log('[OpenAI Config] Using default LMStudio configuration');
  }

  // Cache the config before returning
  configCache = config;
  return config;
}

/**
 * Create default ~/.gemini/.env configuration for LMStudio
 */
export function createDefaultEnvConfig(): void {
  const configDir = path.join(os.homedir(), '.gemini');
  const envFile = path.join(configDir, '.env');
  
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Don't overwrite existing config
    if (fs.existsSync(envFile)) {
      return;
    }
    
    const defaultConfig = `# OpenAI Hijack Configuration for Gemini CLI
# This configuration is used when --openai flag is enabled

# LMStudio default configuration (recommended for local testing)
OPENAI_API_KEY=not-needed
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=local-model
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096

# Alternative providers:
# For AIProxy:
# OPENAI_BASE_URL=https://api.aiproxy.io/v1
# OPENAI_API_KEY=your-aiproxy-key

# For OpenAI-compatible services:
# OPENAI_BASE_URL=https://your-provider.com/v1
# OPENAI_API_KEY=your-api-key
`;

    fs.writeFileSync(envFile, defaultConfig, 'utf-8');
    console.log('[OpenAI Config] Created default configuration at ~/.gemini/.env');
  } catch (error) {
    console.warn('[OpenAI Config] Error creating default .env:', error);
  }
}
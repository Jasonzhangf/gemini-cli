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
  
  // Read provider from environment first
  let provider = process.env.OPENAI_PROVIDER || 'SILICONFLOW';
  
  // Initialize default configuration based on provider
  let config: OpenAIHijackEnvConfig;
  
  switch (provider) {
    case 'DOUBAO':
      config = {
        apiKey: process.env.DOUBAO_API_KEY || '',
        baseURL: process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3',
        model: process.env.DOUBAO_ACTUAL_MODEL || 'ep-20241216165142-hsgmt',
        temperature: 0.7,
        maxTokens: 4096,
      };
      break;
    case 'SILICONFLOW':
    default:
      config = {
        apiKey: process.env.SILICONFLOW_API_KEY || 'sk-default',
        baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
        model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B',
        temperature: 0.7,
        maxTokens: 4096,
      };
      break;
  }

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
              // Provider selection
              case 'OPENAI_PROVIDER':
                provider = cleanValue;
                // Re-initialize config based on new provider
                switch (provider) {
                  case 'DOUBAO':
                    config = {
                      apiKey: process.env.DOUBAO_API_KEY || '',
                      baseURL: process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3',
                      model: process.env.DOUBAO_ACTUAL_MODEL || 'ep-20241216165142-hsgmt',
                      temperature: 0.7,
                      maxTokens: 4096,
                    };
                    break;
                  case 'SILICONFLOW':
                  default:
                    config = {
                      apiKey: process.env.SILICONFLOW_API_KEY || 'sk-default',
                      baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
                      model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B',
                      temperature: 0.7,
                      maxTokens: 4096,
                    };
                    break;
                }
                break;
              // DOUBAO configuration
              case 'DOUBAO_API_KEY':
                if (provider === 'DOUBAO') {
                  config.apiKey = cleanValue;
                }
                break;
              case 'DOUBAO_API_ENDPOINT':
                if (provider === 'DOUBAO') {
                  config.baseURL = cleanValue;
                }
                break;
              case 'DOUBAO_ACTUAL_MODEL':
                if (provider === 'DOUBAO') {
                  config.model = cleanValue;
                }
                break;
              // SiliconFlow configuration
              case 'SILICONFLOW_API_KEY':
                if (provider === 'SILICONFLOW') {
                  config.apiKey = cleanValue;
                }
                break;
              case 'SILICONFLOW_BASE_URL':
                if (provider === 'SILICONFLOW') {
                  config.baseURL = cleanValue;
                }
                break;
              case 'SILICONFLOW_MODEL':
                if (provider === 'SILICONFLOW') {
                  config.model = cleanValue;
                }
                break;
              // Legacy OpenAI configuration (for backward compatibility)
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
      console.log('[OpenAI Config] Provider:', provider);
      console.log('[OpenAI Config] Base URL:', config.baseURL);
      console.log('[OpenAI Config] Model:', config.model);
    } else {
      console.log('[OpenAI Config] No ~/.gemini/.env found, using default SiliconFlow configuration');
    }
  } catch (error) {
    console.warn('[OpenAI Config] Error reading ~/.gemini/.env:', error);
    console.log('[OpenAI Config] Using default SiliconFlow configuration');
  }

  // Log final configuration
  console.log('[OpenAI Config] Final provider:', provider);
  console.log('[OpenAI Config] Final config:', {
    baseURL: config.baseURL,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });

  // Cache the config before returning
  configCache = config;
  return config;
}


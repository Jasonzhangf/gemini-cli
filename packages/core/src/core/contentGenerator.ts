/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { Tool } from '../tools/tools.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';
import { Config } from '../config/config.js';

interface HijackRule {
  targetModel: string;
  provider: string;
  actualModel: string;
  apiKey: string;
  apiEndpoint: string;
  configGroup: string;
}

interface HijackConfig {
  enabled: boolean;
  activeProvider: string;
  hijackRules: HijackRule[];
}

interface FallbackConfig {
  provider: string;
  model: string;
  actualModel?: string;
  endpoint?: string;
  apiKey?: string;
  maxRetries: number;
  priority: number;
}

interface FallbackSystem {
  enabled: boolean;
  fallbacks: FallbackConfig[];
}

/**
 * Load hijack configuration from environment variables
 * Supports multiple provider configurations with prefix-based naming
 */
function loadHijackConfigFromEnv(): HijackConfig | null {
  try {
    // Check if hijacking is enabled via environment variable
    const hijackEnabled = process.env.HIJACK_ENABLED === 'true';
    if (!hijackEnabled) return null;

    // Determine which provider configuration to use
    const activeProvider = process.env.HIJACK_ACTIVE_PROVIDER || 'HIJACK';
    console.log(`🔧 Loading configuration for provider: ${activeProvider}`);

    // Load configuration for the active provider
    const config = loadProviderConfig(activeProvider);
    if (!config) {
      // Fallback: try to load legacy HIJACK_ configuration
      console.warn(`⚠️  No configuration found for provider '${activeProvider}', trying legacy HIJACK configuration...`);
      const fallbackConfig = loadProviderConfig('HIJACK');
      if (!fallbackConfig) {
        console.warn('🚨 No valid hijack configuration found');
        return null;
      }
      return {
        enabled: true,
        activeProvider: 'HIJACK',
        hijackRules: [fallbackConfig],
      };
    }

    return {
      enabled: true,
      activeProvider,
      hijackRules: [config],
    };
  } catch (error) {
    console.warn('❌ Failed to load hijack config from environment:', error);
  }
  return null;
}

/**
 * Load configuration for a specific provider prefix
 */
function loadProviderConfig(prefix: string): HijackRule | null {
  const targetModel = process.env[`${prefix}_TARGET_MODEL`] || 'gemini-2.5-flash';
  const provider = process.env[`${prefix}_PROVIDER`] || prefix.toLowerCase();
  const actualModel = process.env[`${prefix}_ACTUAL_MODEL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const apiEndpoint = process.env[`${prefix}_API_ENDPOINT`];

  if (!actualModel || !apiKey || !apiEndpoint) {
    console.warn(`🚨 Provider '${prefix}' missing required environment variables`);
    console.warn(`   Required: ${prefix}_ACTUAL_MODEL, ${prefix}_API_KEY, ${prefix}_API_ENDPOINT`);
    console.warn(`   Optional: ${prefix}_TARGET_MODEL, ${prefix}_PROVIDER`);
    return null;
  }

  console.log(`✅ Loaded configuration for provider '${prefix}':`);
  console.log(`   Target Model: ${targetModel}`);
  console.log(`   Actual Model: ${actualModel}`);
  console.log(`   Endpoint: ${apiEndpoint}`);
  console.log(`   API Key: ${apiKey.substring(0, 8)}...`);

  return {
    targetModel,
    provider,
    actualModel,
    apiKey,
    apiEndpoint,
    configGroup: prefix,
  };
}

/**
 * Load Fallback system configuration from environment variables
 */
function loadFallbackConfigFromEnv(): FallbackSystem | null {
  try {
    const fallbacks: FallbackConfig[] = [];
    
    // Look for FALLBACK_1, FALLBACK_2, etc.
    for (let i = 1; i <= 10; i++) {
      const prefix = `FALLBACK_${i}`;
      const provider = process.env[`${prefix}_PROVIDER`];
      const model = process.env[`${prefix}_MODEL`];
      
      if (!provider || !model) {
        break; // Stop at first missing fallback
      }
      
      const fallbackConfig: FallbackConfig = {
        provider,
        model,
        actualModel: process.env[`${prefix}_ACTUAL_MODEL`],
        endpoint: process.env[`${prefix}_ENDPOINT`],
        apiKey: process.env[`${prefix}_API_KEY`],
        maxRetries: parseInt(process.env[`${prefix}_MAX_RETRIES`] || '3'),
        priority: i
      };
      
      fallbacks.push(fallbackConfig);
      console.log(`🔧 Loaded fallback ${i}: ${provider} ${model} (retries: ${fallbackConfig.maxRetries})`);
    }
    
    if (fallbacks.length === 0) {
      return null;
    }
    
    console.log(`✅ Loaded ${fallbacks.length} fallback configurations`);
    return {
      enabled: true,
      fallbacks
    };
  } catch (error) {
    console.warn('❌ Failed to load fallback config from environment:', error);
    return null;
  }
}

/**
 * Check if a user-specified model should be hijacked by a hijack rule
 * Supports both exact matching and fuzzy matching for similar model names
 */
function shouldHijackModel(userModel: string, targetModel: string): boolean {
  // Exact match
  if (userModel === targetModel) {
    return true;
  }
  
  // Fuzzy matching for common model name variations
  const normalizeModelName = (name: string) => {
    return name.toLowerCase()
      .replace(/gemini-/, '')
      .replace(/-/g, '')
      .replace(/\./g, '');
  };
  
  const normalizedUser = normalizeModelName(userModel);
  const normalizedTarget = normalizeModelName(targetModel);
  
  // Check if they're essentially the same model with different naming conventions
  if (normalizedUser === normalizedTarget) {
    console.log(`🔄 Model name variation detected: '${userModel}' matches target '${targetModel}'`);
    return true;
  }
  
  // Check for common variations
  const variations = [
    // gemini-2.5-flash vs gemini-flash-2.5
    { pattern: /^gemini-(\d+\.?\d*)-flash$/, alt: 'gemini-flash-$1' },
    { pattern: /^gemini-flash-(\d+\.?\d*)$/, alt: 'gemini-$1-flash' },
    // gemini-2.5-pro vs gemini-pro-2.5  
    { pattern: /^gemini-(\d+\.?\d*)-pro$/, alt: 'gemini-pro-$1' },
    { pattern: /^gemini-pro-(\d+\.?\d*)$/, alt: 'gemini-$1-pro' },
  ];
  
  for (const variation of variations) {
    const userMatch = userModel.match(variation.pattern);
    if (userMatch) {
      const expectedTarget = variation.alt.replace('$1', userMatch[1]);
      if (expectedTarget === targetModel) {
        console.log(`🔄 Model name variation detected: '${userModel}' matches target '${targetModel}'`);
        return true;
      }
    }
    
    const targetMatch = targetModel.match(variation.pattern);
    if (targetMatch) {
      const expectedUser = variation.alt.replace('$1', targetMatch[1]);
      if (expectedUser === userModel) {
        console.log(`🔄 Model name variation detected: '${userModel}' matches target '${targetModel}'`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get Fallback system configuration  
 */
export function getFallbackConfig(): FallbackSystem | null {
  return loadFallbackConfigFromEnv();
}

/**
 * Get all available provider configurations
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = [];
  const envKeys = Object.keys(process.env);
  
  // Look for provider configurations by finding patterns like PREFIX_API_ENDPOINT
  const providerPrefixes = new Set<string>();
  for (const key of envKeys) {
    if (key.endsWith('_API_ENDPOINT')) {
      const prefix = key.replace('_API_ENDPOINT', '');
      // Check if this prefix has the required configuration
      if (process.env[`${prefix}_ACTUAL_MODEL`] && process.env[`${prefix}_API_KEY`]) {
        providerPrefixes.add(prefix);
      }
    }
  }
  
  return Array.from(providerPrefixes).sort();
}

/**
 * Check if hijacking is configured for startup display
 */
export function getHijackInfo(): {
  enabled: boolean;
  activeProvider?: string;
  availableProviders?: string[];
  targetModel?: string;
  actualModel?: string;
  endpoint?: string;
} {
  const config = loadHijackConfigFromEnv();
  const availableProviders = getAvailableProviders();
  
  if (!config?.enabled || !config.hijackRules.length) {
    return { 
      enabled: false,
      availableProviders: availableProviders.length > 0 ? availableProviders : undefined,
    };
  }

  const rule = config.hijackRules[0];
  return {
    enabled: true,
    activeProvider: config.activeProvider,
    availableProviders,
    targetModel: rule.targetModel,
    actualModel: rule.actualModel,
    endpoint: rule.apiEndpoint,
  };
}

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getAllAvailableTools?(): Promise<Tool[]>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  OPENAI_COMPATIBLE = 'openai-compatible',
}

export type ContentGeneratorConfig = {
  model: string;
  actualModel?: string;
  apiKey?: string;
  apiEndpoint?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string; getActualModel?: () => string | undefined },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  let effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;
  let hijackedAuthType = authType;
  let hijackedApiKey: string | undefined;
  let hijackedApiEndpoint: string | undefined;
  let actualModel: string | undefined;

  // Check for model hijacking - prioritize command line actualModel over environment
  const commandLineActualModel = config?.getActualModel?.();
  
  if (commandLineActualModel) {
    // Use command line specified actual model
    const hijackConfig = loadHijackConfigFromEnv();
    if (hijackConfig?.enabled) {
      const hijackRule = hijackConfig.hijackRules[0]; // Use first available provider
      if (hijackRule) {
        // Determine AuthType based on endpoint for command line hijacking too
        const isGeminiEndpoint = hijackRule.apiEndpoint.includes('generativelanguage.googleapis.com');
        hijackedAuthType = isGeminiEndpoint ? AuthType.USE_GEMINI : AuthType.OPENAI_COMPATIBLE;
        hijackedApiKey = hijackRule.apiKey;
        hijackedApiEndpoint = hijackRule.apiEndpoint;
        actualModel = commandLineActualModel; // Use command line model instead of env model
      }
    }
  } else {
    // Fallback to environment variable based hijacking
    const hijackConfig = loadHijackConfigFromEnv();
    if (hijackConfig?.enabled) {
      const hijackRule = hijackConfig.hijackRules.find(
        (rule) => shouldHijackModel(effectiveModel, rule.targetModel),
      );
      if (hijackRule) {
        // Enable actual hijacking - determine AuthType based on endpoint
        const isGeminiEndpoint = hijackRule.apiEndpoint.includes('generativelanguage.googleapis.com');
        hijackedAuthType = isGeminiEndpoint ? AuthType.USE_GEMINI : AuthType.OPENAI_COMPATIBLE;
        hijackedApiKey = hijackRule.apiKey;
        hijackedApiEndpoint = hijackRule.apiEndpoint;
        actualModel = hijackRule.actualModel;
        
        // Enhanced success notification for environment-based hijacking
        const availableProviders = getAvailableProviders();
        console.log('');
        console.log('🔄 ===== MODEL HIJACK CONFIGURED ===== 🔄');
        console.log(`🏷️  Active Provider: ${hijackConfig.activeProvider}`);
        if (availableProviders.length > 1) {
          console.log(`📋 Available Providers: ${availableProviders.join(', ')}`);
          console.log(`💡 Switch providers using: HIJACK_ACTIVE_PROVIDER=${availableProviders.filter(p => p !== hijackConfig.activeProvider)[0]}`);
        }
        console.log(`🎯 Target Model: ${effectiveModel}`);
        console.log(`✨ Configured To: ${hijackRule.actualModel}`);
        console.log(`🔗 Endpoint: ${hijackRule.apiEndpoint}`);
        console.log(`🔑 Using API Key: ${hijackRule.apiKey.substring(0, 8)}...`);
        const isGeminiAPI = hijackRule.apiEndpoint.includes('generativelanguage.googleapis.com');
        console.log(`✅ ${isGeminiAPI ? 'Gemini' : 'OpenAI compatible'} implementation active`);
        console.log('🚀 Requests will be sent to configured endpoint');
        console.log('========================================');
        console.log('');
      }
    }
  }
  
  // Show hijacking notification for command line based hijacking
  if (commandLineActualModel && hijackedAuthType === AuthType.OPENAI_COMPATIBLE) {
    console.log('');
    console.log('🔄 ===== COMMAND LINE MODEL HIJACK ===== 🔄');
    console.log(`🎯 Display Model: ${effectiveModel}`);
    console.log(`✨ Actual Model: ${commandLineActualModel}`);
    console.log(`🔗 Endpoint: ${hijackedApiEndpoint}`);
    console.log(`🔑 Using API Key: ${hijackedApiKey?.substring(0, 8)}...`);
    console.log('✅ OpenAI compatible implementation active');
    console.log('🚀 Command line model override active');
    console.log('========================================');
    console.log('');
  }

  // Keep the original auth type - we'll handle JSON tool calls within Gemini mode
  let finalAuthType = hijackedAuthType || AuthType.USE_GEMINI;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    actualModel,
    authType: finalAuthType,
    apiKey: hijackedApiKey,
    apiEndpoint: hijackedApiEndpoint,
  };

  // if we are using google auth nothing else to validate for now
  if (hijackedAuthType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  // Handle OpenAI compatible API (including hijacked calls)
  if (hijackedAuthType === AuthType.OPENAI_COMPATIBLE) {
    // Use hijacked credentials if available, otherwise fall back to environment
    contentGeneratorConfig.apiKey =
      hijackedApiKey || process.env.OPENAI_API_KEY;
    contentGeneratorConfig.apiEndpoint =
      hijackedApiEndpoint || process.env.OPENAI_API_ENDPOINT;
    return contentGeneratorConfig;
  }

  // Handle hijacked Gemini API calls
  if (hijackedAuthType === AuthType.USE_GEMINI) {
    // Use hijacked API key if available, otherwise fall back to settings
    contentGeneratorConfig.apiKey = hijackedApiKey || geminiApiKey;
    if (!contentGeneratorConfig.apiKey) {
      throw new Error('No API key available for hijacked Gemini API calls');
    }
    
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  // Standard Gemini API calls
  if (geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    hijackedAuthType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  globalConfig?: Config,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (config.authType === AuthType.OPENAI_COMPATIBLE) {
    const { OpenAICompatibleContentGenerator } = await import(
      './openaiCompatibleContentGenerator.js'
    );
    if (!config.apiKey || !config.apiEndpoint || !config.actualModel) {
      throw new Error(
        'OpenAI compatible mode requires apiKey, apiEndpoint, and actualModel',
      );
    }
    return new OpenAICompatibleContentGenerator(
      config.apiKey,
      config.apiEndpoint,
      config.actualModel,
      globalConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}

export class OpenAICompatibleContentGenerator implements ContentGenerator {
  private client: any;
  private config: ContentGeneratorConfig;

  constructor(
    apiKey: string,
    apiEndpoint: string,
    actualModel: string,
    globalConfig?: Config,
  ) {
    this.config = {
      model: actualModel,
      actualModel,
      apiKey,
      apiEndpoint,
      authType: AuthType.OPENAI_COMPATIBLE,
    };
  }

  async generateContent(
    _request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    throw new Error('Not implemented');
  }

  async generateContentStream(
    _request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    throw new Error('Not implemented');
  }

  async countTokens(_request: CountTokensParameters): Promise<CountTokensResponse> {
    throw new Error('Not implemented');
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Not implemented');
  }

  async getAllAvailableTools(): Promise<Tool[]> {
    return [];
  }
}

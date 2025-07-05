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
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';

interface ProviderConfig {
  provider: string;
  apiEndpoint: string;
  apiKey: string;
}

function detectProviderFromModel(modelName: string): ProviderConfig | null {
  // Auto-detect provider based on model name patterns
  if (
    modelName.toLowerCase().includes('qwen') ||
    modelName.toLowerCase().includes('qwq')
  ) {
    return {
      provider: 'LMStudio',
      apiEndpoint:
        process.env.LMSTUDIO_API_ENDPOINT || 'http://192.168.123.149:1234/v1',
      apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
    };
  }

  if (modelName.toLowerCase().includes('gemini')) {
    // For gemini models in hijack mode, redirect to AIStudio proxy
    return {
      provider: 'AIStudioProxy',
      apiEndpoint:
        process.env.HIJACK_API_ENDPOINT || 'http://127.0.0.1:2048/v1',
      apiKey: process.env.HIJACK_API_KEY || '1234567890',
    };
  }

  // Add more provider detection logic here
  // For example:
  // if (modelName.includes('claude')) return claudeConfig;
  // if (modelName.includes('gpt')) return openaiConfig;

  return null;
}

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

/**
 * Load hijack configuration from environment variables
 * Supports multiple provider configurations with prefix-based naming
 */
function loadHijackConfigFromEnv(
  hijackOverride?: boolean,
): HijackConfig | null {
  try {
    const envHijackEnabled = process.env.HIJACK_ENABLED === 'true';
    const hijackEnabled =
      hijackOverride !== undefined ? hijackOverride : envHijackEnabled;

    if (!hijackEnabled) {
      return null;
    }

    const activeProvider = process.env.HIJACK_ACTIVE_PROVIDER || 'HIJACK';
    const config = loadProviderConfig(activeProvider);
    if (!config) {
      const fallbackConfig = loadProviderConfig('HIJACK');
      if (!fallbackConfig) {
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
  const provider = process.env[`${prefix}_PROVIDER`] || prefix.toLowerCase();
  const apiKey = process.env[`${prefix}_API_KEY`];
  const apiEndpoint = process.env[`${prefix}_API_ENDPOINT`];

  if (!apiKey || !apiEndpoint) {
    return null;
  }

  return {
    targetModel: '',
    provider,
    actualModel: '',
    apiKey,
    apiEndpoint,
    configGroup: prefix,
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
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
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
  forceAccountSelection?: boolean;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: {
    getModel?: () => string;
    getHijack?: () => boolean | undefined;
    getFcHijack?: () => boolean | undefined;
    getUserId?: () => string | undefined;
    getNewUserId?: () => boolean | undefined;
  },
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

  const hijackEnabled = config?.getHijack?.() || false;
  const fcHijackEnabled = config?.getFcHijack?.() || false;
  const specifiedUserId = config?.getUserId?.();
  const newUserIdMode = config?.getNewUserId?.() || false;

  // Handle multi-user authentication and smart fallback
  if (
    !hijackEnabled &&
    (authType === AuthType.USE_GEMINI ||
      authType === AuthType.LOGIN_WITH_GOOGLE)
  ) {
    const { userAuthManager } = await import('../config/userAuth.js');

    // Handle --newid mode: Clear current authentication to trigger fresh login
    if (newUserIdMode) {
      console.log('🆕 New User ID mode: Clearing current authentication...');
      userAuthManager.clearCurrentAuthentication();
      console.log(
        '✅ Current authentication cleared. System will prompt for new login.',
      );
      // Auto-save will be handled after OAuth completes in createCodeAssistContentGenerator
    } else {
      // Auto-save current authenticated user if not already saved
      userAuthManager.autoSaveCurrentUser();

      if (specifiedUserId) {
        // User specified a particular user ID
        const userAuth = userAuthManager.getUserAuth(specifiedUserId);
        if (userAuth) {
          const targetUser = userAuthManager.switchToUser(specifiedUserId);
          if (targetUser) {
            console.log(
              `🎯 Using specified user: ${specifiedUserId} (${targetUser.email || 'No email'})`,
            );
          }
        } else {
          console.warn(
            `⚠️  User ${specifiedUserId} not found, falling back to current user`,
          );
        }
      }

      // Check if current user/model combination is rate limited
      const currentUser = userAuthManager.getCurrentUser();
      if (currentUser) {
        const usage = currentUser.modelUsage[effectiveModel];
        if (
          usage?.rateLimited &&
          usage.rateLimitedUntil &&
          Date.now() < usage.rateLimitedUntil
        ) {
          console.log(
            `⚠️  Current user ${currentUser.userId} is rate limited for ${effectiveModel}, trying rotation...`,
          );

          const nextAvailable = userAuthManager.getNextAvailableUserAndModel(
            currentUser.userId,
            effectiveModel,
          );
          if (nextAvailable) {
            effectiveModel = nextAvailable.model;
            userAuthManager.switchToUser(nextAvailable.userId);
            console.log(
              `🔄 Rotated to user ${nextAvailable.userId} with model ${nextAvailable.model}`,
            );
          } else {
            console.warn(
              '⚠️  All users are rate limited, proceeding with current configuration',
            );
          }
        }
      }
    }
  }

  if (hijackEnabled) {
    // --hijack mode: All models are hijacked to third-party endpoints
    // The model specified by user (-m) is the actual third-party model
    actualModel = effectiveModel;

    // Auto-detect provider based on model name
    const providerConfig = detectProviderFromModel(effectiveModel);
    if (providerConfig) {
      hijackedAuthType = AuthType.OPENAI_COMPATIBLE;
      hijackedApiKey = providerConfig.apiKey;
      hijackedApiEndpoint = providerConfig.apiEndpoint;

      console.log('🔄 ===== HIJACK MODE ACTIVE ===== 🔄');
      console.log(`🎯 Target Model: ${effectiveModel}`);
      console.log(`✨ Provider: ${providerConfig.provider}`);
      console.log(`🔗 Endpoint: ${providerConfig.apiEndpoint}`);
      console.log(`🔑 API Key: ${providerConfig.apiKey.substring(0, 8)}...`);
      console.log(`✅ OpenAI compatible implementation active`);
      console.log('========================================');
    } else {
      // Fallback to environment-based hijack configuration
      const hijackConfig = loadHijackConfigFromEnv(true);
      if (hijackConfig?.enabled) {
        const activeProviderConfig = loadProviderConfig(
          hijackConfig.activeProvider,
        );
        if (activeProviderConfig) {
          hijackedAuthType = AuthType.OPENAI_COMPATIBLE;
          hijackedApiKey = activeProviderConfig.apiKey;
          hijackedApiEndpoint = activeProviderConfig.apiEndpoint;
          actualModel = activeProviderConfig.actualModel || effectiveModel;

          console.log('🔄 ===== ENV HIJACK FALLBACK ===== 🔄');
          console.log(`🏷️  Provider: ${hijackConfig.activeProvider}`);
          console.log(`🎯 Target Model: ${effectiveModel}`);
          console.log(`✨ Actual Model: ${actualModel}`);
          console.log(`🔗 Endpoint: ${activeProviderConfig.apiEndpoint}`);
          console.log('========================================');
        }
      }
    }
  } else if (fcHijackEnabled) {
    // --fc_hijack mode: Use official Gemini API but hijack function call logic
    console.log('🔧 ===== FC HIJACK MODE ACTIVE ===== 🔧');
    console.log(`🎯 Using official Gemini API with model: ${effectiveModel}`);
    console.log(`🛠️  Function call logic will be hijacked`);
    console.log('========================================');
    // Keep original Gemini API settings, hijacking will happen at execution level
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    actualModel,
    authType: hijackedAuthType || authType,
    apiKey: hijackedApiKey,
    apiEndpoint: hijackedApiEndpoint,
    forceAccountSelection: newUserIdMode, // Force account selection in newUserId mode
  };

  // if we are using google auth nothing else to validate for now
  if ((hijackedAuthType || authType) === AuthType.LOGIN_WITH_GOOGLE) {
    return contentGeneratorConfig;
  }

  // Handle OpenAI compatible API (including hijacked calls)
  if ((hijackedAuthType || authType) === AuthType.OPENAI_COMPATIBLE) {
    // Use hijacked credentials if available, otherwise fall back to environment
    contentGeneratorConfig.apiKey =
      hijackedApiKey || process.env.OPENAI_API_KEY;
    contentGeneratorConfig.apiEndpoint =
      hijackedApiEndpoint || process.env.OPENAI_API_ENDPOINT;
    return contentGeneratorConfig;
  }

  if ((hijackedAuthType || authType) === AuthType.USE_GEMINI) {
    // Use hijacked API key if available, otherwise fall back to settings
    contentGeneratorConfig.apiKey = hijackedApiKey || geminiApiKey;
    if (!contentGeneratorConfig.apiKey) {
      throw new Error('No API key available for Gemini API calls');
    }

    // Skip model validation for hijacked calls to avoid connecting to Google servers
    if (hijackedApiKey || hijackedApiEndpoint) {
      console.log('🔧 Skipping model validation for hijacked Gemini API calls');
    } else {
      contentGeneratorConfig.model = await getEffectiveModel(
        contentGeneratorConfig.apiKey,
        contentGeneratorConfig.model,
      );
    }

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
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
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      sessionId,
      config.forceAccountSelection,
    );
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

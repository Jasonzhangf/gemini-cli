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
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface HijackRule {
  targetModel: string;
  provider: string;
  actualModel: string;
  apiKey: string;
  apiEndpoint: string;
}

interface HijackConfig {
  enabled: boolean;
  hijackRules: HijackRule[];
}

function loadHijackConfigFromEnv(): HijackConfig | null {
  try {
    // Check if hijacking is enabled via environment variable
    const hijackEnabled = process.env.HIJACK_ENABLED === 'true';
    if (!hijackEnabled) return null;

    const targetModel = process.env.HIJACK_TARGET_MODEL;
    const provider = process.env.HIJACK_PROVIDER;
    const actualModel = process.env.HIJACK_ACTUAL_MODEL;
    const apiKey = process.env.HIJACK_API_KEY;
    const apiEndpoint = process.env.HIJACK_API_ENDPOINT;

    if (!targetModel || !provider || !actualModel || !apiKey || !apiEndpoint) {
      console.warn('🚨 Hijack enabled but missing required environment variables');
      return null;
    }

    return {
      enabled: true,
      hijackRules: [{
        targetModel,
        provider,
        actualModel,
        apiKey,
        apiEndpoint
      }]
    };
  } catch (error) {
    console.warn('❌ Failed to load hijack config from environment:', error);
  }
  return null;
}

/**
 * Check if hijacking is configured for startup display
 */
export function getHijackInfo(): { enabled: boolean; targetModel?: string; actualModel?: string; endpoint?: string } {
  const config = loadHijackConfigFromEnv();
  if (!config?.enabled || !config.hijackRules.length) {
    return { enabled: false };
  }
  
  const rule = config.hijackRules[0];
  return {
    enabled: true,
    targetModel: rule.targetModel,
    actualModel: rule.actualModel,
    endpoint: rule.apiEndpoint
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
  config?: { getModel?: () => string },
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

  // Check for model hijacking from environment variables
  const hijackConfig = loadHijackConfigFromEnv();
  if (hijackConfig?.enabled) {
    const hijackRule = hijackConfig.hijackRules.find(rule => rule.targetModel === effectiveModel);
    if (hijackRule) {
      // Enable actual hijacking
      hijackedAuthType = AuthType.OPENAI_COMPATIBLE;
      hijackedApiKey = hijackRule.apiKey;
      hijackedApiEndpoint = hijackRule.apiEndpoint;
      actualModel = hijackRule.actualModel;
      
      // Enhanced success notification
      console.log('');
      console.log('🔄 ===== MODEL HIJACK CONFIGURED ===== 🔄');
      console.log(`🎯 Target Model: ${effectiveModel}`);
      console.log(`✨ Configured To: ${hijackRule.actualModel}`);
      console.log(`🔗 Endpoint: ${hijackRule.apiEndpoint}`);
      console.log(`🔑 Using API Key: ${hijackRule.apiKey.substring(0, 8)}...`);
      console.log('✅ OpenAI compatible implementation active');
      console.log('🚀 Requests will be sent to configured endpoint');
      console.log('========================================');
      console.log('');
    }
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    actualModel,
    authType: hijackedAuthType,
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
    contentGeneratorConfig.apiKey = hijackedApiKey || process.env.OPENAI_API_KEY;
    contentGeneratorConfig.apiEndpoint = hijackedApiEndpoint || process.env.OPENAI_API_ENDPOINT;
    return contentGeneratorConfig;
  }

  //
  if (hijackedAuthType === AuthType.USE_GEMINI && geminiApiKey) {
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
    const { OpenAICompatibleContentGenerator } = await import('./openaiCompatibleContentGenerator.js');
    if (!config.apiKey || !config.apiEndpoint || !config.actualModel) {
      throw new Error('OpenAI compatible mode requires apiKey, apiEndpoint, and actualModel');
    }
    return new OpenAICompatibleContentGenerator(config.apiKey, config.apiEndpoint, config.actualModel);
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

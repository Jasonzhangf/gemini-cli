/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAI } from 'openai';
import { OpenAIHijackConfig } from './types.js';

/**
 * 细菌式编程：OpenAI客户端操纵子
 * 小巧：仅负责OpenAI API调用
 * 模块化：独立的API客户端
 * 自包含：完整的OpenAI客户端功能
 */
export class OpenAIClient {
  private client: OpenAI;
  private config: OpenAIHijackConfig;

  constructor(config: OpenAIHijackConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
  }

  async createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    tools?: any[]
  ): Promise<any> {
    const requestParams: any = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 4096,
      stream: false
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
      requestParams.tool_choice = 'auto';
    }

    return await this.client.chat.completions.create(requestParams);
  }

  async createChatCompletionStream(
    messages: Array<{ role: string; content: string }>,
    tools?: any[]
  ): Promise<any> {
    const requestParams: any = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 4096,
      stream: true
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
      requestParams.tool_choice = 'auto';
    }

    return await this.client.chat.completions.create(requestParams);
  }

  getConfig(): OpenAIHijackConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<OpenAIHijackConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 重新创建客户端（如果API配置变更）
    if (newConfig.apiKey || newConfig.baseURL) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return !!response;
    } catch (error) {
      return false;
    }
  }
}
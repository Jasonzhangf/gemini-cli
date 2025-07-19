/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

export interface IntentRecognitionRequest {
  userInput: string;
  requestId: string;
  timestamp: number;
}

export interface IntentRecognitionResponse {
  requestId: string;
  intent: string;
  keywords: string[];
  confidence: number;
  timestamp: number;
  processingTime: number;
}

export interface IntentRecognitionError {
  requestId: string;
  error: string;
  timestamp: number;
}

/**
 * 独立的ContextAgent LLM进程
 * 专门用于用户意图识别和关键字提取
 */
export class ContextAgentLLMProcess {
  private config: Config;
  private geminiClient: GeminiClient | null = null;
  private isInitialized = false;
  private contextAgentProvider: string;
  private contextAgentModel: string;

  constructor(config: Config) {
    this.config = config;
    this.contextAgentProvider = process.env.CONTEXTAGENT_PROVIDER || 'gemini';
    this.contextAgentModel = process.env.CONTEXTAGENT_MODEL || 'gemini-1.5-flash';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 获取Gemini客户端
      this.geminiClient = this.config.getGeminiClient();
      
      if (!this.geminiClient) {
        throw new Error('GeminiClient is not available');
      }

      this.isInitialized = true;
      
      if (this.config.getDebugMode()) {
        console.log(`[ContextAgentLLM] Initialized with provider: ${this.contextAgentProvider}, model: ${this.contextAgentModel}`);
      }
    } catch (error) {
      console.error('[ContextAgentLLM] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 处理意图识别请求
   */
  async processIntentRecognition(request: IntentRecognitionRequest): Promise<IntentRecognitionResponse> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.config.getDebugMode()) {
        console.log(`[ContextAgentLLM] Processing intent recognition for request: ${request.requestId}`);
      }

      // 构建意图识别提示
      const intentPrompt = this.buildIntentPrompt(request.userInput);

      // 调用LLM进行意图识别
      const response = await this.callLLMForIntentRecognition(intentPrompt);

      // 解析响应
      const result = this.parseIntentResponse(response, request.userInput);

      const processingTime = Date.now() - startTime;

      if (this.config.getDebugMode()) {
        console.log(`[ContextAgentLLM] Intent recognition completed in ${processingTime}ms`);
        console.log(`[ContextAgentLLM] Intent: ${result.intent}, Keywords: ${result.keywords.join(', ')}`);
      }

      return {
        requestId: request.requestId,
        intent: result.intent,
        keywords: result.keywords,
        confidence: result.confidence,
        timestamp: Date.now(),
        processingTime
      };

    } catch (error) {
      console.error(`[ContextAgentLLM] Failed to process intent recognition for request ${request.requestId}:`, error);
      throw error;
    }
  }

  /**
   * 构建意图识别提示
   */
  private buildIntentPrompt(userInput: string): string {
    return `作为一个专业的代码分析助手，请分析用户输入的意图并提取关键字用于代码库RAG查询。

用户输入：${userInput}

请分析用户的意图，并提取最多10个关键字用于代码库搜索。关键字应该是：
1. 具体的函数名、类名、变量名
2. 文件名或文件路径
3. 技术术语或框架名称
4. 相关的编程概念

请严格按照以下JSON格式返回结果：
{
  "intent": "用户意图的简短描述",
  "keywords": ["关键字1", "关键字2", "关键字3"],
  "confidence": 0.85
}

要求：
- keywords数组最多包含10个元素
- 关键字应该是具体的、可搜索的术语
- 避免通用词汇（如"代码"、"文件"、"函数"等）
- 优先选择代码相关的标识符
- confidence值应该在0-1之间
- 如果输入不清楚，confidence应该较低

只返回JSON，不要包含其他文本。`;
  }

  /**
   * 调用LLM进行意图识别
   */
  private async callLLMForIntentRecognition(prompt: string): Promise<string> {
    try {
      if (!this.geminiClient) {
        throw new Error('GeminiClient not initialized');
      }

      const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
      
      const response = await this.geminiClient.generateContent(
        contents,
        {
          temperature: 0.1, // 低温度确保一致性
          maxOutputTokens: 500,
          topK: 1,
          topP: 0.8,
        },
        new AbortController().signal,
        this.contextAgentModel
      );

      const responseText = getResponseText(response);
      
      if (!responseText) {
        throw new Error('Empty response from LLM');
      }

      return responseText;

    } catch (error) {
      console.error('[ContextAgentLLM] LLM call failed:', error);
      throw error;
    }
  }

  /**
   * 解析LLM响应
   */
  private parseIntentResponse(response: string, userInput: string): { intent: string; keywords: string[]; confidence: number } {
    try {
      // 尝试提取JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证和清理结果
      const intent = parsed.intent || 'general_inquiry';
      const keywords = this.validateAndCleanKeywords(parsed.keywords || []);
      const confidence = this.validateConfidence(parsed.confidence || 0.5);

      return {
        intent,
        keywords,
        confidence
      };

    } catch (parseError) {
      console.warn('[ContextAgentLLM] Failed to parse LLM response, using fallback:', parseError);
      
      // 降级到简单的关键字提取
      return {
        intent: 'general_inquiry',
        keywords: this.extractBasicKeywords(userInput),
        confidence: 0.3
      };
    }
  }

  /**
   * 验证和清理关键字
   */
  private validateAndCleanKeywords(keywords: any[]): string[] {
    if (!Array.isArray(keywords)) {
      return [];
    }

    return keywords
      .filter(keyword => typeof keyword === 'string')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .filter(keyword => keyword.length <= 50) // 避免过长的关键字
      .slice(0, 10); // 最多10个关键字
  }

  /**
   * 验证置信度
   */
  private validateConfidence(confidence: any): number {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 基础关键字提取（降级方案）
   */
  private extractBasicKeywords(input: string): string[] {
    const keywords: string[] = [];
    const text = input.toLowerCase();
    
    // 提取看起来像标识符的词
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = text.match(identifierPattern);
    
    if (matches) {
      const stopWords = ['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'some', 'like', 'into', 'make', 'time', 'than', 'only', 'come', 'could', 'also', 'code', 'file', 'function'];
      
      for (const match of matches) {
        if (match.length >= 3 && !stopWords.includes(match)) {
          keywords.push(match);
        }
      }
    }
    
    // 提取文件扩展名
    const extPattern = /\.(ts|js|tsx|jsx|py|java|cpp|c|h|hpp|cs|go|rs|php|rb|swift|kt|scala|json|md|yml|yaml)\b/g;
    const extMatches = text.match(extPattern);
    if (extMatches) {
      keywords.push(...extMatches.map(ext => ext.substring(1)));
    }
    
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.isInitialized = false;
    if (this.config.getDebugMode()) {
      console.log('[ContextAgentLLM] Process disposed');
    }
  }
}
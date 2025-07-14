/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { Config } from '../config/config.js';

/**
 * 语义分析结果接口
 */
export interface AnalysisResult {
  /** 识别出的核心实体 */
  entities: string[];
  /** 用户意图描述 */
  intent: string;
  /** 关键概念列表 */
  keyConcepts: string[];
  /** 分析置信度 (0-1) */
  confidence: number;
  /** 原始输入文本 */
  originalText: string;
  /** 分析耗时(毫秒) */
  analysisTime: number;
}

/**
 * 语义分析服务配置
 */
export interface SemanticAnalysisConfig {
  /** 超时时间(毫秒) */
  timeout: number;
  /** 是否启用调试模式 */
  debug: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}

/**
 * 语义分析服务
 * 
 * 通过调用外部Gemini模型实现高级语义分析，用于替代原有的静态分析方法。
 * 该服务遵循模块化设计原则，提供统一的分析接口。
 */
export class SemanticAnalysisService {
  private config: Config;
  private serviceConfig: SemanticAnalysisConfig;

  constructor(config: Config, serviceConfig?: Partial<SemanticAnalysisConfig>) {
    this.config = config;
    this.serviceConfig = {
      timeout: 30000, // 30秒超时
      debug: config.getDebugMode(),
      maxRetries: 3,
      ...serviceConfig
    };
  }

  /**
   * 分析文本内容，提取语义信息
   * 
   * @param text 要分析的文本
   * @returns 语义分析结果
   */
  async analyze(text: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    if (!text || text.trim().length === 0) {
      return this.createEmptyResult(text, startTime);
    }

    if (this.serviceConfig.debug) {
      console.log('[SemanticAnalysisService] Starting analysis for text:', text.substring(0, 100) + '...');
    }

    let lastError: Error | null = null;
    
    // 重试机制
    for (let attempt = 1; attempt <= this.serviceConfig.maxRetries; attempt++) {
      try {
        const result = await this.performAnalysis(text, startTime);
        
        if (this.serviceConfig.debug) {
          console.log(`[SemanticAnalysisService] Analysis completed in ${result.analysisTime}ms`);
          console.log(`[SemanticAnalysisService] Found ${result.entities.length} entities, intent: ${result.intent}`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.serviceConfig.debug) {
          console.warn(`[SemanticAnalysisService] Analysis attempt ${attempt} failed:`, error);
        }
        
        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < this.serviceConfig.maxRetries) {
          await this.delay(1000 * attempt); // 递增延迟
        }
      }
    }
    
    // 所有重试都失败了，返回降级结果
    console.error('[SemanticAnalysisService] All analysis attempts failed:', lastError);
    return this.createFallbackResult(text, startTime, lastError);
  }

  /**
   * 执行实际的语义分析
   */
  private async performAnalysis(text: string, startTime: number): Promise<AnalysisResult> {
    const analysisPrompt = this.buildAnalysisPrompt(text);
    
    return new Promise((resolve, reject) => {
      const child = spawn('gemini', ['-p', analysisPrompt], {
        timeout: this.serviceConfig.timeout,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const analysisTime = Date.now() - startTime;
        
        if (code !== 0) {
          reject(new Error(`Gemini command failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = this.parseAnalysisResult(stdout, text, analysisTime);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse analysis result: ${error}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn gemini process: ${error}`));
      });

      // 超时处理
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          reject(new Error('Analysis timeout'));
        }
      }, this.serviceConfig.timeout);
    });
  }

  /**
   * 构建语义分析提示词
   */
  private buildAnalysisPrompt(text: string): string {
    return `请对以下文本进行语义分析，提取关键信息并以JSON格式返回结果：

文本内容：
${text}

请分析并返回以下信息的JSON格式：
{
  "entities": ["实体1", "实体2", "..."],
  "intent": "用户意图的简短描述",
  "keyConcepts": ["关键概念1", "关键概念2", "..."],
  "confidence": 0.85
}

要求：
1. entities: 识别文本中的核心实体（如文件名、函数名、类名、技术术语等）
2. intent: 总结用户的主要意图和目标
3. keyConcepts: 提取与编程、开发相关的关键概念
4. confidence: 给出分析的置信度（0-1之间的数值）
5. 只返回JSON格式的结果，不要包含其他解释文字
6. 确保JSON格式正确，可以被解析`;
  }

  /**
   * 解析分析结果
   */
  private parseAnalysisResult(output: string, originalText: string, analysisTime: number): AnalysisResult {
    try {
      // 尝试提取JSON部分
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in output');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证必要字段并提供默认值
      const result: AnalysisResult = {
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        intent: typeof parsed.intent === 'string' ? parsed.intent : 'Unknown intent',
        keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [],
        confidence: typeof parsed.confidence === 'number' ? 
          Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
        originalText,
        analysisTime
      };

      return result;
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error}`);
    }
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(text: string, startTime: number): AnalysisResult {
    return {
      entities: [],
      intent: 'Empty input',
      keyConcepts: [],
      confidence: 0,
      originalText: text,
      analysisTime: Date.now() - startTime
    };
  }

  /**
   * 创建降级结果
   */
  private createFallbackResult(text: string, startTime: number, error: Error | null): AnalysisResult {
    // 基础的关键词提取作为降级方案
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const programmingKeywords = ['function', 'class', 'method', 'file', 'code', 'api', 'error', 'debug', 'test', 'build', 'deploy'];
    const foundKeywords = words.filter(word => programmingKeywords.includes(word));
    
    return {
      entities: [...new Set(foundKeywords)], // 去重
      intent: 'Analysis failed - basic keyword extraction',
      keyConcepts: foundKeywords,
      confidence: 0.1, // 低置信度
      originalText: text,
      analysisTime: Date.now() - startTime
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const child = spawn('gemini', ['--version'], { timeout: 5000 });
      
      return new Promise((resolve) => {
        child.on('close', (code) => {
          resolve(code === 0);
        });
        
        child.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }

  /**
   * 获取服务配置
   */
  getConfig(): SemanticAnalysisConfig {
    return { ...this.serviceConfig };
  }

  /**
   * 更新服务配置
   */
  updateConfig(config: Partial<SemanticAnalysisConfig>): void {
    this.serviceConfig = { ...this.serviceConfig, ...config };
  }
}
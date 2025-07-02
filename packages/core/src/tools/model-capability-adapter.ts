/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Type, Tool as GenAITool } from '@google/genai';
import { Tool } from './tools.js';

/**
 * 模型能力类型
 */
export enum ModelCapability {
  /** 支持原生 Function Calls (如 Gemini) */
  NATIVE_FUNCTION_CALLS = 'native_function_calls',
  /** 仅支持 JSON 格式工具调用 (如通过 OpenAI 兼容接口的模型) */
  JSON_TOOL_CALLS = 'json_tool_calls'
}

/**
 * 模型能力检测器
 */
export class ModelCapabilityDetector {
  /**
   * 检测模型的工具调用能力
   * @param modelName 模型名称
   * @param isOpenAICompatible 是否使用 OpenAI 兼容接口
   * @returns 模型能力类型
   */
  static detectCapability(modelName: string, isOpenAICompatible: boolean): ModelCapability {
    // 通过 OpenAI 兼容接口访问的模型通常不支持原生 Function Calls
    if (isOpenAICompatible) {
      return ModelCapability.JSON_TOOL_CALLS;
    }
    
    // 原生 Gemini 模型支持 Function Calls
    if (modelName.startsWith('gemini-')) {
      return ModelCapability.NATIVE_FUNCTION_CALLS;
    }
    
    // 默认假设支持原生 Function Calls
    return ModelCapability.NATIVE_FUNCTION_CALLS;
  }
}

/**
 * 工具适配器 - 为不同能力的模型提供合适的工具视图
 */
export class ModelCapabilityAdapter {
  constructor(
    private capability: ModelCapability,
    private allTools: Tool[]
  ) {}

  /**
   * 获取适合当前模型能力的工具声明
   */
  getToolDeclarations(): FunctionDeclaration[] {
    // 对于所有模型都返回原始工具声明
    // JSON模型会通过系统提示被引导使用JSON格式
    return this.getNativeFunctionDeclarations();
  }

  /**
   * 获取原生 Function Call 声明
   */
  private getNativeFunctionDeclarations(): FunctionDeclaration[] {
    return this.allTools.map(tool => tool.schema);
  }

  /**
   * 获取"欺骗性"工具声明 - 让模型以为它在请求用户操作
   */
  private getDeceptiveDeclarations(): FunctionDeclaration[] {
    return this.allTools.map(tool => this.createDeceptiveDeclaration(tool));
  }

  /**
   * 创建欺骗性工具声明
   * 让模型认为它在请求用户执行操作，而不是直接调用工具
   */
  private createDeceptiveDeclaration(tool: Tool): FunctionDeclaration {
    const originalSchema = tool.schema;
    
    return {
      name: `request_${originalSchema.name}`,
      description: `Request the user to ${originalSchema.description || `perform ${originalSchema.name}`}. ` +
                  `This will ask the user to execute the operation and return the results.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          operation: {
            type: Type.STRING,
            description: `The operation to request: ${originalSchema.name}`,
            enum: [originalSchema.name!]
          },
          parameters: {
            type: Type.OBJECT,
            description: 'Parameters for the operation',
            properties: originalSchema.parameters?.properties || {},
            required: originalSchema.parameters?.required || []
          },
          reason: {
            type: Type.STRING,
            description: 'Brief explanation of why this operation is needed'
          }
        },
        required: ['operation', 'parameters']
      }
    };
  }

  /**
   * 将模型的工具调用转换为实际的工具执行
   * @param toolCallName 模型调用的工具名称
   * @param args 工具参数
   * @returns 转换后的真实工具名称和参数
   */
  convertToolCall(toolCallName: string, args: any): { realToolName: string; realArgs: any } {
    // 所有模型都使用相同的工具名称和参数，不需要转换
    return { realToolName: toolCallName, realArgs: args };
  }

  /**
   * 检查工具调用是否有效
   */
  isValidToolCall(toolCallName: string): boolean {
    switch (this.capability) {
      case ModelCapability.NATIVE_FUNCTION_CALLS:
        return this.allTools.some(tool => tool.name === toolCallName);
      
      case ModelCapability.JSON_TOOL_CALLS:
        // 检查欺骗性调用或直接调用
        if (toolCallName.startsWith('request_')) {
          const realToolName = toolCallName.replace('request_', '');
          return this.allTools.some(tool => tool.name === realToolName);
        }
        return this.allTools.some(tool => tool.name === toolCallName);
      
      default:
        return false;
    }
  }

  /**
   * 获取模型能力类型
   */
  getCapability(): ModelCapability {
    return this.capability;
  }
}
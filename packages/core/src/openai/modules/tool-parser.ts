/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from './types.js';
import { ContentIsolator } from './content-isolator.js';
import { ToolClassifier } from './tool-categories.js';

/**
 * 细菌式编程：工具解析操纵子
 * 小巧：仅负责工具调用的解析
 * 模块化：独立的解析单元
 * 自包含：完整的工具解析功能
 */
export class ToolParser {
  private static readonly TOOL_CALL_PATTERN = /✦\s*(\w+)\s*\(([\s\S]*?)\)\s*✦/g;
  private static readonly JSON_PATTERN = /\{[\s\S]*\}/;

  static parseToolCalls(text: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const matches = text.matchAll(this.TOOL_CALL_PATTERN);

    for (const match of matches) {
      const toolName = match[1];
      const argsText = match[2]?.trim();
      
      if (!toolName || !argsText) continue;

      const toolCall = this.createToolCall(toolName, argsText);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
    }

    return toolCalls;
  }

  private static createToolCall(toolName: string, argsText: string): ToolCall | null {
    try {
      const args = this.parseArguments(toolName, argsText);
      return {
        callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: toolName,
        args
      };
    } catch (error) {
      console.warn(`[ToolParser] Failed to parse tool call ${toolName}:`, error);
      return null;
    }
  }

  private static parseArguments(toolName: string, argsText: string): any {
    if (ToolClassifier.isComplex(toolName)) {
      return this.parseComplexArguments(argsText);
    }
    return this.parseSimpleArguments(argsText);
  }

  private static parseComplexArguments(argsText: string): any {
    if (ContentIsolator.hasMarkers(argsText)) {
      return this.parseIsolatedContent(argsText);
    }
    
    const jsonMatch = argsText.match(this.JSON_PATTERN);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Complex arguments must be in JSON format');
  }

  private static parseSimpleArguments(argsText: string): any {
    const jsonMatch = argsText.match(this.JSON_PATTERN);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback to simple parsing
    return { input: argsText };
  }

  private static parseIsolatedContent(argsText: string): any {
    const contents = ContentIsolator.extractContent(argsText);
    const cleanText = ContentIsolator.removeMarkers(argsText);
    
    const jsonMatch = cleanText.match(this.JSON_PATTERN);
    if (jsonMatch) {
      const args = JSON.parse(jsonMatch[0]);
      
      // Replace isolated content back into args
      let contentIndex = 0;
      return this.replacePlaceholders(args, contents, { value: 0 });
    }
    
    throw new Error('Isolated content must contain JSON arguments');
  }

  private static replacePlaceholders(obj: any, contents: string[], index: { value: number }): any {
    if (typeof obj === 'string' && obj.includes('ISOLATED_CONTENT')) {
      return contents[index.value++] || obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.replacePlaceholders(item, contents, index));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replacePlaceholders(value, contents, index);
      }
      return result;
    }
    
    return obj;
  }
}
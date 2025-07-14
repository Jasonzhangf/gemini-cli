/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 细菌式编程：语法验证操纵子
 * 小巧：仅负责工具调用语法验证
 * 模块化：独立的验证单元
 * 自包含：完整的语法验证功能
 */
export class SyntaxValidator {
  private static readonly TOOL_CALL_PATTERN = /\[tool_call:\s*(\w+)\s+for\s+(.+)\]/g;
  private static readonly VALID_TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  static validateToolCall(toolCall: string): ValidationResult {
    const match = toolCall.match(/\[tool_call:\s*(\w+)\s+for\s+(.+)\]/);
    
    if (!match) {
      return {
        isValid: false,
        error: 'Invalid tool call syntax. Must use format: [tool_call: tool_name for parameters]'
      };
    }

    const [, toolName, params] = match;

    if (!this.VALID_TOOL_NAME_PATTERN.test(toolName)) {
      return {
        isValid: false,
        error: `Invalid tool name '${toolName}'. Tool names must start with a letter or underscore and contain only letters, numbers, and underscores.`
      };
    }

    if (!params.trim()) {
      return {
        isValid: false,
        error: 'Tool call parameters cannot be empty'
      };
    }

    return {
      isValid: true,
      toolName,
      parameters: params.trim()
    };
  }

  static extractAllToolCalls(text: string): ToolCallExtraction[] {
    const results: ToolCallExtraction[] = [];
    const matches = text.matchAll(this.TOOL_CALL_PATTERN);

    for (const match of matches) {
      const fullMatch = match[0];
      const toolName = match[1];
      const params = match[2];
      const startIndex = match.index || 0;

      const validation = this.validateToolCall(fullMatch);
      
      results.push({
        fullText: fullMatch,
        toolName,
        parameters: params,
        startIndex,
        endIndex: startIndex + fullMatch.length,
        isValid: validation.isValid,
        error: validation.error
      });
    }

    return results;
  }

  static hasValidToolCalls(text: string): boolean {
    const extractions = this.extractAllToolCalls(text);
    return extractions.some(extraction => extraction.isValid);
  }

  static getValidationSummary(text: string): ValidationSummary {
    const extractions = this.extractAllToolCalls(text);
    const validCalls = extractions.filter(e => e.isValid);
    const invalidCalls = extractions.filter(e => !e.isValid);

    return {
      totalCalls: extractions.length,
      validCalls: validCalls.length,
      invalidCalls: invalidCalls.length,
      validExtractions: validCalls,
      invalidExtractions: invalidCalls,
      hasErrors: invalidCalls.length > 0
    };
  }

  static suggestCorrection(invalidToolCall: string): string {
    // 尝试修复常见的语法错误
    let corrected = invalidToolCall.trim();

    // 修复缺少方括号
    if (!corrected.startsWith('[')) {
      corrected = '[' + corrected;
    }
    if (!corrected.endsWith(']')) {
      corrected = corrected + ']';
    }

    // 修复 tool_call 拼写
    corrected = corrected.replace(/tool[\s_]*call/i, 'tool_call');

    // 修复 for 关键字
    corrected = corrected.replace(/\s+(with|using|and)\s+/i, ' for ');

    return corrected;
  }
}

export interface ValidationResult {
  isValid: boolean;
  toolName?: string;
  parameters?: string;
  error?: string;
}

export interface ToolCallExtraction {
  fullText: string;
  toolName: string;
  parameters: string;
  startIndex: number;
  endIndex: number;
  isValid: boolean;
  error?: string;
}

export interface ValidationSummary {
  totalCalls: number;
  validCalls: number;
  invalidCalls: number;
  validExtractions: ToolCallExtraction[];
  invalidExtractions: ToolCallExtraction[];
  hasErrors: boolean;
}
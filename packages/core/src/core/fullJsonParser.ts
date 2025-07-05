/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FullJsonResponse {
  thinking?: string; // 推理过程
  message: string; // 用户消息
  tool_calls: {
    // 工具调用
    tool: string;
    args: Record<string, unknown>;
  }[];
  reasoning?: string; // 兼容字段
  content?: string; // 兼容字段
  response?: string; // 兼容字段
}

export interface ConvertedFunctionCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class FullJsonParser {
  /**
   * 解析全JSON格式的模型响应
   */
  parseResponse(content: string): FullJsonResponse {
    console.log('🔍 [FullJsonParser] 开始解析全JSON响应');
    console.log('📄 [FullJsonParser] 原始内容长度:', content.length);
    console.log('📄 [FullJsonParser] 内容预览:', content.slice(0, 200) + '...');

    // 检查内容是否为空
    if (!content || content.trim().length === 0) {
      console.log('⚠️ [FullJsonParser] 接收到空内容');
      return {
        message: '模型返回了空响应',
        tool_calls: [],
      };
    }

    try {
      // 方法1: 提取JSON代码块
      const jsonBlocks = this.extractJsonBlocks(content);
      if (jsonBlocks.length > 0) {
        console.log(`📦 [FullJsonParser] 找到 ${jsonBlocks.length} 个JSON块`);
        for (let i = 0; i < jsonBlocks.length; i++) {
          try {
            const jsonData = JSON.parse(jsonBlocks[i]);
            console.log(`✅ [FullJsonParser] JSON块 ${i + 1} 解析成功`);
            return this.normalizeJsonData(jsonData);
          } catch (blockError) {
            console.log(
              `❌ [FullJsonParser] JSON块 ${i + 1} 解析失败: ${blockError}`,
            );
            console.log(
              `📄 [FullJsonParser] 问题块内容: ${jsonBlocks[i].slice(0, 100)}...`,
            );
            continue;
          }
        }
      }

      // 方法2: 直接解析JSON
      const jsonData = JSON.parse(content);
      console.log('✅ [FullJsonParser] 直接JSON解析成功');
      return this.normalizeJsonData(jsonData);
    } catch (error) {
      console.log(`❌ [FullJsonParser] JSON解析失败: ${error}`);
      console.log(
        `📄 [FullJsonParser] 失败内容末尾: ...${content.slice(-100)}`,
      );

      // 方法3: 尝试修复常见JSON错误
      const fixedJson = this.attemptJsonFix(content);
      if (fixedJson) {
        try {
          const jsonData = JSON.parse(fixedJson);
          console.log('🔧 [FullJsonParser] JSON修复解析成功');
          return this.normalizeJsonData(jsonData);
        } catch (fixError) {
          console.log(`❌ [FullJsonParser] JSON修复也失败: ${fixError}`);
        }
      }

      // 方法4: 尝试提取部分JSON
      const partialJson = this.extractPartialJson(content);
      if (partialJson) {
        try {
          const jsonData = JSON.parse(partialJson);
          console.log('🔧 [FullJsonParser] 部分JSON解析成功');
          return this.normalizeJsonData(jsonData);
        } catch (partialError) {
          console.log(`❌ [FullJsonParser] 部分JSON解析失败: ${partialError}`);
        }
      }

      // 回退: 将整个内容作为消息
      console.log('🔄 [FullJsonParser] 回退到纯文本模式');
      return {
        message: content || '模型响应解析失败',
        tool_calls: [],
      };
    }
  }

  /**
   * 提取JSON代码块
   */
  private extractJsonBlocks(content: string): string[] {
    const jsonBlocks: string[] = [];

    // 方法1: 匹配 ```json ... ``` 格式
    const jsonPattern = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
    let match;

    while ((match = jsonPattern.exec(content)) !== null) {
      console.log(
        `🔍 [FullJsonParser] 找到代码块JSON: ${match[1].slice(0, 50)}...`,
      );
      jsonBlocks.push(match[1]);
    }

    // 方法2: 匹配独立的JSON对象（不在代码块中）
    if (jsonBlocks.length === 0) {
      const standaloneJsonPattern = /^\s*(\{[\s\S]*\})\s*$/;
      const standaloneMatch = standaloneJsonPattern.exec(content);
      if (standaloneMatch) {
        console.log(
          `🔍 [FullJsonParser] 找到独立JSON: ${standaloneMatch[1].slice(0, 50)}...`,
        );
        jsonBlocks.push(standaloneMatch[1]);
      }
    }

    // 方法3: 寻找第一个{到最后一个}的JSON对象（更宽松的匹配）
    if (jsonBlocks.length === 0) {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const possibleJson = content.substring(firstBrace, lastBrace + 1);
        console.log(
          `🔍 [FullJsonParser] 找到可能的JSON: ${possibleJson.slice(0, 50)}...`,
        );
        jsonBlocks.push(possibleJson);
      }
    }

    return jsonBlocks;
  }

  /**
   * 规范化JSON数据到标准格式
   */
  private normalizeJsonData(
    jsonData: Record<string, unknown>,
  ): FullJsonResponse {
    const result: FullJsonResponse = {
      message: '',
      tool_calls: [],
    };

    // 提取思考/推理过程
    result.thinking =
      (jsonData.thinking as string) ||
      (jsonData.reasoning as string) ||
      (jsonData.analysis as string);

    // 提取消息内容 (多种可能的字段名)
    result.message =
      (jsonData.message as string) ||
      (jsonData.content as string) ||
      (jsonData.response as string) ||
      (jsonData.reply as string) ||
      '';

    // 提取工具调用
    if (jsonData.tool_calls && Array.isArray(jsonData.tool_calls)) {
      result.tool_calls = jsonData.tool_calls as {
        tool: string;
        args: Record<string, unknown>;
      }[];
    } else if (jsonData.tools && Array.isArray(jsonData.tools)) {
      result.tool_calls = jsonData.tools as {
        tool: string;
        args: Record<string, unknown>;
      }[];
    } else if (
      jsonData.function_calls &&
      Array.isArray(jsonData.function_calls)
    ) {
      result.tool_calls = jsonData.function_calls as {
        tool: string;
        args: Record<string, unknown>;
      }[];
    }

    console.log(
      `✅ [FullJsonParser] 解析完成: 消息=${!!result.message}, 工具=${result.tool_calls.length}个`,
    );

    return result;
  }

  /**
   * 尝试修复常见的JSON格式错误
   */
  private attemptJsonFix(content: string): string | null {
    console.log('🔧 [FullJsonParser] 尝试智能修复JSON错误');
    let fixed = content.trim();

    // 移除markdown代码块标记
    fixed = fixed.replace(/```(?:json)?\s*/gi, '');
    fixed = fixed.replace(/```\s*$/gi, '');

    // 修复1: 缺失的引号
    fixed = fixed.replace(/(\w+):/g, '"$1":');

    // 修复2: 尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // 修复3: 缺失的逗号（在对象属性之间）
    fixed = fixed.replace(/"\s*\n\s*"/g, '",\n      "');
    fixed = fixed.replace(/}\s*\n\s*{/g, '},\n    {');

    // 修复4: 注释（JSON不支持注释）
    fixed = fixed.replace(/\/\/.*$/gm, '');
    fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

    // 修复5: 缺失的逗号在工具调用之间
    fixed = fixed.replace(
      /"tool":\s*"([^"]+)"\s+("args")/g,
      '"tool": "$1",\n      $2',
    );

    // 修复6: 截断修复 - 尝试补全基本结构
    if (!fixed.endsWith('}') && !fixed.endsWith(']')) {
      console.log('🔧 [FullJsonParser] 检测到截断，尝试补全结构');

      // 计算未闭合的括号
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < fixed.length; i++) {
        const char = fixed[i];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === '"' && !escaped) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
        }
      }

      // 补全未闭合的括号
      while (bracketCount > 0) {
        fixed += ']';
        bracketCount--;
      }
      while (braceCount > 0) {
        fixed += '}';
        braceCount--;
      }

      console.log(
        `🔧 [FullJsonParser] 补全了 ${Math.max(0, braceCount)} 个大括号和 ${Math.max(0, bracketCount)} 个方括号`,
      );
    }

    // 基本验证
    if (fixed.startsWith('{') && fixed.endsWith('}')) {
      console.log('✅ [FullJsonParser] JSON修复成功');
      return fixed;
    }

    console.log('❌ [FullJsonParser] JSON修复失败');
    return null;
  }

  /**
   * 将工具调用转换为标准Function Call格式
   */
  convertToFunctionCalls(
    toolCalls: { tool: string; args: Record<string, unknown> }[],
  ): ConvertedFunctionCall[] {
    console.log(
      `🔄 [FullJsonParser] 转换 ${toolCalls.length} 个工具调用为Function Calls`,
    );

    return toolCalls.map((toolCall, index) => {
      const callId = `json-call-${Date.now()}-${index}`;

      const functionCall: ConvertedFunctionCall = {
        id: callId,
        type: 'function',
        function: {
          name: toolCall.tool,
          arguments: JSON.stringify(toolCall.args || {}),
        },
      };

      console.log(
        `   🔧 [FullJsonParser] ${toolCall.tool}(${JSON.stringify(toolCall.args)}) → ${callId}`,
      );

      return functionCall;
    });
  }

  /**
   * 提取纯文本内容（用于显示给用户）
   */
  extractTextContent(parsedResponse: FullJsonResponse): string {
    let textContent = parsedResponse.message;

    // 如果有推理过程，可以选择性地包含
    if (parsedResponse.thinking && process.env.SHOW_THINKING === 'true') {
      textContent = `💭 ${parsedResponse.thinking}\n\n${textContent}`;
    }

    return textContent || '';
  }

  /**
   * 检查是否有工具调用
   */
  hasToolCalls(parsedResponse: FullJsonResponse): boolean {
    return parsedResponse.tool_calls && parsedResponse.tool_calls.length > 0;
  }

  /**
   * 获取工具调用统计信息
   */
  getToolCallStats(parsedResponse: FullJsonResponse): {
    count: number;
    tools: string[];
  } {
    const tools = (parsedResponse.tool_calls || []).map((tc) => tc.tool);
    return {
      count: tools.length,
      tools,
    };
  }

  /**
   * 尝试提取部分JSON（处理截断的情况）
   */
  private extractPartialJson(content: string): string | null {
    console.log('🔧 [FullJsonParser] 尝试提取部分JSON');

    // 寻找最后一个完整的JSON对象
    let braceCount = 0;
    let lastValidPos = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastValidPos = i;
          }
        }
      }
    }

    if (lastValidPos > 0) {
      const partialJson = content.substring(0, lastValidPos + 1);
      console.log(
        `🔧 [FullJsonParser] 找到部分JSON，长度: ${partialJson.length}`,
      );
      return partialJson;
    }

    return null;
  }
}

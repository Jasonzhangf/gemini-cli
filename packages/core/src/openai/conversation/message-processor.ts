/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolResult } from '../types/interfaces.js';
import { filterThinkTags } from '../../utils/fileUtils.js';

/**
 * 消息处理器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class MessageProcessor {
  private readonly debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  /**
   * 从请求中提取消息
   */
  extractMessageFromRequest(request: any): string {
    if (typeof request === 'string') {
      return request;
    }
    
    if (Array.isArray(request)) {
      return request.map(part => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        return JSON.stringify(part);
      }).join('\n');
    }

    if (request.text) {
      return request.text;
    }

    if (request.parts) {
      return request.parts.map((part: any) => part.text || '').join('');
    }

    return 'Hello';
  }

  /**
   * 检查是否为工具响应
   */
  isToolResponse(request: any): boolean {
    if (Array.isArray(request)) {
      return request.some(part => part.functionResponse || part.toolResult);
    }
    return !!(request.functionResponse || request.toolResult || request.tool_result);
  }

  /**
   * 从请求中提取工具结果
   */
  extractToolResultsFromRequest(request: any): ToolResult[] {
    const results: ToolResult[] = [];
    
    if (Array.isArray(request)) {
      for (const part of request) {
        if (part.functionResponse) {
          results.push({
            name: part.functionResponse.name,
            result: part.functionResponse.response
          });
        } else if (part.toolResult) {
          results.push({
            name: part.toolResult.name || 'unknown',
            result: part.toolResult.result || part.toolResult
          });
        }
      }
    } else if (request.functionResponse) {
      results.push({
        name: request.functionResponse.name,
        result: request.functionResponse.response
      });
    } else if (request.toolResult) {
      results.push({
        name: request.toolResult.name || 'unknown',
        result: request.toolResult.result || request.toolResult
      });
    }

    return results;
  }

  /**
   * 为模型格式化工具结果
   */
  formatToolResultsForModel(toolResults: ToolResult[]): string {
    if (toolResults.length === 0) {
      return 'Tool execution completed with no results.';
    }

    const formattedResults = toolResults.map(({ name, result }) => {
      let resultStr = '';
      if (typeof result === 'string') {
        resultStr = result;
      } else if (result && typeof result === 'object') {
        // 处理结构化结果
        if (result.content) {
          resultStr = result.content;
        } else if (result.output) {
          resultStr = result.output;
        } else {
          resultStr = JSON.stringify(result, null, 2);
        }
      } else {
        resultStr = String(result);
      }

      return `Tool "${name}" result:\n${resultStr}`;
    }).join('\n\n');

    return `Here are the results from the tool executions:\n\n${formattedResults}\n\nPlease analyze these results and continue with your response.`;
  }

  /**
   * 预处理用户消息
   */
  async preprocessUserMessage(userMessage: string, contextManager?: any): Promise<string> {
    if (!userMessage || userMessage.trim().length === 0) {
      return userMessage;
    }

    const trimmedMessage = userMessage.trim();
    
    // 检查是否为复杂任务
    if (this.isComplexTask(trimmedMessage)) {
      // 检查是否已在维护模式
      if (contextManager && await contextManager.isInMaintenanceMode()) {
        return userMessage;
      }

      // 增强消息以请求任务规划
      const enhancedMessage = this.enhanceMessageWithTaskPlanning(trimmedMessage);
      
      if (this.debugMode) {
        console.log('[MessageProcessor] Enhanced message for task planning');
      }
      
      return enhancedMessage;
    }

    return userMessage;
  }

  /**
   * 检测是否为复杂任务
   */
  private isComplexTask(message: string): boolean {
    const complexTaskIndicators = [
      '分析', '整理', '合并', '重构', '迁移', '清理', '组织',
      '建立', '创建应用', '开发', '实现', '搭建', '构建',
      'analyze', 'organize', 'merge', 'refactor', 'migrate', 'clean', 'build',
      'create app', 'develop', 'implement', 'setup', 'establish',
      '步骤', '流程', '过程', '方案', '计划', '系统',
      'step', 'process', 'workflow', 'plan', 'system', 'multiple',
      '项目', '模块', '功能', '接入', '集成', '配置',
      'project', 'module', 'feature', 'integrate', 'configure',
    ];

    const lowerMessage = message.toLowerCase();
    
    // 检查多步骤指示器
    const multiStepPatterns = [
      /(?:然后|接着|之后|再|并且|以及|and then|then|also|additionally)/gi,
      /(?:第一|第二|第三|首先|其次|最后|1\.|2\.|3\.|first|second|third|finally)/gi,
      /(?:同时|一起|together|simultaneously)/gi
    ];

    const hasMultipleSteps = multiStepPatterns.some(pattern => pattern.test(message));
    const hasComplexKeywords = complexTaskIndicators.some(keyword => 
      new RegExp(keyword, 'i').test(lowerMessage)
    );
    const isLongMessage = message.length > 200;

    const programmingContext = /(?:代码|文件|程序|应用|系统|数据|API|接口|code|file|program|app|system|data|api)/i.test(message);
    const actionVerbs = /(?:修改|优化|改进|扩展|添加|删除|更新|测试|部署|modify|optimize|improve|extend|add|remove|update|test|deploy)/i.test(message);
    
    return hasMultipleSteps || hasComplexKeywords || (isLongMessage && programmingContext && actionVerbs);
  }

  /**
   * 增强消息以请求任务规划
   */
  private enhanceMessageWithTaskPlanning(originalMessage: string): string {
    return `请先为以下请求制定详细的任务计划：

"${originalMessage}"

请首先创建任务列表分解这个请求为具体的任务步骤，然后逐步执行。使用以下格式：

[tool_call: create_tasks for tasks ["任务1", "任务2", "任务3"]]

确保每个任务描述清晰且可执行，不超过20个字符。创建任务列表后，开始执行第一个任务。

完成任务时使用: [tool_call: finish_current_task]
查看当前任务: [tool_call: get_current_task]
查看下一个任务: [tool_call: get_next_task]`;
  }

  /**
   * 过滤思考内容
   */
  filterThinkingContent(content: string): string {
    return filterThinkTags(content);
  }

  /**
   * 检测可疑的声明
   */
  detectSuspiciousClaims(content: string): boolean {
    const suspiciousPatterns = [
      /已保存到|已写入|saved to|written to/i,
      /文件创建|file created|文档生成|document generated/i,
      /代码更新|code updated|修改完成|modification completed/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 生成纠正消息
   */
  generateCorrectionMessage(): string {
    return `
⚠️ **重要提醒**: 您刚才的响应中声称执行了文件操作，但实际上没有使用工具调用。

**实际情况**: 
- 没有创建任何文件
- 没有写入任何内容  
- 没有执行任何操作

**正确做法**: 
如需创建/写入文件，必须使用: ✦ {"name": "write_file", "arguments": {"file_path": "./path", "content": "..."}}

请使用正确的工具调用格式重新执行所需操作。`;
  }
}
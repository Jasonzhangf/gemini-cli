/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { ToolCall, PathArgsMap } from '../types/interfaces.js';
import { ContentIsolationParser } from './content-isolation.js';
import { JsonToolCallParser } from './json-parser.js';
import { DescriptiveToolCallParser } from './descriptive-parser.js';
import { memoryProfiler } from '../utils/memory-profiler.js';
import { memoryOptimizer, processInChunks, withStringPool } from '../utils/memory-optimizer.js';

/**
 * 统一工具调用解析器
 * 实现细菌式编程：小巧、模块化、自包含
 * 
 * 职责：
 * - 协调各种格式的解析器
 * - 处理路径参数转换
 * - 去重处理
 */
export class ToolCallParser {
  private readonly toolDeclarations: any[];
  private readonly dangerousTools: Set<string>;
  private readonly complexTools: Set<string>;
  private readonly debugMode: boolean;
  private readonly processedToolCalls: Set<string>;
  private readonly pathArgsMap: PathArgsMap;

  // 解析器实例
  private readonly contentIsolationParser: ContentIsolationParser;
  private readonly jsonParser: JsonToolCallParser;
  private readonly descriptiveParser: DescriptiveToolCallParser;

  constructor(
    toolDeclarations: any[],
    dangerousTools: Set<string>,
    complexTools: Set<string>,
    debugMode: boolean = false
  ) {
    this.toolDeclarations = toolDeclarations;
    this.dangerousTools = dangerousTools;
    this.complexTools = complexTools;
    this.debugMode = debugMode;
    this.processedToolCalls = new Set();
    
    // 路径参数映射
    this.pathArgsMap = {
      'read_file': ['absolute_path'],
      'write_file': ['file_path'],
      'list_directory': ['path'],
      'replace': ['file_path'],
      'glob': ['patterns'],
      'read_many_files': ['paths'],
      'search_file_content': ['file_paths'],
    };

    // 初始化解析器
    this.contentIsolationParser = new ContentIsolationParser(toolDeclarations, debugMode);
    this.jsonParser = new JsonToolCallParser(toolDeclarations, debugMode);
    this.descriptiveParser = new DescriptiveToolCallParser(toolDeclarations, complexTools, debugMode);
  }

  /**
   * 解析文本中的工具调用
   */
  parseToolCalls(content: string): ToolCall[] {
    const operationId = `parse_${Date.now()}`;
    
    // 对于大内容，使用分块处理
    if (content.length > 5000) {
      return this.parseToolCallsInChunks(content);
    }
    
    return this.parseToolCallsRegular(content);
  }

  /**
   * 常规解析（小内容）
   */
  private parseToolCallsRegular(content: string): ToolCall[] {
    const processedPositions = new Set<number>();
    const toolCalls: ToolCall[] = [];

    // 按优先级解析
    // 1. 内容隔离格式（最高优先级）
    const contentIsolationCalls = this.contentIsolationParser.parse(content, processedPositions);
    toolCalls.push(...contentIsolationCalls);

    // 2. JSON格式
    const jsonCalls = this.jsonParser.parse(content, processedPositions);
    toolCalls.push(...jsonCalls);

    // 3. 描述性格式（回退）
    const descriptiveCalls = this.descriptiveParser.parse(content, processedPositions);
    toolCalls.push(...descriptiveCalls);

    // 转换路径参数
    const transformedCalls = toolCalls.map(call => ({
      ...call,
      args: this.transformPathArguments(call.name, call.args),
    }));

    // 去重
    const deduplicatedCalls = this.deduplicateToolCalls(transformedCalls);

    if (this.debugMode) {
      console.log(`[ToolCallParser] Parsed ${deduplicatedCalls.length} tool calls from ${content.length} characters`);
    }

    return deduplicatedCalls;
  }

  /**
   * 分块解析（大内容）
   */
  private parseToolCallsInChunks(content: string): ToolCall[] {
    const chunkSize = 2000; // 2KB chunks
    const overlap = 200; // 200 chars overlap to avoid splitting tool calls
    const chunks: string[] = [];
    
    // 创建重叠的块
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunk = content.substring(i, i + chunkSize);
      chunks.push(chunk);
      
      if (i + chunkSize >= content.length) {
        break;
      }
    }

    // 使用字符串池优化内存使用
    return withStringPool((pool) => {
      const allToolCalls: ToolCall[] = [];
      const processedCallIds = new Set<string>();
      
      for (const chunk of chunks) {
        const chunkCalls = this.parseToolCallsRegular(chunk);
        
        // 去重 - 避免重叠区域的重复调用
        for (const call of chunkCalls) {
          if (!processedCallIds.has(call.callId)) {
            processedCallIds.add(call.callId);
            allToolCalls.push(call);
          }
        }
      }
      
      return allToolCalls;
    });
  }

  /**
   * 转换路径参数为绝对路径
   */
  private transformPathArguments(toolName: string, args: any): any {
    const pathParams = this.pathArgsMap[toolName];

    if (!pathParams) {
      return args;
    }

    const CWD = process.cwd();
    // 使用浅拷贝优化内存使用
    const newArgs = this.shallowCloneWithPathParams(args, pathParams);

    // run_shell_command的directory参数必须是相对路径
    if (toolName === 'run_shell_command') {
      if (newArgs.directory && path.isAbsolute(newArgs.directory)) {
        newArgs.directory = path.relative(CWD, newArgs.directory);
      }
      return newArgs;
    }

    // 其他工具确保路径是绝对路径
    for (const param of pathParams) {
      if (newArgs[param]) {
        if (Array.isArray(newArgs[param])) {
          newArgs[param] = newArgs[param].map((p: any) => {
            if (typeof p === 'string') {
              return this.resolveToAbsolutePath(p, CWD);
            }
            return p;
          });
        } else if (typeof newArgs[param] === 'string') {
          newArgs[param] = this.resolveToAbsolutePath(newArgs[param], CWD);
        }
      }
    }

    return newArgs;
  }

  /**
   * 智能路径解析：处理各种路径格式
   */
  private resolveToAbsolutePath(inputPath: string, cwd: string): string {
    const originalPath = inputPath;
    
    // 如果已经是完整的绝对路径（包含用户目录等），直接返回
    if (path.isAbsolute(inputPath) && (inputPath.startsWith('/Users/') || inputPath.startsWith('/home/'))) {
      if (this.debugMode) {
        console.log(`[ToolCallParser] Path already absolute: ${originalPath} -> ${inputPath}`);
      }
      return inputPath;
    }
    
    // 如果是以/开头但不是完整路径（如 /Documents/github/gemini-cli）
    // 这通常是模型输出的相对路径，需要基于当前工作目录解析
    if (inputPath.startsWith('/') && !inputPath.startsWith('/Users/') && !inputPath.startsWith('/home/')) {
      // 检查是否是相对于用户主目录的路径部分
      // 如果当前工作目录是 /Users/fanzhang/Documents/github/gemini-cli
      // 而输入路径是 /Documents/github/gemini-cli
      // 那么应该解析为 /Users/fanzhang/Documents/github/gemini-cli
      
      // 尝试找到用户主目录的路径
      const userHome = process.env.HOME || process.env.USERPROFILE || '';
      if (userHome && cwd.startsWith(userHome)) {
        const possiblePath = path.join(userHome, inputPath.substring(1)); // 去掉开头的/，拼接到用户主目录
        if (this.debugMode) {
          console.log(`[ToolCallParser] Incomplete absolute path resolved via userHome: ${originalPath} -> ${possiblePath}`);
        }
        return possiblePath;
      }
      
      // 如果找不到用户主目录，则基于当前工作目录解析
      const fallbackPath = path.resolve(cwd, inputPath.substring(1));
      if (this.debugMode) {
        console.log(`[ToolCallParser] Incomplete absolute path resolved via cwd: ${originalPath} -> ${fallbackPath}`);
      }
      return fallbackPath;
    }
    
    // 处理相对路径
    if (!path.isAbsolute(inputPath)) {
      const resolvedPath = path.resolve(cwd, inputPath);
      if (this.debugMode) {
        console.log(`[ToolCallParser] Relative path resolved: ${originalPath} -> ${resolvedPath}`);
      }
      return resolvedPath;
    }
    
    // 对于其他绝对路径，直接返回
    if (this.debugMode) {
      console.log(`[ToolCallParser] Path unchanged: ${originalPath} -> ${inputPath}`);
    }
    return inputPath;
  }

  /**
   * 浅拷贝对象，只复制路径参数相关的属性
   */
  private shallowCloneWithPathParams(args: any, pathParams: string[]): any {
    // 如果没有路径参数，直接返回原对象
    if (!pathParams || pathParams.length === 0) {
      return args;
    }

    // 创建新对象，只复制需要修改的属性
    const newArgs = { ...args };
    
    for (const param of pathParams) {
      if (newArgs[param]) {
        if (Array.isArray(newArgs[param])) {
          // 只有当数组包含路径时才复制
          newArgs[param] = [...newArgs[param]];
        }
        // 字符串参数会在后续处理中被修改
      }
    }

    return newArgs;
  }

  /**
   * 去重工具调用
   */
  private deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const localSeen = new Set<string>();
    return toolCalls.filter(call => {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      
      // 跳过已全局处理的
      if (this.processedToolCalls.has(key)) {
        if (this.debugMode) {
          console.log(`[ToolCallParser] Skipping duplicate: ${call.name}`);
        }
        return false;
      }
      
      // 跳过本批次重复的
      if (localSeen.has(key)) {
        return false;
      }
      
      localSeen.add(key);
      return true;
    });
  }

  /**
   * 标记工具调用已处理
   */
  markAsProcessed(call: ToolCall): void {
    const key = `${call.name}:${JSON.stringify(call.args)}`;
    this.processedToolCalls.add(key);
  }

  /**
   * 清理处理记录
   */
  clearProcessedCalls(): void {
    this.processedToolCalls.clear();
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalToolsAvailable: number;
    dangerousToolsCount: number;
    complexToolsCount: number;
    processedCallsCount: number;
  } {
    return {
      totalToolsAvailable: this.toolDeclarations.length,
      dangerousToolsCount: this.dangerousTools.size,
      complexToolsCount: this.complexTools.size,
      processedCallsCount: this.processedToolCalls.size,
    };
  }
}
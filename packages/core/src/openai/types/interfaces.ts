/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI Hijack系统配置接口
 */
export interface OpenAIHijackConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  callId: string;
  name: string;
  args: any;
}

/**
 * 工具跟踪统计
 */
export interface ToolTracker {
  discovered: number;
  attempted: number;
  succeeded: number;
  failed: number;
  callIds: string[];
}

/**
 * 对话消息接口
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 工具结果接口
 */
export interface ToolResult {
  name: string;
  result: any;
  error?: any;
}

/**
 * 内容隔离标记
 */
export interface ContentIsolationMarkers {
  readonly CONTENT_START_MARKER: string;
  readonly CONTENT_END_MARKER: string;
  readonly CONTENT_MARKER_PATTERN: RegExp;
}

/**
 * 路径参数映射
 */
export interface PathArgsMap {
  readonly [toolName: string]: string[];
}

/**
 * 工具解析选项
 */
export interface ParseOptions {
  content: string;
  debugMode?: boolean;
  processedPositions?: Set<number>;
}

/**
 * 工具解析结果
 */
export interface ParseResult {
  toolCalls: ToolCall[];
  processedPositions: Set<number>;
}

/**
 * 上下文组件类型
 */
export interface SystemContext {
  [key: string]: any;
}

export interface StaticContext {
  [key: string]: any;
}

export interface DynamicContext {
  [key: string]: any;
}

export interface TaskContext {
  [key: string]: any;
}

/**
 * 详细上下文组件
 */
export interface DetailedContextComponents {
  systemContext: SystemContext | null;
  staticContext: StaticContext | null;
  dynamicContext: DynamicContext | null;
  taskContext: TaskContext | null;
}
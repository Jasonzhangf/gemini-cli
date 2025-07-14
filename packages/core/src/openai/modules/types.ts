/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 细菌式编程：类型定义操纵子
 * 小巧：仅包含基础类型定义
 * 模块化：独立的类型系统
 * 自包含：无外部依赖
 */

export interface OpenAIHijackConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolCall {
  callId: string;
  name: string;
  args: any;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ContentMarkers {
  readonly START: string;
  readonly END: string;
  readonly PATTERN: RegExp;
}

export interface PathMapping {
  readonly toolName: string;
  readonly pathArgs: string[];
}

export interface ToolCategories {
  readonly dangerous: Set<string>;
  readonly complex: Set<string>;
}
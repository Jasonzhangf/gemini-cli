/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamicContextGenerator, DynamicContextInput, DynamicContextOutput } from './dynamicContextGenerator.js';
import { Config } from '../config/config.js';

// Mock Config class
vi.mock('../config/config.js', () => ({
  Config: vi.fn().mockImplementation(() => ({
    getDebugMode: vi.fn().mockReturnValue(true),
    getContextAgent: vi.fn().mockReturnValue(null)
  }))
}));

describe('DynamicContextGenerator', () => {
  let generator: DynamicContextGenerator;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = new Config();
    generator = new DynamicContextGenerator(mockConfig);
  });

  describe('generateDynamicContext', () => {
    it('should generate comprehensive dynamic context for development intent', async () => {
      const input: DynamicContextInput = {
        userInput: '实现一个用户认证系统，包括登录和注册功能',
        conversationHistory: [
          {
            role: 'user',
            content: '我需要为项目添加用户管理功能',
            timestamp: '2025-07-14T10:00:00Z'
          },
          {
            role: 'assistant',
            content: '我可以帮您实现用户管理系统',
            timestamp: '2025-07-14T10:01:00Z'
          }
        ],
        recentToolCalls: [
          {
            name: 'read_file',
            args: { file_path: '/src/auth/index.ts' },
            result: { content: 'auth module content' },
            timestamp: '2025-07-14T09:59:00Z'
          },
          {
            name: 'create_tasks',
            args: { tasks: ['设计认证流程', '实现登录接口'] },
            result: { tasksCreated: 2 },
            timestamp: '2025-07-14T10:02:00Z'
          }
        ],
        sessionId: 'test-session-123',
        projectDir: '/test/project'
      };

      const result = await generator.generateDynamicContext(input);

      // Verify semantic analysis
      expect(result.semanticAnalysis).toBeDefined();
      expect(result.semanticAnalysis?.intent).toBe('development');
      expect(result.semanticAnalysis?.entities).toContain('认证');
      expect(result.semanticAnalysis?.keyConcepts).toContain('authentication');
      expect(result.semanticAnalysis?.confidence).toBeGreaterThan(0.5);

      // Verify conversation context
      expect(result.conversationContext.userGoals).toContain('添加用户管理功能');
      expect(result.conversationContext.recentTopics).toContain('用户管理');

      // Verify operational context
      expect(result.operationalContext.recentActions).toHaveLength(2);
      expect(result.operationalContext.recentActions[0]).toBe('📖 Read: index.ts');
      expect(result.operationalContext.recentActions[1]).toBe('📋 Tasks: 2 tasks created');
      expect(result.operationalContext.workingDirectory).toBe('/test/project');

      // Verify project insights
      expect(result.projectInsights.relevantAreas).toContain('src/components');
      expect(result.projectInsights.suggestedActions).toContain('Review existing code');
    });

    it('should generate context for debugging intent', async () => {
      const input: DynamicContextInput = {
        userInput: '修复用户登录时的认证错误',
        conversationHistory: [],
        recentToolCalls: [
          {
            name: 'run_shell_command',
            args: { command: 'npm test' },
            result: { error: 'Authentication test failed' },
            timestamp: '2025-07-14T10:00:00Z'
          }
        ],
        sessionId: 'debug-session-456',
        projectDir: '/debug/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.semanticAnalysis?.intent).toBe('debugging');
      expect(result.operationalContext.errorHistory).toHaveLength(1);
      expect(result.operationalContext.errorHistory[0]).toContain('Authentication test failed');
      expect(result.projectInsights.relevantAreas).toContain('error_handling');
      expect(result.projectInsights.suggestedActions).toContain('Check logs');
    });

    it('should generate context for analysis intent', async () => {
      const input: DynamicContextInput = {
        userInput: '分析contextagent的调用机制和实现架构',
        conversationHistory: [
          {
            role: 'user',
            content: '我想了解系统的架构设计',
            timestamp: '2025-07-14T10:00:00Z'
          }
        ],
        recentToolCalls: [],
        sessionId: 'analysis-session-789',
        projectDir: '/analysis/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.semanticAnalysis?.intent).toBe('analysis');
      expect(result.semanticAnalysis?.entities).toContain('contextagent');
      expect(result.semanticAnalysis?.keyConcepts).toContain('context');
      expect(result.conversationContext.userGoals).toContain('了解系统的架构设计');
      expect(result.projectInsights.relevantAreas).toContain('architecture');
      expect(result.projectInsights.contextualHints).toContain('This project uses a layered context management system');
    });

    it('should generate context for documentation intent', async () => {
      const input: DynamicContextInput = {
        userInput: '总结contextagent的调用机制和实现架构，详细写成markdown文档保存',
        conversationHistory: [],
        recentToolCalls: [
          {
            name: 'write_file',
            args: { file_path: 'docs/architecture.md' },
            result: { success: true },
            timestamp: '2025-07-14T10:00:00Z'
          }
        ],
        sessionId: 'doc-session-abc',
        projectDir: '/doc/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.semanticAnalysis?.intent).toBe('documentation');
      expect(result.semanticAnalysis?.entities).toContain('markdown');
      expect(result.semanticAnalysis?.entities).toContain('contextagent');
      expect(result.operationalContext.recentActions[0]).toBe('✍️ Write: architecture.md');
      expect(result.projectInsights.relevantAreas).toContain('documentation');
      expect(result.projectInsights.suggestedActions).toContain('Create markdown');
    });

    it('should handle empty conversation history gracefully', async () => {
      const input: DynamicContextInput = {
        userInput: '简单测试',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'empty-session',
        projectDir: '/empty/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.semanticAnalysis?.intent).toBe('general');
      expect(result.conversationContext.userGoals).toHaveLength(0);
      expect(result.conversationContext.recentTopics).toHaveLength(0);
      expect(result.operationalContext.recentActions).toHaveLength(0);
      expect(result.operationalContext.errorHistory).toHaveLength(0);
    });

    it('should extract entities correctly from technical input', async () => {
      const input: DynamicContextInput = {
        userInput: '优化React组件的TypeScript类型定义，提升API性能',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'tech-session',
        projectDir: '/tech/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.semanticAnalysis?.entities).toContain('React');
      expect(result.semanticAnalysis?.entities).toContain('TypeScript');
      expect(result.semanticAnalysis?.entities).toContain('API');
      expect(result.semanticAnalysis?.keyConcepts).toContain('component');
      expect(result.semanticAnalysis?.keyConcepts).toContain('performance');
      expect(result.semanticAnalysis?.intent).toBe('refactoring');
    });

    it('should provide contextual hints for OpenAI-related queries', async () => {
      const input: DynamicContextInput = {
        userInput: '调试OpenAI hijack adapter的工具调用转换问题',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'openai-session',
        projectDir: '/openai/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.projectInsights.contextualHints).toContain('OpenAI compatibility is handled through hijack adapter');
      expect(result.projectInsights.contextualHints).toContain('Tool calls are converted between formats automatically');
      expect(result.semanticAnalysis?.intent).toBe('debugging');
    });

    it('should calculate confidence scores correctly', async () => {
      const highConfidenceInput: DynamicContextInput = {
        userInput: '实现一个基于TypeScript的React组件，包含用户认证和数据验证功能，需要集成Jest测试框架',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'high-conf-session',
        projectDir: '/high/project'
      };

      const lowConfidenceInput: DynamicContextInput = {
        userInput: '这个',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'low-conf-session',
        projectDir: '/low/project'
      };

      const highResult = await generator.generateDynamicContext(highConfidenceInput);
      const lowResult = await generator.generateDynamicContext(lowConfidenceInput);

      expect(highResult.semanticAnalysis?.confidence).toBeGreaterThan(0.8);
      expect(lowResult.semanticAnalysis?.confidence).toBeLessThan(0.6);
    });

    it('should track conversation progression correctly', async () => {
      const input: DynamicContextInput = {
        userInput: '继续完成用户界面的开发',
        conversationHistory: [
          {
            role: 'user',
            content: '开始创建用户登录页面',
            timestamp: '2025-07-14T09:00:00Z'
          },
          {
            role: 'assistant',
            content: '已创建登录组件',
            timestamp: '2025-07-14T09:01:00Z'
          },
          {
            role: 'user',
            content: '添加表单验证功能',
            timestamp: '2025-07-14T09:30:00Z'
          },
          {
            role: 'assistant',
            content: '验证功能已添加',
            timestamp: '2025-07-14T09:31:00Z'
          }
        ],
        recentToolCalls: [],
        sessionId: 'progression-session',
        projectDir: '/progression/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.conversationContext.userGoals).toContain('创建用户登录页面');
      expect(result.conversationContext.userGoals).toContain('添加表单验证功能');
      expect(result.conversationContext.taskProgression).toContain('task_initiation');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null or undefined ContextAgent gracefully', async () => {
      const configWithoutAgent = {
        getDebugMode: vi.fn().mockReturnValue(false),
        getContextAgent: vi.fn().mockImplementation(() => {
          throw new Error('ContextAgent not available');
        })
      } as unknown as Config;

      const generatorWithoutAgent = new DynamicContextGenerator(configWithoutAgent);
      
      const input: DynamicContextInput = {
        userInput: '测试输入',
        conversationHistory: [],
        recentToolCalls: [],
        sessionId: 'no-agent-session',
        projectDir: '/no-agent/project'
      };

      const result = await generatorWithoutAgent.generateDynamicContext(input);

      expect(result.semanticAnalysis).toBeNull();
      expect(result.relevantCodeContext.files).toHaveLength(0);
      expect(result.operationalContext.workingDirectory).toBe('/no-agent/project');
    });

    it('should handle malformed tool call results', async () => {
      const input: DynamicContextInput = {
        userInput: '测试输入',
        conversationHistory: [],
        recentToolCalls: [
          {
            name: 'unknown_tool',
            args: null,
            result: undefined,
            timestamp: '2025-07-14T10:00:00Z'
          },
          {
            name: 'read_file',
            args: {},
            result: { error: 'File not found' },
            timestamp: '2025-07-14T10:01:00Z'
          }
        ],
        sessionId: 'malformed-session',
        projectDir: '/malformed/project'
      };

      const result = await generator.generateDynamicContext(input);

      expect(result.operationalContext.recentActions).toContain('🛠️ unknown_tool');
      expect(result.operationalContext.recentActions).toContain('📖 Read: file');
      expect(result.operationalContext.errorHistory).toContain('read_file: File not found');
    });
  });
});
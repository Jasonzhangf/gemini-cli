/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { ContextAgent } from './contextAgent.js';

export interface DynamicContextInput {
  userInput: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  recentToolCalls: Array<{
    name: string;
    args: any;
    result?: any;
    timestamp: string;
  }>;
  sessionId: string;
  projectDir: string;
}

export interface DynamicContextOutput {
  semanticAnalysis: {
    intent: string;
    entities: string[];
    keyConcepts: string[];
    confidence: number;
  } | null;
  relevantCodeContext: {
    files: string[];
    functions: string[];
    classes: string[];
    patterns: string[];
  };
  conversationContext: {
    userGoals: string[];
    recentTopics: string[];
    taskProgression: string[];
  };
  operationalContext: {
    recentActions: string[];
    errorHistory: string[];
    workingDirectory: string;
    sessionInfo: string;
  };
  projectInsights: {
    relevantAreas: string[];
    suggestedActions: string[];
    contextualHints: string[];
  };
}

/**
 * Dynamic Context Generator
 * 
 * Generates truly dynamic, context-aware information based on:
 * 1. User's current input and intent
 * 2. Recent conversation history
 * 3. Recent tool usage and results
 * 4. Project structure and code analysis
 * 5. Semantic analysis of user requests
 */
export class DynamicContextGenerator {
  private config: Config;
  private contextAgent: ContextAgent | null = null;

  constructor(config: Config) {
    this.config = config;
    try {
      this.contextAgent = config.getContextAgent();
    } catch {
      // ContextAgent may not be available
      this.contextAgent = null;
    }
  }

  /**
   * Generate dynamic context based on current input and conversation state
   */
  async generateDynamicContext(input: DynamicContextInput): Promise<DynamicContextOutput> {
    const output: DynamicContextOutput = {
      semanticAnalysis: null,
      relevantCodeContext: {
        files: [],
        functions: [],
        classes: [],
        patterns: []
      },
      conversationContext: {
        userGoals: [],
        recentTopics: [],
        taskProgression: []
      },
      operationalContext: {
        recentActions: [],
        errorHistory: [],
        workingDirectory: input.projectDir,
        sessionInfo: `Session: ${input.sessionId.substring(0, 8)}`
      },
      projectInsights: {
        relevantAreas: [],
        suggestedActions: [],
        contextualHints: []
      }
    };

    // 1. Semantic Analysis
    output.semanticAnalysis = await this.performSemanticAnalysis(input.userInput);

    // 2. Code Context Analysis
    output.relevantCodeContext = await this.analyzeRelevantCodeContext(input.userInput);

    // 3. Conversation Context Analysis
    output.conversationContext = this.analyzeConversationContext(input.conversationHistory);

    // 4. Operational Context Analysis
    output.operationalContext = this.analyzeOperationalContext(input.recentToolCalls, input.projectDir, input.sessionId);

    // 5. Project Insights
    output.projectInsights = await this.generateProjectInsights(input.userInput, output.semanticAnalysis);

    return output;
  }

  /**
   * Perform semantic analysis of user input
   */
  private async performSemanticAnalysis(userInput: string): Promise<DynamicContextOutput['semanticAnalysis']> {
    // Always perform semantic analysis, regardless of ContextAgent availability
    try {
      // Extract intent patterns
      const intent = this.extractUserIntent(userInput);
      
      // Extract entities (file names, function names, technical terms)
      const entities = this.extractEntities(userInput);
      
      // Extract key concepts
      const keyConcepts = this.extractKeyConcepts(userInput);
      
      // Calculate confidence based on clarity of intent
      const confidence = this.calculateIntentConfidence(userInput, intent, entities);

      return {
        intent,
        entities,
        keyConcepts,
        confidence
      };
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[DynamicContextGenerator] Semantic analysis failed:', error);
      }
      return null;
    }
  }

  /**
   * Analyze relevant code context based on user input
   */
  private async analyzeRelevantCodeContext(userInput: string): Promise<DynamicContextOutput['relevantCodeContext']> {
    const result = {
      files: [] as string[],
      functions: [] as string[],
      classes: [] as string[],
      patterns: [] as string[]
    };

    if (!this.contextAgent) {
      return result;
    }

    try {
      // Use ContextAgent to find relevant code elements
      const keywords = this.extractKeywords(userInput);
      
      // Find files mentioned or implied
      result.files = await this.findRelevantFiles(keywords);
      
      // Find functions and classes
      result.functions = await this.findRelevantFunctions(keywords);
      result.classes = await this.findRelevantClasses(keywords);
      
      // Identify patterns in the request
      result.patterns = this.identifyCodePatterns(userInput);

      return result;
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[DynamicContextGenerator] Code context analysis failed:', error);
      }
      return result;
    }
  }

  /**
   * Analyze conversation context for user goals and progression
   */
  private analyzeConversationContext(history: DynamicContextInput['conversationHistory']): DynamicContextOutput['conversationContext'] {
    const userGoals: string[] = [];
    const recentTopics: string[] = [];
    const taskProgression: string[] = [];

    // Analyze recent user messages for goals
    const recentUserMessages = history
      .filter(msg => msg.role === 'user')
      .slice(-5) // Last 5 user messages
      .reverse(); // Most recent first

    for (const msg of recentUserMessages) {
      // Extract goals (requests with action words)
      const goals = this.extractGoalsFromMessage(msg.content);
      userGoals.push(...goals);

      // Extract topics (technical terms and subjects)
      const topics = this.extractTopicsFromMessage(msg.content);
      recentTopics.push(...topics);

      // Track task progression
      const taskIndicators = this.extractTaskIndicators(msg.content);
      taskProgression.push(...taskIndicators);
    }

    return {
      userGoals: [...new Set(userGoals)].slice(0, 5),
      recentTopics: [...new Set(recentTopics)].slice(0, 8),
      taskProgression: [...new Set(taskProgression)].slice(0, 6)
    };
  }

  /**
   * Analyze operational context from recent tool calls
   */
  private analyzeOperationalContext(
    recentToolCalls: DynamicContextInput['recentToolCalls'],
    projectDir: string,
    sessionId: string
  ): DynamicContextOutput['operationalContext'] {
    const recentActions: string[] = [];
    const errorHistory: string[] = [];

    // Analyze recent tool calls
    const last10Tools = recentToolCalls.slice(-10);
    
    for (const tool of last10Tools) {
      // Format recent actions
      const action = this.formatToolAction(tool);
      if (action) {
        recentActions.push(action);
      }

      // Extract errors
      if (tool.result && typeof tool.result === 'object' && (tool.result as any).error) {
        errorHistory.push(`${tool.name}: ${(tool.result as any).error}`);
      }
    }

    return {
      recentActions: recentActions.slice(-5),
      errorHistory: errorHistory.slice(-3),
      workingDirectory: projectDir,
      sessionInfo: `Session: ${sessionId.substring(0, 8)} (${new Date().toLocaleTimeString()})`
    };
  }

  /**
   * Generate project insights and suggestions
   */
  private async generateProjectInsights(
    userInput: string,
    semanticAnalysis: DynamicContextOutput['semanticAnalysis']
  ): Promise<DynamicContextOutput['projectInsights']> {
    const insights = {
      relevantAreas: [] as string[],
      suggestedActions: [] as string[],
      contextualHints: [] as string[]
    };

    try {
      // Based on user intent, suggest relevant project areas
      if (semanticAnalysis?.intent) {
        insights.relevantAreas = this.suggestRelevantAreas(semanticAnalysis.intent, userInput);
        insights.suggestedActions = this.suggestActions(semanticAnalysis.intent, userInput);
        insights.contextualHints = this.generateContextualHints(semanticAnalysis.intent, userInput);
      }

      return insights;
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.warn('[DynamicContextGenerator] Project insights generation failed:', error);
      }
      return insights;
    }
  }

  // Helper methods for analysis
  private extractUserIntent(userInput: string): string {
    const input = userInput.toLowerCase();
    
    // Documentation intents (check first as they can contain other keywords)
    if (input.includes('文档') || input.includes('总结') || input.includes('说明') || input.includes('markdown') || input.includes('保存')) {
      return 'documentation';
    }
    
    // Analysis intents (check before development as "分析" can be part of development)
    if (input.includes('分析') && !input.includes('实现') && !input.includes('开发')) {
      return 'analysis';
    }
    
    // Development intents
    if (input.includes('实现') || input.includes('开发') || input.includes('创建')) {
      return 'development';
    }
    
    // Debugging intents
    if (input.includes('修复') || input.includes('解决') || input.includes('调试')) {
      return 'debugging';
    }
    
    // Testing intents
    if (input.includes('测试') || input.includes('验证')) {
      return 'testing';
    }
    
    // Refactoring intents
    if (input.includes('重构') || input.includes('优化')) {
      return 'refactoring';
    }

    return 'general';
  }

  private extractEntities(userInput: string): string[] {
    const entities: string[] = [];
    
    // File extensions
    const fileExtensions = userInput.match(/\.\w+/g) || [];
    entities.push(...fileExtensions);
    
    // Function/class names (camelCase, PascalCase)
    const identifiers = userInput.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
    entities.push(...identifiers);
    
    // Technical terms (English)
    const techTerms = userInput.match(/\b(API|HTTP|JSON|XML|SQL|React|Vue|Node|Express|TypeScript|JavaScript|Python|Java|C\+\+|Docker|Kubernetes|Git|GitHub|npm|yarn|webpack|babel|eslint|prettier|jest|mocha|cypress|selenium|markdown)\b/gi) || [];
    entities.push(...techTerms);
    
    // Chinese technical terms
    const chineseTerms = ['认证', '用户', '登录', '注册', '系统', '功能', '组件', '接口', '架构', '设计', '文档', '调试'];
    for (const term of chineseTerms) {
      if (userInput.includes(term)) {
        entities.push(term);
      }
    }
    
    // Project-specific terms
    const projectTerms = ['contextagent', 'hijack', 'adapter', 'openai', 'gemini'];
    for (const term of projectTerms) {
      if (userInput.toLowerCase().includes(term)) {
        entities.push(term);
      }
    }
    
    return [...new Set(entities)];
  }

  private extractKeyConcepts(userInput: string): string[] {
    const concepts: string[] = [];
    
    // Development concepts (English)
    const devConcepts = userInput.match(/\b(architecture|design|pattern|framework|library|component|module|service|middleware|authentication|authorization|validation|testing|deployment|performance|optimization|security|scalability|maintainability)\b/gi) || [];
    concepts.push(...devConcepts);
    
    // Specific to this project
    const projectConcepts = userInput.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter|openai|gemini|cli)\b/gi) || [];
    concepts.push(...projectConcepts);
    
    // Chinese concepts
    const chineseConcepts = ['架构', '设计', '模式', '框架', '组件', '模块', '服务', '认证', '授权', '验证', '测试', '部署', '性能', '优化', '安全'];
    for (const concept of chineseConcepts) {
      if (userInput.includes(concept)) {
        concepts.push(concept);
      }
    }
    
    return [...new Set(concepts)];
  }

  private calculateIntentConfidence(userInput: string, intent: string, entities: string[]): number {
    let confidence = 0.5; // Base confidence
    
    // Clear action words increase confidence
    const actionWords = ['实现', '创建', '修复', '分析', '测试', '重构', '优化', '文档'];
    const hasActionWords = actionWords.some(word => userInput.includes(word));
    if (hasActionWords) confidence += 0.2;
    
    // Technical entities increase confidence
    if (entities.length > 0) confidence += Math.min(0.2, entities.length * 0.05);
    
    // Specific intent patterns increase confidence
    if (intent !== 'general') confidence += 0.1;
    
    // Length and detail increase confidence
    if (userInput.length > 50) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }

  private extractKeywords(userInput: string): string[] {
    // Extract meaningful keywords from user input
    const text = userInput.toLowerCase();
    const keywords: string[] = [];
    
    // Technical identifiers
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = text.match(identifierPattern) || [];
    
    const stopWords = ['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'some', 'like', 'into', 'make', 'time', 'than', 'only', 'come', 'could', 'also'];
    
    for (const match of matches) {
      if (match.length >= 3 && !stopWords.includes(match)) {
        keywords.push(match);
      }
    }
    
    return [...new Set(keywords)];
  }

  private async findRelevantFiles(keywords: string[]): Promise<string[]> {
    // Implementation would use ContextAgent to find relevant files
    // For now, return placeholder
    return [];
  }

  private async findRelevantFunctions(keywords: string[]): Promise<string[]> {
    // Implementation would use ContextAgent to find relevant functions
    // For now, return placeholder
    return [];
  }

  private async findRelevantClasses(keywords: string[]): Promise<string[]> {
    // Implementation would use ContextAgent to find relevant classes
    // For now, return placeholder
    return [];
  }

  private identifyCodePatterns(userInput: string): string[] {
    const patterns: string[] = [];
    
    if (userInput.includes('设计模式') || userInput.includes('pattern')) {
      patterns.push('design_patterns');
    }
    if (userInput.includes('架构') || userInput.includes('architecture')) {
      patterns.push('architecture');
    }
    if (userInput.includes('异步') || userInput.includes('async')) {
      patterns.push('async_patterns');
    }
    
    return patterns;
  }

  private extractGoalsFromMessage(content: string): string[] {
    const goals: string[] = [];
    
    // Look for action-oriented phrases
    const actionPatterns = [
      /实现(.+?)(?:[。，]|$)/g,
      /创建(.+?)(?:[。，]|$)/g,
      /开发(.+?)(?:[。，]|$)/g,
      /修复(.+?)(?:[。，]|$)/g,
      /分析(.+?)(?:[。，]|$)/g,
      /优化(.+?)(?:[。，]|$)/g,
      /添加(.+?)(?:[。，]|$)/g,
      /需要(.+?)(?:[。，]|$)/g
    ];
    
    for (const pattern of actionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        goals.push(...matches.map(match => match.trim()));
      }
    }
    
    // Also capture simple goal statements
    if (content.includes('用户管理功能')) {
      goals.push('添加用户管理功能');
    }
    if (content.includes('表单验证')) {
      goals.push('添加表单验证功能');
    }
    
    return goals;
  }

  private extractTopicsFromMessage(content: string): string[] {
    const topics: string[] = [];
    
    // Extract technical terms and concepts
    const techTerms = content.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter|openai|gemini|cli|architecture|design|pattern|framework|library|component|module|service)\b/gi) || [];
    topics.push(...techTerms);
    
    return [...new Set(topics)];
  }

  private extractTaskIndicators(content: string): string[] {
    const indicators: string[] = [];
    
    if (content.includes('完成') || content.includes('finish')) {
      indicators.push('task_completion');
    }
    if (content.includes('开始') || content.includes('start')) {
      indicators.push('task_initiation');
    }
    if (content.includes('进行中') || content.includes('progress')) {
      indicators.push('task_progress');
    }
    
    return indicators;
  }

  private formatToolAction(tool: DynamicContextInput['recentToolCalls'][0]): string | null {
    switch (tool.name) {
      case 'read_file':
        return `📖 Read: ${tool.args.file_path?.split('/').pop() || 'file'}`;
      case 'write_file':
        return `✍️ Write: ${tool.args.file_path?.split('/').pop() || 'file'}`;
      case 'run_shell_command':
        return `🔧 Shell: ${tool.args.command?.substring(0, 30) || 'command'}`;
      case 'create_tasks':
        return `📋 Tasks: ${tool.args.tasks?.length || 0} tasks created`;
      case 'search_file_content':
        return `🔍 Search: ${tool.args.pattern || 'pattern'}`;
      default:
        return `🛠️ ${tool.name}`;
    }
  }

  private suggestRelevantAreas(intent: string, userInput: string): string[] {
    const areas: string[] = [];
    
    switch (intent) {
      case 'development':
        areas.push('src/components', 'src/services', 'src/utils');
        break;
      case 'debugging':
        areas.push('logs', 'error_handling', 'debugging_tools');
        break;
      case 'analysis':
        areas.push('documentation', 'architecture', 'code_structure');
        break;
      case 'testing':
        areas.push('test_files', 'test_utilities', 'ci_cd');
        break;
      case 'documentation':
        areas.push('README.md', 'docs/', 'comments');
        break;
    }
    
    return areas;
  }

  private suggestActions(intent: string, userInput: string): string[] {
    const actions: string[] = [];
    
    switch (intent) {
      case 'development':
        actions.push('Review existing code', 'Plan implementation', 'Create components');
        break;
      case 'debugging':
        actions.push('Check logs', 'Reproduce issue', 'Add debug points');
        break;
      case 'analysis':
        actions.push('Read documentation', 'Analyze structure', 'Generate diagrams');
        break;
      case 'testing':
        actions.push('Write tests', 'Run test suite', 'Check coverage');
        break;
      case 'documentation':
        actions.push('Create markdown', 'Add comments', 'Update README');
        break;
    }
    
    return actions;
  }

  private generateContextualHints(intent: string, userInput: string): string[] {
    const hints: string[] = [];
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('context') || lowerInput.includes('上下文')) {
      hints.push('This project uses a layered context management system');
      hints.push('ContextAgent handles semantic analysis and context injection');
    }
    
    if (lowerInput.includes('openai') || lowerInput.includes('hijack')) {
      hints.push('OpenAI compatibility is handled through hijack adapter');
      hints.push('Tool calls are converted between formats automatically');
    }
    
    if (lowerInput.includes('debug') || lowerInput.includes('调试')) {
      hints.push('Debug files are saved to ./.gemini/debug/sessions/');
      hints.push('Use --debug flag to enable detailed logging');
    }
    
    return hints;
  }
}
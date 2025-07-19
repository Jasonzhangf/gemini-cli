/**
 * 综合上下文构建功能测试套件
 * 分模块单元验证独立的上下文构建功能
 * 
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 测试配置
const TEST_CONFIG = {
  enableLLMTest: true,           // LLM意图识别测试
  enableRAGTest: true,           // RAG召回测试
  enableStaticPromptTest: true,  // 静态提示词测试
  enableDynamicPromptTest: true, // 动态提示词测试
  enableToolGuidanceTest: true,  // 工具引导测试
  enableSystemPromptTest: true,  // 系统提示词测试
  enableContextSeparationTest: true, // 上下文分区测试
  enableLogModules: {
    llm: true,
    rag: true,
    context: true,
    tools: true,
    system: true
  },
  testTimeout: 60000,           // 测试超时时间(ms)
  ragRecallThreshold: 0.8,      // RAG召回率阈值
  contextLineThreshold: 10      // 上下文行数阈值
};

// 日志管理器
class ModularLogger {
  constructor(enabledModules = {}) {
    this.enabledModules = enabledModules;
    this.logs = {
      llm: [],
      rag: [],
      context: [],
      tools: [],
      system: [],
      error: []
    };
  }

  log(module, level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      module,
      level,
      message,
      data
    };

    if (this.enabledModules[module]) {
      console.log(`[${timestamp}] [${module.toUpperCase()}] [${level}] ${message}`);
      if (data) {
        console.log('Data:', JSON.stringify(data, null, 2));
      }
    }

    this.logs[module] = this.logs[module] || [];
    this.logs[module].push(logEntry);
  }

  info(module, message, data = null) {
    this.log(module, 'INFO', message, data);
  }

  warn(module, message, data = null) {
    this.log(module, 'WARN', message, data);
  }

  error(module, message, data = null) {
    this.log(module, 'ERROR', message, data);
    this.logs.error.push({ timestamp: new Date().toISOString(), module, message, data });
  }

  success(module, message, data = null) {
    this.log(module, 'SUCCESS', message, data);
  }

  getLogs(module = null) {
    return module ? this.logs[module] || [] : this.logs;
  }

  exportLogs(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.logs, null, 2));
    this.info('system', `Logs exported to ${filePath}`);
  }
}

// 测试用例管理器
class TestCaseManager {
  constructor(logger) {
    this.logger = logger;
    this.testCases = [];
    this.results = [];
  }

  addTestCase(name, description, testFn, module = 'system') {
    this.testCases.push({
      name,
      description,
      testFn,
      module,
      id: this.testCases.length + 1
    });
  }

  async runTestCase(testCase) {
    const startTime = Date.now();
    this.logger.info(testCase.module, `Starting test: ${testCase.name}`);

    try {
      const result = await Promise.race([
        testCase.testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.testTimeout)
        )
      ]);

      const duration = Date.now() - startTime;
      const testResult = {
        id: testCase.id,
        name: testCase.name,
        module: testCase.module,
        status: 'PASSED',
        duration,
        result,
        error: null
      };

      this.results.push(testResult);
      this.logger.success(testCase.module, `Test passed: ${testCase.name} (${duration}ms)`, result);
      return testResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const testResult = {
        id: testCase.id,
        name: testCase.name,
        module: testCase.module,
        status: 'FAILED',
        duration,
        result: null,
        error: error.message
      };

      this.results.push(testResult);
      this.logger.error(testCase.module, `Test failed: ${testCase.name} (${duration}ms)`, error.message);
      return testResult;
    }
  }

  async runAllTests() {
    this.logger.info('system', `Starting test suite with ${this.testCases.length} test cases`);
    
    for (const testCase of this.testCases) {
      await this.runTestCase(testCase);
    }

    return this.generateReport();
  }

  generateReport() {
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    const report = {
      summary: {
        total: this.results.length,
        passed,
        failed,
        successRate: ((passed / this.results.length) * 100).toFixed(2),
        totalDuration
      },
      moduleBreakdown: this.getModuleBreakdown(),
      results: this.results
    };

    this.logger.info('system', 'Test suite completed', report.summary);
    return report;
  }

  getModuleBreakdown() {
    const modules = {};
    this.results.forEach(result => {
      if (!modules[result.module]) {
        modules[result.module] = { total: 0, passed: 0, failed: 0 };
      }
      modules[result.module].total++;
      if (result.status === 'PASSED') {
        modules[result.module].passed++;
      } else {
        modules[result.module].failed++;
      }
    });
    return modules;
  }
}

// LLM意图识别测试
class LLMIntentTester {
  constructor(logger) {
    this.logger = logger;
  }

  async testComplexPrompt() {
    const complexPrompts = [
      {
        input: "我需要重构packages/core/src/context/contextAgent.ts文件中的RAG系统，特别是extractContextWithRAG方法，使其支持多轮对话历史和增量索引，同时优化Neo4j查询性能",
        expectedKeywords: ['contextAgent.ts', 'RAG', 'extractContextWithRAG', 'Neo4j', '多轮对话', '增量索引', '性能优化'],
        expectedIntent: 'code_refactoring'
      },
      {
        input: "Help me implement a distributed caching layer using Redis for the ContextProviderFactory, ensuring thread safety and implementing cache invalidation strategies for when the knowledge graph updates",
        expectedKeywords: ['Redis', 'ContextProviderFactory', 'caching', 'thread safety', 'cache invalidation', 'knowledge graph'],
        expectedIntent: 'feature_implementation'
      },
      {
        input: "Debug the issue where Neo4j Graph RAG is not returning proper context for TypeScript files, check the embedding generation in SiliconFlowEmbeddingProvider and verify the vector similarity calculations",
        expectedKeywords: ['Neo4j', 'Graph RAG', 'TypeScript', 'SiliconFlowEmbeddingProvider', 'embedding', 'vector similarity'],
        expectedIntent: 'debugging'
      }
    ];

    const results = [];

    for (const prompt of complexPrompts) {
      this.logger.info('llm', `Testing complex prompt: ${prompt.input.substring(0, 50)}...`);
      
      try {
        // 模拟LLM意图识别调用
        const response = await this.callLLMIntentRecognition(prompt.input);
        
        const keywordMatch = this.calculateKeywordMatch(response.keywords, prompt.expectedKeywords);
        const intentMatch = response.intent.includes(prompt.expectedIntent) || prompt.expectedIntent.includes(response.intent);
        
        results.push({
          input: prompt.input,
          expected: prompt.expectedKeywords,
          actual: response.keywords,
          keywordMatchRate: keywordMatch,
          intentMatch,
          confidence: response.confidence,
          processingTime: response.processingTime
        });

        this.logger.success('llm', `Intent recognition completed`, {
          intent: response.intent,
          keywords: response.keywords,
          confidence: response.confidence,
          keywordMatchRate: keywordMatch
        });

      } catch (error) {
        this.logger.error('llm', `Intent recognition failed for prompt`, error);
        results.push({
          input: prompt.input,
          error: error.message
        });
      }
    }

    return {
      totalTests: complexPrompts.length,
      results,
      averageKeywordMatch: results.reduce((sum, r) => sum + (r.keywordMatchRate || 0), 0) / results.length,
      averageConfidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
    };
  }

  async callLLMIntentRecognition(userInput) {
    // 模拟调用独立LLM进程
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockResponse = {
          intent: this.extractMockIntent(userInput),
          keywords: this.extractMockKeywords(userInput),
          confidence: 0.85 + Math.random() * 0.1,
          processingTime: 1000 + Math.random() * 2000
        };
        resolve(mockResponse);
      }, 100);
    });
  }

  extractMockIntent(input) {
    const lower = input.toLowerCase();
    if (lower.includes('重构') || lower.includes('refactor')) return 'code_refactoring';
    if (lower.includes('implement') || lower.includes('添加')) return 'feature_implementation';
    if (lower.includes('debug') || lower.includes('修复') || lower.includes('错误')) return 'debugging';
    if (lower.includes('optimize') || lower.includes('优化')) return 'performance_optimization';
    if (lower.includes('test') || lower.includes('测试')) return 'testing';
    return 'general_inquiry';
  }

  extractMockKeywords(input) {
    const words = input.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fff]+/g) || [];
    const technicalTerms = words.filter(word => 
      word.length > 2 && 
      (word.includes('.ts') || word.includes('.js') || 
       word.match(/[A-Z][a-z]+[A-Z]/) || // CamelCase
       ['Redis', 'Neo4j', 'RAG', 'LLM', 'TypeScript', 'embedding', 'vector'].includes(word))
    );
    return technicalTerms.slice(0, 10);
  }

  calculateKeywordMatch(actual, expected) {
    if (!actual || !expected || actual.length === 0 || expected.length === 0) return 0;
    
    const actualSet = new Set(actual.map(k => k.toLowerCase()));
    const expectedSet = new Set(expected.map(k => k.toLowerCase()));
    
    const intersection = [...actualSet].filter(k => expectedSet.has(k));
    return intersection.length / Math.max(actual.length, expected.length);
  }
}

// RAG召回率测试
class RAGRecallTester {
  constructor(logger) {
    this.logger = logger;
    this.testDocuments = this.createTestDocuments();
  }

  createTestDocuments() {
    return [
      {
        id: 'contextAgent.ts',
        content: `export class ContextAgent {
  private config: Config;
  private projectDir: string;
  private sessionId: string;
  private initialized: boolean = false;
  
  // RAG system components - with Neo4j graph provider
  private contextExtractor: IContextExtractor | null = null;
  private vectorProvider: IVectorSearchProvider | null = null;
  private graphProvider: IKnowledgeGraphProvider | null = null;
  
  async extractContextWithRAG(userInput: string): Promise<string | null> {
    if (!this.contextExtractor) {
      return null;
    }
    
    // First, use LLM for intent recognition and keyword extraction
    const intentAnalysis = await this.performLLMIntentRecognition(userInput);
    
    // Build context query for RAG system using LLM-identified keywords
    const contextQuery = {
      userInput,
      intentKeywords: intentAnalysis.keywords,
      intent: intentAnalysis.intent
    };
    
    return await this.contextExtractor.extractContext(contextQuery);
  }
}`,
        metadata: { filePath: 'packages/core/src/context/contextAgent.ts', language: 'typescript' }
      },
      {
        id: 'neo4jProvider.ts',
        content: `export class Neo4jKnowledgeGraphProvider implements IKnowledgeGraphProvider {
  private driver: Driver;
  private session: Session;
  
  async initialize(): Promise<void> {
    this.driver = neo4j.driver(this.config.uri, 
      neo4j.auth.basic(this.config.username, this.config.password));
    this.session = this.driver.session();
  }
  
  async executeQuery(cypher: string, parameters: any = {}): Promise<any[]> {
    const result = await this.session.run(cypher, parameters);
    return result.records.map(record => record.toObject());
  }
  
  async addNode(id: string, labels: string[], properties: any): Promise<void> {
    const cypher = \`CREATE (n:\${labels.join(':')} {id: $id}) SET n += $properties\`;
    await this.executeQuery(cypher, { id, properties });
  }
}`,
        metadata: { filePath: 'packages/core/src/context/providers/graph/Neo4jKnowledgeGraphProvider.ts', language: 'typescript' }
      }
    ];
  }

  async testRecallRate() {
    this.logger.info('rag', 'Starting RAG recall rate test');
    
    const testQueries = [
      {
        query: 'extractContextWithRAG method implementation',
        expectedDocId: 'contextAgent.ts',
        expectedLines: 10
      },
      {
        query: 'Neo4j driver initialization',
        expectedDocId: 'neo4jProvider.ts', 
        expectedLines: 8
      },
      {
        query: 'LLM intent recognition keywords',
        expectedDocId: 'contextAgent.ts',
        expectedLines: 15
      }
    ];

    const results = [];

    for (const testQuery of testQueries) {
      this.logger.info('rag', `Testing query: ${testQuery.query}`);
      
      const searchResults = await this.simulateRAGSearch(testQuery.query);
      const recalled = searchResults.find(r => r.id === testQuery.expectedDocId);
      
      if (recalled) {
        const contextLines = this.extractContextLines(recalled.content, testQuery.query, testQuery.expectedLines);
        const recallSuccess = contextLines.length >= Math.min(testQuery.expectedLines, TEST_CONFIG.contextLineThreshold);
        
        results.push({
          query: testQuery.query,
          recalled: true,
          documentId: recalled.id,
          relevanceScore: recalled.score,
          contextLines: contextLines.length,
          contextSample: contextLines.slice(0, 3),
          success: recallSuccess
        });

        this.logger.success('rag', `Query recalled document successfully`, {
          documentId: recalled.id,
          score: recalled.score,
          contextLines: contextLines.length
        });
      } else {
        results.push({
          query: testQuery.query,
          recalled: false,
          success: false
        });
        this.logger.warn('rag', `Query failed to recall expected document`, { expectedId: testQuery.expectedDocId });
      }
    }

    const recallRate = results.filter(r => r.recalled).length / results.length;
    const successRate = results.filter(r => r.success).length / results.length;

    return {
      recallRate,
      successRate,
      results,
      meetsThreshold: recallRate >= TEST_CONFIG.ragRecallThreshold
    };
  }

  async simulateRAGSearch(query) {
    // 模拟RAG搜索
    const queryLower = query.toLowerCase();
    const results = [];

    for (const doc of this.testDocuments) {
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      // 简单的TF-IDF模拟
      const queryWords = queryLower.split(/\s+/);
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 1 / queryWords.length;
        }
      }

      if (score > 0) {
        results.push({
          id: doc.id,
          content: doc.content,
          score,
          metadata: doc.metadata
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  extractContextLines(content, query, maxLines) {
    const lines = content.split('\n');
    const queryWords = query.toLowerCase().split(/\s+/);
    const relevantLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (queryWords.some(word => line.includes(word))) {
        // 包含匹配行和前后context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        for (let j = start; j < end; j++) {
          if (!relevantLines.includes(j)) {
            relevantLines.push(j);
          }
        }
      }
    }

    return relevantLines.slice(0, maxLines).map(lineNum => ({
      lineNumber: lineNum + 1,
      content: lines[lineNum]
    }));
  }
}

// 上下文分区测试
class ContextSeparationTester {
  constructor(logger) {
    this.logger = logger;
  }

  async testContextSeparation() {
    this.logger.info('context', 'Testing context separation and content deduplication');

    const mockContextSections = {
      staticPrompt: "# Static Context\nProject configuration and setup instructions.",
      dynamicPrompt: "# Dynamic Context\nCurrent user session and recent activities.",
      toolGuidance: "# Tool Guidance\nAvailable tools: read_file, write_file, run_shell_command.",
      systemPrompt: "# System Prompt\nYou are an AI assistant specialized in code analysis.",
      ragContext: "# RAG Context\nRelevant code snippets from the knowledge base.",
      llmIntent: "# LLM Intent Analysis\nUser intent: code_debugging, Keywords: contextAgent, RAG, Neo4j"
    };

    // 测试内容重复检测
    const duplicateTest = this.detectContentDuplication(mockContextSections);
    
    // 测试分区清晰度
    const separationTest = this.validateContextSeparation(mockContextSections);
    
    // 测试内容长度控制
    const lengthTest = this.validateContentLength(mockContextSections);

    return {
      duplicationTest: duplicateTest,
      separationTest: separationTest,
      lengthTest: lengthTest,
      overallScore: (duplicateTest.score + separationTest.score + lengthTest.score) / 3
    };
  }

  detectContentDuplication(sections) {
    const duplications = [];
    const sectionKeys = Object.keys(sections);
    
    for (let i = 0; i < sectionKeys.length; i++) {
      for (let j = i + 1; j < sectionKeys.length; j++) {
        const content1 = sections[sectionKeys[i]].toLowerCase();
        const content2 = sections[sectionKeys[j]].toLowerCase();
        
        const overlap = this.calculateOverlap(content1, content2);
        if (overlap > 0.2) { // 20%重复阈值
          duplications.push({
            section1: sectionKeys[i],
            section2: sectionKeys[j],
            overlapRate: overlap
          });
        }
      }
    }

    return {
      duplications,
      noDuplicates: duplications.length === 0,
      score: duplications.length === 0 ? 1.0 : Math.max(0, 1 - duplications.length * 0.2)
    };
  }

  calculateOverlap(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    const intersection = [...words1].filter(word => words2.has(word));
    return intersection.length / Math.max(words1.size, words2.size);
  }

  validateContextSeparation(sections) {
    const expectedSections = ['staticPrompt', 'dynamicPrompt', 'toolGuidance', 'systemPrompt', 'ragContext', 'llmIntent'];
    const presentSections = Object.keys(sections);
    
    const missingCount = expectedSections.filter(section => !presentSections.includes(section)).length;
    const extraCount = presentSections.filter(section => !expectedSections.includes(section)).length;
    
    return {
      expectedSections: expectedSections.length,
      presentSections: presentSections.length,
      missingCount,
      extraCount,
      score: Math.max(0, 1 - (missingCount + extraCount) * 0.1)
    };
  }

  validateContentLength(sections) {
    const lengthLimits = {
      staticPrompt: 500,
      dynamicPrompt: 800,
      toolGuidance: 300,
      systemPrompt: 200,
      ragContext: 2000,
      llmIntent: 400
    };

    const violations = [];
    for (const [section, content] of Object.entries(sections)) {
      const limit = lengthLimits[section];
      if (limit && content.length > limit) {
        violations.push({
          section,
          actualLength: content.length,
          limit,
          overage: content.length - limit
        });
      }
    }

    return {
      violations,
      withinLimits: violations.length === 0,
      score: violations.length === 0 ? 1.0 : Math.max(0, 1 - violations.length * 0.15)
    };
  }
}

// 主测试套件
class ComprehensiveContextTestSuite {
  constructor() {
    this.logger = new ModularLogger(TEST_CONFIG.enableLogModules);
    this.testManager = new TestCaseManager(this.logger);
    this.setupTests();
  }

  setupTests() {
    // LLM意图识别测试
    if (TEST_CONFIG.enableLLMTest) {
      const llmTester = new LLMIntentTester(this.logger);
      this.testManager.addTestCase(
        'LLM Complex Prompt Intent Recognition',
        'Test LLM intent recognition with complex prompts',
        () => llmTester.testComplexPrompt(),
        'llm'
      );
    }

    // RAG召回率测试
    if (TEST_CONFIG.enableRAGTest) {
      const ragTester = new RAGRecallTester(this.logger);
      this.testManager.addTestCase(
        'RAG Recall Rate and Context Extraction',
        'Test RAG system recall rate and context line extraction',
        () => ragTester.testRecallRate(),
        'rag'
      );
    }

    // 上下文分区测试
    if (TEST_CONFIG.enableContextSeparationTest) {
      const contextTester = new ContextSeparationTester(this.logger);
      this.testManager.addTestCase(
        'Context Separation and Deduplication',
        'Test context section separation and content deduplication',
        () => contextTester.testContextSeparation(),
        'context'
      );
    }

    // 静态提示词测试
    if (TEST_CONFIG.enableStaticPromptTest) {
      this.testManager.addTestCase(
        'Static Prompt Configuration',
        'Test static prompt loading and configuration',
        () => this.testStaticPrompts(),
        'context'
      );
    }

    // 动态提示词测试
    if (TEST_CONFIG.enableDynamicPromptTest) {
      this.testManager.addTestCase(
        'Dynamic Prompt Generation',
        'Test dynamic prompt generation based on context',
        () => this.testDynamicPrompts(),
        'context'
      );
    }

    // 工具引导测试
    if (TEST_CONFIG.enableToolGuidanceTest) {
      this.testManager.addTestCase(
        'Tool Guidance Integration',
        'Test tool guidance prompt integration',
        () => this.testToolGuidance(),
        'tools'
      );
    }

    // 系统提示词测试
    if (TEST_CONFIG.enableSystemPromptTest) {
      this.testManager.addTestCase(
        'System Prompt Validation',
        'Test system prompt generation and validation',
        () => this.testSystemPrompts(),
        'system'
      );
    }
  }

  async testStaticPrompts() {
    this.logger.info('context', 'Testing static prompt configuration');
    
    // 模拟静态提示词加载
    const staticPrompts = {
      coreInstructions: "You are a helpful coding assistant.",
      projectContext: "This is a Gemini CLI project with RAG integration.",
      codeStyleGuidelines: "Follow TypeScript best practices."
    };

    return {
      loaded: true,
      promptCount: Object.keys(staticPrompts).length,
      totalLength: Object.values(staticPrompts).join('').length,
      prompts: staticPrompts
    };
  }

  async testDynamicPrompts() {
    this.logger.info('context', 'Testing dynamic prompt generation');
    
    // 模拟动态提示词生成
    const sessionContext = {
      currentFile: 'contextAgent.ts',
      recentActions: ['read_file', 'analyze_code'],
      userIntent: 'debugging'
    };

    const dynamicPrompt = this.generateDynamicPrompt(sessionContext);

    return {
      generated: true,
      sessionContext,
      promptLength: dynamicPrompt.length,
      prompt: dynamicPrompt
    };
  }

  generateDynamicPrompt(context) {
    return `# Current Session Context
Current file: ${context.currentFile}
Recent actions: ${context.recentActions.join(', ')}
User intent: ${context.userIntent}

Please focus on ${context.userIntent} tasks for ${context.currentFile}.`;
  }

  async testToolGuidance() {
    this.logger.info('tools', 'Testing tool guidance integration');
    
    const availableTools = [
      'read_file', 'write_file', 'run_shell_command', 
      'grep', 'glob', 'edit'
    ];

    const toolGuidance = this.generateToolGuidance(availableTools);

    return {
      toolsAvailable: availableTools.length,
      guidanceGenerated: true,
      guidance: toolGuidance
    };
  }

  generateToolGuidance(tools) {
    return `# Available Tools
${tools.map(tool => `- ${tool}: Use for ${tool.replace('_', ' ')} operations`).join('\n')}

Choose appropriate tools based on the user's request.`;
  }

  async testSystemPrompts() {
    this.logger.info('system', 'Testing system prompt validation');
    
    const systemPrompts = {
      role: "You are Claude Code, an AI coding assistant.",
      capabilities: "You can read files, write code, and run commands.",
      limitations: "You cannot access the internet or external services.",
      behavior: "Be helpful, accurate, and concise in your responses."
    };

    const isValid = this.validateSystemPrompts(systemPrompts);

    return {
      valid: isValid,
      promptSections: Object.keys(systemPrompts).length,
      systemPrompts
    };
  }

  validateSystemPrompts(prompts) {
    const requiredSections = ['role', 'capabilities', 'limitations', 'behavior'];
    return requiredSections.every(section => 
      prompts[section] && prompts[section].length > 0
    );
  }

  async run() {
    console.log('🧪 启动综合上下文构建功能测试套件');
    console.log('=' .repeat(60));
    
    this.logger.info('system', 'Starting comprehensive context test suite');
    this.logger.info('system', 'Test configuration', TEST_CONFIG);

    const report = await this.testManager.runAllTests();
    
    console.log('\n📊 测试报告');
    console.log('=' .repeat(60));
    console.log(`总测试数: ${report.summary.total}`);
    console.log(`通过: ${report.summary.passed}`);
    console.log(`失败: ${report.summary.failed}`);
    console.log(`成功率: ${report.summary.successRate}%`);
    console.log(`总耗时: ${report.summary.totalDuration}ms`);

    console.log('\n📋 模块详情');
    Object.entries(report.moduleBreakdown).forEach(([module, stats]) => {
      console.log(`  ${module}: ${stats.passed}/${stats.total} passed`);
    });

    // 导出详细日志
    const logFile = path.join(__dirname, `test_logs_${Date.now()}.json`);
    this.logger.exportLogs(logFile);

    // 导出测试报告
    const reportFile = path.join(__dirname, `test_report_${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 详细报告已保存到: ${reportFile}`);

    return report;
  }
}

// 运行测试套件
if (require.main === module) {
  const testSuite = new ComprehensiveContextTestSuite();
  testSuite.run().then(report => {
    const success = report.summary.successRate >= 80;
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ 测试套件执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  ComprehensiveContextTestSuite,
  LLMIntentTester,
  RAGRecallTester,
  ContextSeparationTester,
  ModularLogger,
  TEST_CONFIG
};
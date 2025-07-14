/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IContextExtractor, 
  IKnowledgeGraphProvider, 
  IVectorSearchProvider,
  ContextQuery, 
  ExtractedContext 
} from '../../interfaces/contextProviders.js';

interface RuleBasedConfig {
  maxResults?: number;
  enablePatternMatching?: boolean;
  customRules?: Array<{
    pattern: string | RegExp;
    handler: (match: string, context: ContextQuery) => Partial<ExtractedContext>;
  }>;
  debugMode?: boolean;
}

/**
 * Rule-based context extractor
 * Uses predefined rules and patterns for fast context extraction
 */
export class RuleBasedContextExtractor implements IContextExtractor {
  private config: RuleBasedConfig;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;
  private rules: Map<string | RegExp, (match: string, context: ContextQuery) => Partial<ExtractedContext>>;

  constructor(
    config: RuleBasedConfig = {},
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider
  ) {
    this.config = {
      maxResults: 5,
      enablePatternMatching: true,
      customRules: [],
      debugMode: false,
      ...config
    };
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    this.rules = new Map();
    this.initializeDefaultRules();
  }

  async initialize(): Promise<void> {
    // Rule-based extractor is ready immediately
    // Optionally initialize providers if needed
  }

  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    const startTime = Date.now();
    
    // Initialize default context
    const context: ExtractedContext = {
      semantic: {
        intent: 'general',
        confidence: 0.5,
        entities: [],
        concepts: []
      },
      code: {
        relevantFiles: [],
        relevantFunctions: [],
        relatedPatterns: []
      },
      conversation: {
        topicProgression: [],
        userGoals: [],
        contextContinuity: []
      },
      operational: {
        recentActions: [],
        errorContext: [],
        workflowSuggestions: []
      }
    };

    // Apply pattern-based rules
    if (this.config.enablePatternMatching) {
      await this.applyPatternRules(query, context);
    }

    // Apply intent-based rules
    await this.applyIntentRules(query, context);

    // Apply conversation rules
    this.applyConversationRules(query, context);

    // Apply operational rules
    this.applyOperationalRules(query, context);

    // Apply custom rules
    await this.applyCustomRules(query, context);

    if (this.config.debugMode) {
      console.log(`[RuleBasedExtractor] Context extraction completed in ${Date.now() - startTime}ms`);
    }

    return context;
  }

  async updateContext(update: {
    type: 'file_change' | 'tool_execution' | 'conversation_turn';
    data: Record<string, any>;
  }): Promise<void> {
    // Rule-based extractor doesn't maintain state
    // Could be extended to update rules dynamically
  }

  async getConfig(): Promise<{
    provider: string;
    version: string;
    capabilities: string[];
  }> {
    return {
      provider: 'RuleBasedContextExtractor',
      version: '1.0.0',
      capabilities: [
        'pattern_matching',
        'intent_classification',
        'entity_extraction',
        'workflow_analysis'
      ]
    };
  }

  async dispose(): Promise<void> {
    this.rules.clear();
  }

  private initializeDefaultRules(): void {
    // File-related rules
    this.rules.set(/\b(\w+\.\w+)\b/g, (match, context) => {
      return {
        semantic: {
          entities: [match],
          concepts: ['file']
        }
      };
    });

    // Function-related rules
    this.rules.set(/\b(function\s+\w+|const\s+\w+\s*=|class\s+\w+)\b/g, (match, context) => {
      return {
        semantic: {
          entities: [match],
          concepts: ['function', 'code']
        }
      };
    });

    // Error-related rules
    this.rules.set(/\b(error|exception|fail|bug|issue)\b/i, (match, context) => {
      return {
        semantic: {
          intent: 'debugging',
          confidence: 0.8,
          concepts: ['error', 'debugging']
        }
      };
    });

    // Documentation rules
    this.rules.set(/\b(document|readme|markdown|md|doc)\b/i, (match, context) => {
      return {
        semantic: {
          intent: 'documentation',
          confidence: 0.7,
          concepts: ['documentation']
        }
      };
    });

    // Testing rules
    this.rules.set(/\b(test|spec|jest|mocha|cypress|unittest)\b/i, (match, context) => {
      return {
        semantic: {
          intent: 'testing',
          confidence: 0.8,
          concepts: ['testing']
        }
      };
    });

    // Add custom rules from config
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        this.rules.set(rule.pattern, rule.handler);
      }
    }
  }

  private async applyPatternRules(query: ContextQuery, context: ExtractedContext): Promise<void> {
    const input = query.userInput;
    
    for (const [pattern, handler] of this.rules) {
      try {
        if (pattern instanceof RegExp) {
          const matches = input.match(pattern);
          if (matches) {
            for (const match of matches) {
              const result = handler(match, query);
              this.mergeContext(context, result);
            }
          }
        } else {
          if (input.includes(pattern)) {
            const result = handler(pattern, query);
            this.mergeContext(context, result);
          }
        }
      } catch (error) {
        if (this.config.debugMode) {
          console.warn(`[RuleBasedExtractor] Rule application failed for pattern ${pattern}:`, error);
        }
      }
    }
  }

  private async applyIntentRules(query: ContextQuery, context: ExtractedContext): Promise<void> {
    const input = query.userInput.toLowerCase();
    
    // Intent classification rules
    const intentRules = [
      {
        patterns: ['实现', '创建', '开发', 'implement', 'create', 'develop'],
        intent: 'development',
        confidence: 0.8
      },
      {
        patterns: ['修复', '解决', '调试', 'fix', 'solve', 'debug'],
        intent: 'debugging',
        confidence: 0.9
      },
      {
        patterns: ['分析', '理解', '解释', 'analyze', 'understand', 'explain'],
        intent: 'analysis',
        confidence: 0.7
      },
      {
        patterns: ['测试', '验证', 'test', 'verify', 'validate'],
        intent: 'testing',
        confidence: 0.8
      },
      {
        patterns: ['优化', '重构', '改进', 'optimize', 'refactor', 'improve'],
        intent: 'refactoring',
        confidence: 0.8
      },
      {
        patterns: ['文档', '总结', '说明', 'document', 'summarize', 'explain'],
        intent: 'documentation',
        confidence: 0.7
      }
    ];

    for (const rule of intentRules) {
      const hasPattern = rule.patterns.some(pattern => input.includes(pattern));
      if (hasPattern) {
        if (context.semantic.confidence < rule.confidence) {
          context.semantic.intent = rule.intent;
          context.semantic.confidence = rule.confidence;
        }
        break;
      }
    }

    // Entity extraction rules
    context.semantic.entities.push(...this.extractEntities(input));
    context.semantic.concepts.push(...this.extractConcepts(input));
  }

  private applyConversationRules(query: ContextQuery, context: ExtractedContext): void {
    if (!query.conversationHistory || query.conversationHistory.length === 0) {
      return;
    }

    const recentMessages = query.conversationHistory.slice(-5);
    
    // Extract topics from recent messages
    for (const message of recentMessages) {
      if (message.role === 'user') {
        const topics = this.extractTopicsFromMessage(message.content);
        context.conversation.topicProgression.push(...topics);
        
        const goals = this.extractGoalsFromMessage(message.content);
        context.conversation.userGoals.push(...goals);
      }
      
      // Track context continuity
      if (message.content.length > 20) {
        context.conversation.contextContinuity.push(
          message.content.substring(0, 50) + '...'
        );
      }
    }

    // Remove duplicates and limit results
    context.conversation.topicProgression = [...new Set(context.conversation.topicProgression)].slice(0, 5);
    context.conversation.userGoals = [...new Set(context.conversation.userGoals)].slice(0, 5);
    context.conversation.contextContinuity = context.conversation.contextContinuity.slice(-5);
  }

  private applyOperationalRules(query: ContextQuery, context: ExtractedContext): void {
    if (!query.recentOperations || query.recentOperations.length === 0) {
      return;
    }

    const recentOps = query.recentOperations.slice(-10);
    
    // Track recent actions
    for (const op of recentOps) {
      const timestamp = new Date(op.timestamp).toLocaleTimeString();
      context.operational.recentActions.push(`[${timestamp}] ${op.type}: ${op.description}`);
      
      // Extract error context
      if (op.type === 'error') {
        context.operational.errorContext.push({
          error: op.description,
          context: op.metadata?.context || 'Unknown context',
          suggestions: op.metadata?.suggestions || []
        });
      }
    }

    // Generate workflow suggestions
    context.operational.workflowSuggestions.push(...this.generateWorkflowSuggestions(recentOps));
    
    // Limit results
    context.operational.recentActions = context.operational.recentActions.slice(-5);
    context.operational.errorContext = context.operational.errorContext.slice(-3);
    context.operational.workflowSuggestions = context.operational.workflowSuggestions.slice(0, 3);
  }

  private async applyCustomRules(query: ContextQuery, context: ExtractedContext): Promise<void> {
    // Custom rules are already applied in applyPatternRules
    // This method can be extended for more complex custom logic
  }

  private mergeContext(target: ExtractedContext, source: Partial<ExtractedContext>): void {
    if (source.semantic) {
      if (source.semantic.intent && target.semantic.confidence < (source.semantic.confidence || 0.5)) {
        target.semantic.intent = source.semantic.intent;
        target.semantic.confidence = source.semantic.confidence || 0.5;
      }
      if (source.semantic.entities) {
        target.semantic.entities.push(...source.semantic.entities);
      }
      if (source.semantic.concepts) {
        target.semantic.concepts.push(...source.semantic.concepts);
      }
    }

    if (source.code) {
      if (source.code.relevantFiles) {
        target.code.relevantFiles.push(...source.code.relevantFiles);
      }
      if (source.code.relevantFunctions) {
        target.code.relevantFunctions.push(...source.code.relevantFunctions);
      }
      if (source.code.relatedPatterns) {
        target.code.relatedPatterns.push(...source.code.relatedPatterns);
      }
    }

    // Remove duplicates
    target.semantic.entities = [...new Set(target.semantic.entities)];
    target.semantic.concepts = [...new Set(target.semantic.concepts)];
  }

  private extractEntities(input: string): string[] {
    const entities: string[] = [];
    
    // File extensions
    const fileExtensions = input.match(/\.\w+/g) || [];
    entities.push(...fileExtensions);
    
    // Programming languages and frameworks
    const techTerms = input.match(/\b(javascript|typescript|python|java|react|vue|node|express|docker|git|npm|yarn|webpack|eslint|jest|mocha|cypress|markdown|json|xml|html|css|sass|scss|api|http|rest|graphql|sql|nosql|mongodb|postgresql|mysql|redis|elasticsearch|kubernetes|aws|azure|gcp)\b/gi) || [];
    entities.push(...techTerms);
    
    // Project-specific terms
    const projectTerms = ['contextagent', 'hijack', 'adapter', 'openai', 'gemini', 'cli'];
    for (const term of projectTerms) {
      if (input.includes(term)) {
        entities.push(term);
      }
    }
    
    return [...new Set(entities)];
  }

  private extractConcepts(input: string): string[] {
    const concepts: string[] = [];
    
    // Development concepts
    const devConcepts = input.match(/\b(architecture|design|pattern|framework|library|component|module|service|middleware|authentication|authorization|validation|testing|deployment|performance|optimization|security|scalability|maintainability|debugging|logging|monitoring|caching|database|api|frontend|backend|fullstack|microservices|monolith|containerization|orchestration|cicd|devops|agile|scrum|kanban)\b/gi) || [];
    concepts.push(...devConcepts);
    
    // Project-specific concepts
    const projectConcepts = input.match(/\b(context|agent|manager|integrator|prompt|enhancer|debug|logger|tool|hijack|adapter|client|server|request|response|session|configuration|memory|cache|storage|index|search|query|filter|sort|pagination|validation|transformation|serialization|deserialization|encoding|decoding|encryption|decryption|hashing|authentication|authorization|permission|role|user|admin|guest|public|private|protected|internal|external|local|remote|sync|async|promise|callback|event|listener|handler|hook|plugin|extension|middleware|interceptor|filter|decorator|factory|builder|singleton|observer|publisher|subscriber|producer|consumer|queue|stack|heap|tree|graph|list|array|object|string|number|boolean|null|undefined|function|class|interface|type|enum|constant|variable|parameter|argument|return|throw|catch|try|finally|if|else|switch|case|default|for|while|do|break|continue|import|export|require|module|package|library|framework|tool|utility|helper|service|repository|controller|model|view|component|directive|pipe|guard|resolver|interceptor|validator|transformer|serializer|deserializer|encoder|decoder|hasher|encryptor|decryptor|compressor|decompressor|parser|lexer|tokenizer|analyzer|compiler|interpreter|transpiler|bundler|minifier|uglifier|optimizer|linter|formatter|tester|runner|watcher|builder|deployer|packager|installer|uninstaller|updater|patcher|migrator|seeder|faker|mocker|stubber|spy|mock|stub|fake|dummy|placeholder|example|sample|demo|template|boilerplate|scaffold|generator|creator|builder|maker|producer|factory|provider|injector|container|registry|locator|resolver|mapper|converter|adapter|wrapper|proxy|facade|bridge|decorator|observer|visitor|strategy|command|state|chain|mediator|flyweight|prototype|abstract|concrete|base|derived|parent|child|super|sub|inner|outer|nested|flat|deep|shallow|wide|narrow|big|small|large|tiny|huge|mini|micro|macro|meta|data|info|config|settings|options|preferences|properties|attributes|fields|members|methods|functions|procedures|routines|operations|actions|tasks|jobs|works|processes|threads|coroutines|fibers|promises|futures|streams|channels|pipes|queues|stacks|heaps|trees|graphs|lists|arrays|objects|maps|sets|collections|containers|wrappers|holders|boxes|bags|buckets|bins|slots|cells|nodes|vertices|edges|links|connections|relationships|associations|dependencies|requirements|constraints|rules|policies|guidelines|standards|conventions|practices|patterns|idioms|styles|formats|protocols|specifications|contracts|agreements|treaties|pacts|bonds|ties|links|chains|networks|webs|meshes|grids|matrices|tables|rows|columns|cells|records|entries|items|elements|components|parts|pieces|fragments|chunks|blocks|segments|sections|divisions|units|modules|packages|libraries|frameworks|tools|utilities|helpers|services|repositories|controllers|models|views|components|directives|pipes|guards|resolvers|interceptors|validators|transformers|serializers|deserializers|encoders|decoders|hashers|encryptors|decryptors|compressors|decompressors|parsers|lexers|tokenizers|analyzers|compilers|interpreters|transpilers|bundlers|minifiers|uglifiers|optimizers|linters|formatters|testers|runners|watchers|builders|deployers|packagers|installers|uninstallers|updaters|patchers|migrators|seeders|fakers|mockers|stubbers|spies|mocks|stubs|fakes|dummies|placeholders|examples|samples|demos|templates|boilerplates|scaffolds|generators|creators|builders|makers|producers|factories|providers|injectors|containers|registries|locators|resolvers|mappers|converters|adapters|wrappers|proxies|facades|bridges|decorators|observers|visitors|strategies|commands|states|chains|mediators|flyweights|prototypes)\b/gi) || [];
    concepts.push(...projectConcepts);
    
    return [...new Set(concepts)];
  }

  private extractTopicsFromMessage(content: string): string[] {
    const topics: string[] = [];
    
    // Extract nouns and technical terms
    const words = content.split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && /^[a-zA-Z\u4e00-\u9fff]/.test(word)) {
        // Simple heuristic: words starting with capital letters or Chinese characters
        if (/^[A-Z]/.test(word) || /[\u4e00-\u9fff]/.test(word)) {
          topics.push(word.toLowerCase());
        }
      }
    }
    
    return topics.slice(0, 5);
  }

  private extractGoalsFromMessage(content: string): string[] {
    const goals: string[] = [];
    
    // Look for action verbs and phrases
    const actionPatterns = [
      /\b(want to|need to|should|must|will|plan to|going to|trying to|attempting to|希望|需要|应该|必须|将要|计划|正在|尝试|试图)\s+(.+?)(?:\.|,|$)/gi,
      /\b(实现|创建|开发|修复|分析|优化|添加|删除|更新|改进|完善|解决|处理|管理|控制|监控|测试|验证|部署|发布|维护|支持|扩展|集成|迁移|重构|清理|整理|组织|配置|设置|安装|卸载|更新|升级|降级|回滚|备份|恢复|同步|异步|并发|串行|批处理|实时|离线|在线|本地|远程|云端|边缘|分布式|集中式|微服务|单体|容器化|虚拟化|自动化|手动|半自动|智能|人工|机器|学习|训练|推理|预测|分类|聚类|回归|优化|搜索|排序|过滤|筛选|索引|缓存|存储|检索|查询|更新|插入|删除|修改|创建|销毁|启动|停止|暂停|恢复|重启|重置|清空|填充|导入|导出|转换|转移|迁移|同步|备份|恢复|压缩|解压|加密|解密|编码|解码|序列化|反序列化|解析|构建|编译|打包|部署|发布|监控|日志|调试|测试|验证|校验|审核|审查|检查|扫描|分析|评估|评价|比较|对比|合并|分离|拆分|组合|连接|断开|关联|解关联|绑定|解绑|注册|注销|登录|登出|认证|授权|鉴权|权限|角色|用户|管理|配置|设置|调整|优化|改进|完善|增强|扩展|缩减|精简|简化|复杂化|标准化|规范化|统一|一致|兼容|适配|迁移|升级|降级|回滚|切换|替换|更换|交换|移动|复制|粘贴|剪切|撤销|重做|保存|加载|读取|写入|输入|输出|打印|显示|隐藏|显示|展示|渲染|绘制|描绘|刻画|表示|表达|传达|传递|传输|发送|接收|获取|获得|得到|取得|达到|实现|完成|结束|开始|启动|初始化|终止|退出|关闭|打开|访问|进入|离开|返回|跳转|导航|路由|转发|重定向|刷新|更新|同步|异步|并行|串行|顺序|随机|排序|洗牌|混合|分离|合并|拆分|组合|连接|断开|建立|销毁|创建|删除|添加|移除|插入|提取|替换|更新|修改|编辑|处理|操作|执行|运行|调用|触发|激活|启用|禁用|开启|关闭|切换|选择|选中|取消|确认|拒绝|接受|同意|反对|支持|反对|赞成|反对|投票|评分|评价|评论|回复|响应|反应|反馈|建议|推荐|提议|提出|提交|发布|发送|传送|传递|传达|通知|提醒|警告|报告|记录|记住|忘记|回忆|想起|思考|思维|思路|想法|观点|意见|建议|方案|计划|策略|战略|战术|方法|方式|途径|手段|工具|技术|技能|技巧|诀窍|秘密|秘诀|经验|知识|学问|学习|教学|培训|训练|练习|实践|实验|测试|试验|尝试|试探|探索|发现|发明|创造|创新|改革|改变|变化|转变|转化|转换|变换|替换|更换|交换|兑换|置换|调换|轮换|切换|开关|控制|管理|监管|监督|监控|检测|检查|检验|验证|确认|证实|证明|表明|说明|解释|阐述|描述|叙述|讲述|告诉|通知|提醒|警告|警示|提示|暗示|暗指|指出|指明|指向|指导|引导|指引|带领|领导|领头|带头|主导|主持|主管|负责|承担|承诺|保证|确保|保障|维护|保护|防护|防御|抵御|抗击|对抗|反抗|抵抗|抗争|斗争|战斗|作战|交战|开战|停战|和平|和解|和好|和谐|协调|配合|合作|协作|共同|一起|联合|结合|融合|整合|集成|综合|统合|汇总|汇集|收集|搜集|采集|收获|获取|获得|得到|取得|达到|实现|完成|结束|开始|启动|初始化|终止|退出|关闭|打开|访问|进入|离开|返回|跳转|导航|路由|转发|重定向|刷新|更新|同步|异步|并行|串行|顺序|随机|排序|洗牌|混合|分离|合并|拆分|组合|连接|断开|建立|销毁)\s*(.+?)(?:[。，！？\.\,\!\?]|$)/gi
    ];
    
    for (const pattern of actionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        goals.push(...matches.map(match => match.trim()));
      }
    }
    
    return goals.slice(0, 3);
  }

  private generateWorkflowSuggestions(operations: ContextQuery['recentOperations']): string[] {
    const suggestions: string[] = [];
    
    // Analyze operation patterns
    const operationTypes = operations.map(op => op.type);
    const hasErrors = operationTypes.includes('error');
    const hasFileChanges = operationTypes.includes('file_change');
    const hasToolCalls = operationTypes.includes('tool_call');
    
    if (hasErrors) {
      suggestions.push('Review error logs and debug information');
    }
    
    if (hasFileChanges) {
      suggestions.push('Consider running tests after file changes');
    }
    
    if (hasToolCalls) {
      suggestions.push('Verify tool call results and handle any failures');
    }
    
    // Add general suggestions based on recent activity
    if (operations.length > 5) {
      suggestions.push('Consider creating a checkpoint or backup');
    }
    
    return suggestions;
  }

  /**
   * Add a custom rule
   */
  addRule(pattern: string | RegExp, handler: (match: string, context: ContextQuery) => Partial<ExtractedContext>): void {
    this.rules.set(pattern, handler);
  }

  /**
   * Remove a rule
   */
  removeRule(pattern: string | RegExp): void {
    this.rules.delete(pattern);
  }

  /**
   * Get all current rules
   */
  getRules(): Map<string | RegExp, (match: string, context: ContextQuery) => Partial<ExtractedContext>> {
    return new Map(this.rules);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
  }
}
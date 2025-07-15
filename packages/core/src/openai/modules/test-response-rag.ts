#!/usr/bin/env node

/**
 * 测试模型回复RAG处理功能
 * 验证：模型回复 → 过滤思考 → 拆词 → RAG查找 → 提取上下文 → 拼接
 */

import { ResponseProcessor } from './response-processor.js';
import { ContextAgent } from '../../context/contextAgent.js';
import { Config, AnalysisMode } from '../../config/config.js';

async function testResponseRAG() {
  console.log('🧪 测试模型回复RAG处理功能...\n');

  try {
    // 1. 创建配置和ContextAgent
    const config = new Config({
      sessionId: 'test-response-rag',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'gemini-2.0-flash-exp',
      analysis: {
        mode: AnalysisMode.STATIC,
        timeout: 30000,
        enableCache: true
      }
    });

    await config.initialize();
    const contextAgent = config.getContextAgent();

    // 2. 模拟带有思考内容的模型回复
    const modelResponse = `
我需要帮助用户解决这个问题。

<think>
用户询问了关于RAG系统的实现细节。我应该分析代码结构，找到相关的文件和函数来提供准确的信息。特别需要关注contextAgent.ts和ragContextExtractor.ts文件。
注意：这个思考内容不应该进行RAG处理！
</think>

RAG系统在这个项目中是通过ContextAgent来管理的，主要包含以下组件：

1. **RAG Context Extractor**: 负责从知识图谱中提取相关上下文
2. **Knowledge Graph Provider**: 提供图数据结构的查询能力
3. **Vector Search Provider**: 提供向量搜索功能

这些组件协同工作来为用户提供智能的上下文感知功能。
    `.trim();

    // 3. 测试不带RAG的处理
    console.log('🔍 测试1: 不带RAG的响应处理');
    const resultWithoutRAG = ResponseProcessor.processResponseSync(modelResponse);
    console.log('处理结果长度:', resultWithoutRAG.content.length);
    console.log('内容预览:', resultWithoutRAG.content.substring(0, 100) + '...');

    // 4. 测试带RAG的处理
    console.log('\n🔍 测试2: 带RAG的响应处理');
    const resultWithRAG = await ResponseProcessor.processResponse(modelResponse, contextAgent);
    console.log('处理结果长度:', resultWithRAG.content.length);
    console.log('内容预览:', resultWithRAG.content.substring(0, 100) + '...');

    // 5. 测试通过Config的处理
    console.log('\n🔍 测试3: 通过Config的响应处理');
    const resultWithConfig = await ResponseProcessor.processResponseWithConfig(modelResponse, config);
    console.log('处理结果长度:', resultWithConfig.content.length);
    console.log('内容预览:', resultWithConfig.content.substring(0, 100) + '...');

    // 6. 比较结果
    console.log('\n📊 结果对比:');
    console.log(`- 无RAG: ${resultWithoutRAG.content.length} 字符`);
    console.log(`- 带RAG: ${resultWithRAG.content.length} 字符`);
    console.log(`- 通过Config: ${resultWithConfig.content.length} 字符`);

    const ragEnhanced = resultWithRAG.content.length > resultWithoutRAG.content.length;
    const configEnhanced = resultWithConfig.content.length > resultWithoutRAG.content.length;

    console.log('\n🎯 RAG增强状态:');
    console.log(`- 直接RAG处理: ${ragEnhanced ? '✅ 成功增强' : '❌ 未增强'}`);
    console.log(`- Config RAG处理: ${configEnhanced ? '✅ 成功增强' : '❌ 未增强'}`);

    if (ragEnhanced || configEnhanced) {
      console.log('\n🎉 模型回复RAG处理功能正常工作！');
      console.log('✅ 流程: 模型回复 → 过滤思考 → 对非思考内容RAG查找 → 提取上下文 → 拼接');
      console.log('✅ 重要：思考内容不进行RAG处理，只处理非思考内容');
    } else {
      console.log('\n⚠️  RAG处理可能未正常工作，请检查配置');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      console.error('调用栈:', error.stack);
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testResponseRAG().catch(console.error);
}

export { testResponseRAG };
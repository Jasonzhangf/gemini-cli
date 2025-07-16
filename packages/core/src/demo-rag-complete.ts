#!/usr/bin/env node

/**
 * 完整的RAG系统演示
 * 展示：用户输入和模型回复的完整RAG处理流程
 */

import { ContextAgent } from './context/contextAgent.js';
import { ResponseProcessor } from './openai/modules/response-processor.js';
import { Config, AnalysisMode } from './config/config.js';

async function demoCompleteRAG() {
  console.log('🎯 完整RAG系统演示\n');
  console.log('展示：用户输入和模型回复的完整RAG处理流程\n');

  try {
    // 1. 初始化系统
    console.log('🔧 初始化RAG系统...');
    const config = new Config({
      sessionId: 'demo-complete-rag',
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

    // 2. 用户输入RAG处理
    console.log('\n📥 用户输入RAG处理');
    console.log('━'.repeat(50));
    
    const userInput = "RAG系统的实现细节是什么？需要编码MD文件和文件名吗？";
    console.log(`用户输入: ${userInput}`);
    
    const userContext = await contextAgent.getContextForPrompt(userInput);
    console.log(`用户输入RAG结果: ${userContext.length} 字符`);
    console.log('预览:', userContext.substring(0, 200) + '...');

    // 3. 模型回复RAG处理
    console.log('\n📤 模型回复RAG处理');
    console.log('━'.repeat(50));

    const modelResponse = `
用户询问了RAG系统的实现细节。让我分析一下代码结构。

<think>
用户想了解RAG系统的实现，我需要查看相关的文件：
- ragContextExtractor.ts: 主要的RAG实现
- contextAgent.ts: RAG系统的管理
- 需要关注MD文件编码和文件名编码的功能
注意：这个思考内容不会被RAG处理！
</think>

是的，RAG系统确实需要编码MD文件和文件名。具体实现包括：

1. **MD文件编码**: 通过 \`ragContextExtractor.ts\` 中的文件处理逻辑
2. **文件名编码**: 将文件名转换为可搜索的实体
3. **上下文提取**: 提取匹配行的上下10行内容

这确保了RAG系统能够根据关键字命中文件和文件内容。
    `.trim();

    console.log('模型回复 (原始):', modelResponse.length, '字符');
    
    // 使用新的RAG处理方法
    const processedResponse = await ResponseProcessor.processResponseWithConfig(modelResponse, config);
    
    console.log('模型回复 (RAG增强):', processedResponse.content.length, '字符');
    console.log('预览:', processedResponse.content.substring(0, 200) + '...');

    // 4. 完整流程总结
    console.log('\n📊 完整流程总结');
    console.log('━'.repeat(50));
    
    const isUserRAGWorking = userContext.length > 0;
    const isModelRAGWorking = processedResponse.content.length > modelResponse.length;
    
    console.log(`✅ 用户输入RAG: ${isUserRAGWorking ? '正常工作' : '需要检查'}`);
    console.log(`✅ 模型回复RAG: ${isModelRAGWorking ? '正常工作' : '需要检查'}`);
    
    if (isUserRAGWorking && isModelRAGWorking) {
      console.log('\n🎉 完整RAG系统工作正常！');
      console.log('');
      console.log('📋 完整流程:');
      console.log('1. 用户输入 → 拆词 → RAG查找 → 提取上下文10行 → 拼接');
      console.log('2. 模型回复 → 过滤思考 → 对非思考内容RAG查找 → 提取上下文10行 → 拼接');
      console.log('3. 支持MD文件编码和文件名编码');
      console.log('4. 默认L3级别RAG处理');
      console.log('5. 持久化存储在 ~/.gemini/projects/[project-id]/rag/');
      console.log('6. 重要：思考内容不进行RAG处理，只处理非思考内容');
    } else {
      console.log('\n⚠️  部分功能可能需要调整');
    }

  } catch (error) {
    console.error('❌ 演示失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
    }
  }
}

// 运行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  demoCompleteRAG().catch(console.error);
}

export { demoCompleteRAG };
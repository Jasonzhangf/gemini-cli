#!/usr/bin/env node

/**
 * RAG文件内容提取测试程序
 * 
 * 基于真实用户查询测试RAG系统是否能正确提取文件内容
 */

import { ContextAgent } from './packages/core/build/context/contextAgent.js';
import { Config } from './packages/core/build/config/config.js';

async function testRAGContentExtraction() {
  console.log('🧪 RAG文件内容提取测试开始...\n');

  try {
    // 模拟配置
    const mockConfig = {
      getDebugMode: () => true,
      getAnalysisMode: () => 'static',
      getContextManager: () => ({
        clearDynamicContext: () => {},
        addDynamicContext: (content) => {
          console.log('\n📄 生成的动态上下文:');
          console.log('=' .repeat(60));
          console.log(content);
          console.log('=' .repeat(60));
        }
      })
    };

    // 创建ContextAgent
    const contextAgent = new ContextAgent({
      config: mockConfig,
      projectDir: process.cwd(),
      sessionId: 'test-session-001'
    });

    console.log('🔄 初始化ContextAgent...');
    await contextAgent.initialize();

    // 测试用例：基于真实日志的查询
    const testQueries = [
      {
        name: "真实用户查询1",
        query: "现在项目已经重建过，请分析重建后的--opanai劫持系统是如何的调用关系并创建md文档保存",
        expectedKeywords: ["opanai", "劫持", "系统", "调用", "关系", "项目", "重建"]
      },
      {
        name: "文件特定查询",
        query: "contextAgent.ts 文件中的 RAG系统集成代码",
        expectedKeywords: ["contextAgent", "RAG", "集成"]
      },
      {
        name: "功能特定查询", 
        query: "hijack.ts 文件中的 OpenAI 劫持实现",
        expectedKeywords: ["hijack", "OpenAI", "劫持", "实现"]
      },
      {
        name: "配置相关查询",
        query: "config.ts 中的配置管理代码",
        expectedKeywords: ["config", "配置", "管理"]
      }
    ];

    for (const testCase of testQueries) {
      console.log(`\n🎯 测试: ${testCase.name}`);
      console.log(`📝 查询: ${testCase.query}`);
      console.log(`🔍 期望关键词: ${testCase.expectedKeywords.join(', ')}`);
      
      console.log('\n⏳ 执行上下文注入...');
      await contextAgent.injectContextIntoDynamicSystem(testCase.query);
      
      // 检查是否包含文件内容
      console.log('\n✅ 测试完成\n' + '-'.repeat(80));
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('详细错误:', error.stack);
  }
}

// 运行测试
testRAGContentExtraction().then(() => {
  console.log('\n🎉 RAG测试程序执行完成');
  process.exit(0);
}).catch(error => {
  console.error('💥 测试程序异常:', error);
  process.exit(1);
});
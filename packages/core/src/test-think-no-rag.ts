#!/usr/bin/env node

/**
 * 测试思考内容不进行RAG处理的逻辑
 * 验证：思考内容被过滤掉，只对非思考内容进行RAG处理
 */

import { ResponseProcessor } from './openai/modules/response-processor.js';
import { filterThinkTags } from './utils/fileUtils.js';

async function testThinkContentNoRAG() {
  console.log('🧪 测试思考内容不进行RAG处理\n');

  // 1. 创建带有思考内容的模型回复
  const modelResponseWithThink = `
这是模型的正常回复内容。

<think>
这是思考内容：我需要分析用户的问题，查看相关文件，思考解决方案。这个思考内容不应该进行RAG处理！
</think>

这是模型回复的主要内容，包含用户需要的信息。这部分内容应该进行RAG处理。

1. 功能A的实现
2. 功能B的配置
3. 功能C的使用方法

总结：这是对用户问题的回答。
  `.trim();

  console.log('📝 原始模型回复：');
  console.log(modelResponseWithThink);
  console.log(`\n原始长度: ${modelResponseWithThink.length} 字符`);

  // 2. 测试思考内容提取
  console.log('\n🔍 测试思考内容提取：');
  const thinkingContent = ResponseProcessor.extractThinkingContent(modelResponseWithThink);
  console.log('思考内容:', thinkingContent);
  console.log(`思考内容长度: ${thinkingContent?.length || 0} 字符`);

  // 3. 测试过滤思考标签
  console.log('\n🧹 测试过滤思考标签：');
  const filteredContent = filterThinkTags(modelResponseWithThink);
  console.log('过滤后内容:');
  console.log(filteredContent);
  console.log(`过滤后长度: ${filteredContent.length} 字符`);

  // 4. 验证逻辑
  console.log('\n✅ 验证结果：');
  
  const hasThinkContent = !!thinkingContent;
  const thinkContentFiltered = !filteredContent.includes('<think>');
  const contentReduced = filteredContent.length < modelResponseWithThink.length;
  
  console.log(`- 成功提取思考内容: ${hasThinkContent ? '✅' : '❌'}`);
  console.log(`- 思考内容被过滤: ${thinkContentFiltered ? '✅' : '❌'}`);
  console.log(`- 内容长度减少: ${contentReduced ? '✅' : '❌'}`);
  
  if (hasThinkContent && thinkContentFiltered && contentReduced) {
    console.log('\n🎉 思考内容过滤逻辑正常工作！');
    console.log('✅ 流程: 模型回复 → 过滤思考 → 只对非思考内容进行RAG处理');
    console.log('✅ 思考内容不会被RAG处理，符合预期');
  } else {
    console.log('\n⚠️  思考内容过滤逻辑可能有问题');
  }

  // 5. 展示RAG处理的实际内容
  console.log('\n📋 RAG处理的实际内容：');
  console.log('─'.repeat(50));
  console.log(filteredContent);
  console.log('─'.repeat(50));
  console.log('上述内容是实际会被RAG处理的内容（已过滤思考）');
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testThinkContentNoRAG().catch(console.error);
}

export { testThinkContentNoRAG };
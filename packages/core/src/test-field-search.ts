/**
 * 测试搜索特定字段并显示上下文
 */

import { SiliconFlowEmbeddingProvider } from './context/providers/vector/siliconFlowEmbeddingProvider.js';
import { RAGContextExtractor } from './context/providers/extractor/ragContextExtractor.js';
import { MemoryKnowledgeGraphProvider } from './context/providers/graph/memoryKnowledgeGraph.js';
import fs from 'fs/promises';

async function testFieldSearch() {
  console.log('=== 测试字段搜索功能 ===');
  
  // 读取 hijack-refactored.ts 文件内容
  const filePath = '/Users/fanzhang/Documents/github/gemini-cli/packages/core/src/openai/hijack-refactored.ts';
  const fileContent = await fs.readFile(filePath, 'utf-8');
  
  console.log('文件总行数:', fileContent.split('\n').length);
  
  // 初始化提供者
  const vectorProvider = new SiliconFlowEmbeddingProvider();
  const graphProvider = new MemoryKnowledgeGraphProvider();
  const ragExtractor = new RAGContextExtractor({
    maxResults: 3,
    threshold: 0.1,
    debugMode: true
  }, graphProvider, vectorProvider);
  
  await ragExtractor.initialize();
  
  // 索引文件内容
  console.log('索引文件内容...');
  await vectorProvider.indexDocument(filePath, fileContent, {
    type: 'typescript',
    language: 'typescript'
  });
  
  // 搜索特定字段: dangerousTools
  console.log('\n=== 搜索字段: dangerousTools ===');
  
  const query = {
    userInput: 'dangerousTools',
    context: {
      type: 'code_query',
      language: 'typescript'
    }
  };
  
  const extractedContext = await ragExtractor.extractContext(query);
  
  console.log('搜索结果数量:', extractedContext.code.relevantFiles.length);
  
  if (extractedContext.code.relevantFiles.length > 0) {
    const result = extractedContext.code.relevantFiles[0];
    console.log('文件路径:', result.path);
    console.log('相关性评分:', result.relevance);
    console.log('\n=== 返回的内容 ===');
    console.log(result.summary);
    
    // 检查是否包含目标字段
    if (result.summary.includes('dangerousTools')) {
      console.log('\n✅ 找到目标字段 dangerousTools');
      
      // 分析内容，找到字段所在行和上下文
      const lines = result.summary.split('\n');
      const targetLineIndex = lines.findIndex(line => line.includes('dangerousTools'));
      
      if (targetLineIndex >= 0) {
        console.log(`\n目标字段在返回内容的第 ${targetLineIndex + 1} 行`);
        
        // 显示目标行上下10行
        const start = Math.max(0, targetLineIndex - 10);
        const end = Math.min(lines.length, targetLineIndex + 11);
        
        console.log(`\n=== 目标字段上下10行内容 (第${start + 1}行到第${end}行) ===`);
        for (let i = start; i < end; i++) {
          const marker = i === targetLineIndex ? '>>> ' : '    ';
          console.log(`${marker}${i + 1}: ${lines[i]}`);
        }
      }
    } else {
      console.log('\n❌ 未找到目标字段 dangerousTools');
    }
  } else {
    console.log('❌ 没有找到相关文件');
  }
  
  await ragExtractor.dispose();
}

testFieldSearch().catch(console.error);
#!/usr/bin/env node

/**
 * 简单的RAG测试程序
 * 直接测试关键词提取和匹配逻辑
 */

// 模拟用户查询，基于真实debug日志
const testQueries = [
  "现在项目已经重建过，请分析重建后的--opanai劫持系统是如何的调用关系并创建md文档保存",
  "contextAgent.ts 文件中的 RAG系统集成代码",
  "hijack.ts 文件中的 OpenAI 劫持实现",
  "config.ts 中的配置管理代码"
];

console.log('🧪 RAG关键词提取测试\n');

// 模拟基础的关键词提取逻辑（类似RAGContextExtractor中的tokenizeForRAG）
function extractKeywords(input) {
  const keywords = [];
  const text = input.toLowerCase();
  
  // Extract words that look like identifiers
  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = text.match(identifierPattern);
  
  if (matches) {
    // Filter for programming-relevant terms
    const stopWords = ['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'some', 'like', 'into', 'make', 'time', 'than', 'only', 'come', 'could', 'also', '现在', '项目', '已经', '重建', '过后', '请', '分析', '的', '是', '如何', '并', '创建', '保存', '中', '文件'];
    
    for (const match of matches) {
      if (match.length >= 3 && !stopWords.includes(match)) {
        keywords.push(match);
      }
    }
  }
  
  // Extract file extensions
  const extPattern = /\.(ts|js|tsx|jsx|py|java|cpp|c|h|hpp|cs|go|rs|php|rb|swift|kt|scala|json|md|yml|yaml)\b/g;
  const extMatches = text.match(extPattern);
  if (extMatches) {
    keywords.push(...extMatches.map(ext => ext.substring(1))); // Remove the dot
  }
  
  // Extract quoted strings (likely file paths or specific terms)
  const quotedPattern = /["'`]([^"'`]+)["'`]/g;
  const quotedMatches = text.match(quotedPattern);
  if (quotedMatches) {
    keywords.push(...quotedMatches.map(q => q.slice(1, -1))); // Remove quotes
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

// 模拟项目文件检查
function checkProjectFiles(keywords) {
  const projectFiles = [
    'packages/core/src/context/contextAgent.ts',
    'packages/core/src/openai/hijack.ts', 
    'packages/core/src/config/config.ts',
    'packages/core/src/openai/modules/response-processor.ts',
    'packages/core/src/context/providers/extractor/ragContextExtractor.ts'
  ];
  
  const matchedFiles = [];
  
  for (const file of projectFiles) {
    for (const keyword of keywords) {
      if (file.toLowerCase().includes(keyword.toLowerCase())) {
        matchedFiles.push({
          file,
          keyword,
          match: true
        });
        break;
      }
    }
  }
  
  return matchedFiles;
}

// 运行测试
testQueries.forEach((query, index) => {
  console.log(`\n🎯 测试 ${index + 1}: ${query}`);
  console.log('─'.repeat(80));
  
  const keywords = extractKeywords(query);
  console.log(`🔍 提取的关键词: ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? '...' : ''}`);
  
  const matchedFiles = checkProjectFiles(keywords);
  console.log(`📁 匹配的文件 (${matchedFiles.length}个):`);
  
  if (matchedFiles.length > 0) {
    matchedFiles.forEach(match => {
      console.log(`   ✅ ${match.file} (关键词: ${match.keyword})`);
    });
  } else {
    console.log(`   ❌ 没有找到匹配的文件`);
  }
});

console.log('\n🎉 关键词提取测试完成');
console.log('\n💡 如果看到匹配的文件，说明RAG系统应该能找到相关内容');
console.log('💡 如果在实际运行中没有显示文件内容，可能是:');
console.log('   1. 文件索引未建立或损坏');
console.log('   2. 搜索阈值设置过高');
console.log('   3. 文件内容提取逻辑有问题');
import { ContextProviderFactory } from "./packages/core/dist/src/context/providers/contextProviderFactory.js";

console.log("🧪 测试RAG索引构建...");

async function testRAGIndexing() {
  try {
    const factory = ContextProviderFactory.getInstance();
    
    // 初始化RAG组件
    const ragConfig = {
      level: "L3",
      maxResults: 10,
      projectRoot: process.cwd(),
      projectHash: "test-project",
      debug: true
    };
    
    const graphProvider = factory.createGraphProvider({
      type: "local",
      config: {
        debug: true,
        projectRoot: process.cwd()
      }
    });
    
    const vectorProvider = factory.createVectorProvider({
      type: "tfidf", 
      config: {
        debug: true
      }
    });
    
    console.log("✅ RAG组件创建成功");
    
    // 手动建立索引
    console.log("🔄 开始建立文件索引...");
    
    // 扫描并索引项目文件
    const testFiles = [
      "./packages/core/src/context/contextAgent.ts",
      "./packages/core/src/context/providers/extractor/ragContextExtractor.ts",
      "./CLAUDE.md",
      "./README.md"
    ];
    
    let indexedCount = 0;
    for (const filePath of testFiles) {
      try {
        const fs = await import("fs/promises");
        const content = await fs.readFile(filePath, "utf-8");
        
        // 添加到向量数据库
        await vectorProvider.indexDocument(filePath, content, { 
          filePath, 
          type: "file" 
        });
        
        // 检查是否成功添加
        const stats = await vectorProvider.getIndexStats();
        console.log(`📈 索引统计: ${stats.documentCount} 文档, ${stats.vectorDimensions} 维度`);
        
        indexedCount++;
        console.log(`📄 已索引: ${filePath} (${content.length} 字符)`);
      } catch (err) {
        console.log(`⚠️ 跳过: ${filePath} - ${err.message}`);
      }
    }
    
    console.log(`✅ 索引构建完成，共索引 ${indexedCount} 个文件`);
    
    // 测试搜索
    console.log("🔍 测试RAG搜索...");
    const searchResult = await vectorProvider.search({
      text: "contextAgent RAG系统",
      topK: 5,
      includeMetadata: true
    });
    console.log(`📊 搜索结果: ${searchResult?.results?.length || 0} 个相关文档`);
    console.log(`⏱️ 搜索用时: ${searchResult?.searchTime || 0}ms`);
    console.log(`📚 总文档数: ${searchResult?.totalDocuments || 0}`);
    
    if (searchResult?.results && searchResult.results.length > 0) {
      console.log("🎯 相关文档:");
      searchResult.results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.id} (相似度: ${result.score?.toFixed(4)})`);
      });
    } else {
      console.log("❌ 没有找到相关文档，可能因为:");
      console.log("  1. 搜索词语言不匹配（中文 vs 英文）");
      console.log("  2. 词汇表构建有问题");
      console.log("  3. TF-IDF 计算阈值过高");
    }
    
  } catch (error) {
    console.error("❌ RAG索引测试失败:", error.message);
    if (error.stack) {
      console.error("堆栈信息:", error.stack);
    }
  }
}

testRAGIndexing().then(() => {
  console.log("🏁 测试完成");
}).catch(err => {
  console.error("💥 测试异常:", err);
});

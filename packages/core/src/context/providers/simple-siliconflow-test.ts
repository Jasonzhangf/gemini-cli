/**
 * Simple test to debug SiliconFlow functionality
 */

import { SiliconFlowEmbeddingProvider } from './vector/siliconFlowEmbeddingProvider.js';
import { RAGContextExtractor } from './extractor/ragContextExtractor.js';
import { MemoryKnowledgeGraphProvider } from './graph/memoryKnowledgeGraph.js';

async function testSiliconFlow() {
  console.log('Testing SiliconFlow...');
  
  const provider = new SiliconFlowEmbeddingProvider();
  await provider.initialize();
  
  // Index a simple document
  const content = 'export function processData(data) { return data.map(x => x * 2); }';
  const docId = 'test-file.js';
  
  console.log('Indexing document:', docId);
  await provider.indexDocument(docId, content, { type: 'javascript' });
  
  // Check index stats
  const stats = await provider.getIndexStats();
  console.log('Index stats:', stats);
  
  // Search for content
  console.log('Searching for "processData"...');
  const results1 = await provider.search('processData');
  console.log('Search results 1:', results1);
  
  console.log('Searching for "map"...');
  const results2 = await provider.search('map');
  console.log('Search results 2:', results2);
  
  console.log('Searching for "nonexistent"...');
  const results3 = await provider.search('nonexistent');
  console.log('Search results 3:', results3);
  
  await provider.dispose();
  
  // Now test with RAGContextExtractor
  console.log('\n--- Testing with RAGContextExtractor ---');
  
  const vectorProvider = new SiliconFlowEmbeddingProvider();
  const graphProvider = new MemoryKnowledgeGraphProvider();
  const ragExtractor = new RAGContextExtractor({
    maxResults: 5,
    threshold: 0.1,
    debugMode: true
  }, graphProvider, vectorProvider);
  
  await ragExtractor.initialize();
  
  // Index content
  const testContent = `
export class TestComponent {
  private readonly apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async processData(data: any[]): Promise<string> {
    return data.map(item => item.toString()).join(',');
  }
}`;
  
  await vectorProvider.indexDocument('/test/TestComponent.ts', testContent, { type: 'typescript' });
  
  // Test query
  const query = {
    userInput: 'processData method implementation',
    context: {
      type: 'code_query',
      language: 'typescript'
    }
  };
  
  console.log('Query:', query);
  
  // Let's manually test what tokens are generated
  console.log('Testing tokenization...');
  const userInput = query.userInput;
  console.log('User input:', userInput);
  
  // Create a test TextAnalyzer
  const TextAnalyzer = (await import('./extractor/ragContextExtractor.js')).RAGContextExtractor;
  
  // Let's manually test the vector search
  const directSearchResults = await vectorProvider.search(userInput);
  console.log('Direct search results:', directSearchResults);
  
  // Test with just 'processData'
  const processDataResults = await vectorProvider.search('processData');
  console.log('ProcessData search results:', processDataResults);
  
  // Test with case insensitive search
  const lowerCaseResults = await vectorProvider.search('processdata');
  console.log('Lower case search results:', lowerCaseResults);
  
  const extractedContext = await ragExtractor.extractContext(query);
  console.log('Extracted context:', JSON.stringify(extractedContext, null, 2));
  
  await ragExtractor.dispose();
  
  // Test Chinese query
  console.log('\n--- Testing Chinese Query ---');
  
  const chineseProvider = new SiliconFlowEmbeddingProvider();
  await chineseProvider.initialize();
  
  const chineseContent = `
/**
 * 用户管理模块
 * 提供用户认证和权限管理功能
 */
export class UserManager {
  /**
   * 验证用户权限
   * @param userId 用户ID
   * @param permission 权限名称
   */
  checkPermission(userId: string, permission: string): boolean {
    return true;
  }
}`;
  
  await chineseProvider.indexDocument('/auth/UserManager.ts', chineseContent, { type: 'typescript' });
  
  const chineseResults = await chineseProvider.search('用户权限验证');
  console.log('Chinese search results:', chineseResults);
  
  await chineseProvider.dispose();
}

testSiliconFlow().catch(console.error);
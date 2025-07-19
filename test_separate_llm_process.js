/**
 * 测试独立的ContextAgent LLM进程
 */

const { ContextAgentLLMClient } = require('./packages/core/dist/context/contextAgentLLMClient.js');

async function testSeparateLLMProcess() {
  console.log('🧪 Testing separate ContextAgent LLM process...');
  
  const client = new ContextAgentLLMClient({
    debugMode: true,
    requestTimeout: 30000
  });

  try {
    // 初始化客户端
    console.log('📡 Initializing LLM client...');
    await client.initialize();
    
    // 测试意图识别
    console.log('🎯 Testing intent recognition...');
    const testInputs = [
      "如何修复TypeScript编译错误？",
      "Help me implement a new user authentication system",
      "Show me the calculateTotal function in the project",
      "Add unit tests for the shopping cart component"
    ];

    for (const input of testInputs) {
      console.log(`\n📝 Input: ${input}`);
      try {
        const response = await client.requestIntentRecognition(input);
        console.log(`✅ Intent: ${response.intent}`);
        console.log(`🔍 Keywords: ${response.keywords.join(', ')}`);
        console.log(`📊 Confidence: ${response.confidence}`);
        console.log(`⏱️  Processing time: ${response.processingTime}ms`);
      } catch (error) {
        console.error(`❌ Error processing input: ${error.message}`);
      }
    }

    // 检查健康状态
    console.log('\n🏥 Checking health status...');
    const health = await client.checkHealth();
    console.log(`✅ Health status: ${health.status}`);
    console.log(`🤖 LLM ready: ${health.isLLMReady}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // 清理资源
    console.log('\n🧹 Cleaning up...');
    await client.dispose();
    console.log('✅ Test completed');
  }
}

// 运行测试
if (require.main === module) {
  testSeparateLLMProcess().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testSeparateLLMProcess };
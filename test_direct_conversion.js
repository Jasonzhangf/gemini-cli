#!/usr/bin/env node

// Direct test of convertGeminiToOpenAI method
import { OpenAICompatibleContentGenerator } from './packages/core/dist/src/core/openaiCompatibleContentGenerator.js';

async function testConversion() {
  console.log('🧪 Testing convertGeminiToOpenAI with qwen3 model...');
  
  const generator = new OpenAICompatibleContentGenerator(
    'test-key',
    'http://localhost:1234/v1',
    'unsloth/qwen3-235b-a22b-gguf/qwen3-235b-a22b-ud-q4_k_xl-00001-of-00003.gguf'
  );
  
  const testRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: '创建一个测试文件' }]
      }
    ],
    config: {
      tools: []
    }
  };
  
  try {
    const result = await generator.convertGeminiToOpenAI(testRequest);
    console.log('✅ Conversion result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if /no_think was added
    const userMessage = result.messages.find(msg => msg.role === 'user');
    if (userMessage && userMessage.content.startsWith('/no_think ')) {
      console.log('✅ /no_think prefix successfully added!');
    } else {
      console.log('❌ /no_think prefix not found');
      console.log('User message:', userMessage?.content);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConversion();
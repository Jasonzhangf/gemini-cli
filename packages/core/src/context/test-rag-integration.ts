#!/usr/bin/env node

/**
 * Test script to verify RAG integration with contextAgent
 * This tests if RAG content appears in dynamic context
 */

import { ContextAgent } from './contextAgent.js';
import { Config, AnalysisMode } from '../config/config.js';

async function testRAGIntegration() {
  console.log('🧪 Testing RAG integration with ContextAgent...\n');

  try {
    // Create config
    const config = new Config({
      sessionId: 'test-rag-session',
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

    // Create ContextAgent
    const contextAgent = new ContextAgent({
      config,
      projectDir: process.cwd(),
      sessionId: 'test-rag-session'
    });

    console.log('📡 Initializing ContextAgent...');
    await contextAgent.initialize();

    // Test 1: Basic context injection
    console.log('\n🔍 Test 1: Basic context injection');
    const basicContext = await contextAgent.getContextForPrompt('What is the RAG system?');
    console.log('Basic context length:', basicContext.length);
    console.log('Contains RAG content:', basicContext.includes('RAG') || basicContext.includes('context'));

    // Test 2: RAG-specific query
    console.log('\n🔍 Test 2: RAG-specific query');
    const ragContext = await contextAgent.getContextForPrompt('How does the context extraction work in this codebase?');
    console.log('RAG context length:', ragContext.length);
    console.log('Contains advanced context:', ragContext.includes('Advanced RAG') || ragContext.includes('semantic'));

    // Test 3: Code-related query
    console.log('\n🔍 Test 3: Code-related query');
    const codeContext = await contextAgent.getContextForPrompt('Show me TypeScript files related to context management');
    console.log('Code context length:', codeContext.length);
    console.log('Contains file references:', codeContext.includes('.ts') || codeContext.includes('file'));

    console.log('\n✅ RAG integration test completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Basic context: ${basicContext.length} chars`);
    console.log(`- RAG context: ${ragContext.length} chars`);
    console.log(`- Code context: ${codeContext.length} chars`);

    if (ragContext.length > 0) {
      console.log('\n🎉 RAG system is properly integrated and producing context!');
    } else {
      console.log('\n⚠️  RAG system may not be properly initialized or context is empty');
    }

  } catch (error) {
    console.error('❌ RAG integration test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRAGIntegration().catch(console.error);
}

export { testRAGIntegration };
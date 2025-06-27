#!/usr/bin/env node

/**
 * 演示劫持成功时的提示信息
 */

function demoHijackMessage() {
  // 模拟劫持成功的消息
  const originalModel = 'gemini-2.5-pro';
  const hijackedModel = 'blacktooth-ab-test';
  const endpoint = 'http://127.0.0.1:2048/v1';
  const apiKey = '1234567890';
  
  console.log('');
  console.log('🎉 ===== MODEL HIJACK SUCCESSFUL ===== 🎉');
  console.log(`🎯 Original Model: ${originalModel}`);
  console.log(`✨ Hijacked To: ${hijackedModel}`);
  console.log(`🔗 Endpoint: ${endpoint}`);
  console.log(`🔑 Using API Key: ${apiKey.substring(0, 8)}...`);
  console.log('🛡️ Request will be transparently redirected');
  console.log('========================================');
  console.log('');
  
  console.log('💡 This message will appear when you run:');
  console.log('   gemini-cli -m gemini-2.5-pro');
  console.log('');
  console.log('📋 Configuration loaded from:');
  console.log('   ~/.gemini/.env');
}

demoHijackMessage();
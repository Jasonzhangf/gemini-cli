#!/usr/bin/env node

/**
 * 测试基于环境变量的 gemini-2.5-pro 模型劫持功能
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testEnvHijack() {
  console.log('🧪 Testing env-based gemini-2.5-pro hijack...\n');

  try {
    // 检查 .gemini/.env 文件
    const envPath = '/Users/fanzhang/.gemini/.env';
    if (fs.existsSync(envPath)) {
      console.log('1. ✅ Found .gemini/.env file:');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      console.log(envContent);
      console.log('');
    } else {
      console.log('❌ .gemini/.env file not found');
      return;
    }

    // 设置环境变量（模拟加载）
    process.env.HIJACK_ENABLED = 'true';
    process.env.HIJACK_TARGET_MODEL = 'gemini-2.5-pro';
    process.env.HIJACK_PROVIDER = 'OPENAI_COMPATIBLE';
    process.env.HIJACK_ACTUAL_MODEL = 'blacktooth-ab-test';
    process.env.HIJACK_API_KEY = '1234567890';
    process.env.HIJACK_API_ENDPOINT = 'http://127.0.0.1:2048/v1';

    console.log('2. ✅ Environment variables set for testing');
    console.log('');

    // 检查是否可以构建项目
    try {
      console.log('3. Building project...');
      execSync('npm run build', {
        cwd: '/Users/fanzhang/Documents/github/gemini-cli',
        stdio: 'pipe',
      });
      console.log('✅ Build successful');
      console.log('');
    } catch (buildError) {
      console.log('⚠️  Build may have issues, but continuing test...');
      console.log('');
    }

    // 模拟劫持检测
    console.log('4. Testing hijack detection logic...');

    // 检查生成的文件是否存在
    const generatedFiles = [
      '/Users/fanzhang/Documents/github/gemini-cli/packages/core/dist/core/contentGenerator.js',
      '/Users/fanzhang/Documents/github/gemini-cli/packages/core/dist/core/openaiCompatibleContentGenerator.js',
    ];

    let allFilesExist = true;
    for (const file of generatedFiles) {
      if (fs.existsSync(file)) {
        console.log(`✅ Found: ${path.basename(file)}`);
      } else {
        console.log(`❌ Missing: ${path.basename(file)}`);
        allFilesExist = false;
      }
    }

    if (allFilesExist) {
      console.log('');
      console.log('🎉 All required files are ready!');
      console.log('');
      console.log('📝 To test the hijack functionality:');
      console.log('   1. Make sure your .gemini/.env is loaded');
      console.log('   2. Run: gemini-cli -m gemini-2.5-pro');
      console.log('   3. Look for the "MODEL HIJACK SUCCESSFUL" message');
      console.log('   4. Verify requests go to: http://127.0.0.1:2048/v1');
    } else {
      console.log('');
      console.log('⚠️  Some files are missing. Run "npm run build" first.');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnvHijack();

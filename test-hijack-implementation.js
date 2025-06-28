#!/usr/bin/env node

/**
 * 测试 gemini-2.5-pro 模型劫持功能
 */

const { execSync } = require('child_process');
const path = require('path');

async function testHijackImplementation() {
  console.log('🧪 Testing gemini-2.5-pro hijack implementation...\n');

  try {
    // 首先构建项目
    console.log('1. Building project...');
    const buildResult = execSync('npm run build', {
      cwd: '/Users/fanzhang/Documents/github/gemini-cli',
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    console.log('✅ Build completed successfully\n');

    // 检查配置文件是否存在
    const fs = require('fs');
    const configPath = '/Users/fanzhang/.gemini/model-hijack.json';

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log('2. Hijack configuration found:');
      console.log(JSON.stringify(config, null, 2));
      console.log('✅ Configuration loaded successfully\n');
    } else {
      console.log('❌ Hijack configuration file not found at:', configPath);
      return;
    }

    // 尝试动态导入并测试劫持逻辑
    console.log('3. Testing hijack logic...');
    const contentGeneratorPath = path.join(
      '/Users/fanzhang/Documents/github/gemini-cli/packages/core/dist/core/contentGenerator.js',
    );

    if (fs.existsSync(contentGeneratorPath)) {
      console.log('✅ ContentGenerator module found');
      console.log('📝 Note: To fully test, run: gemini-cli -m gemini-2.5-pro');
      console.log(
        '🔄 Expected behavior: Model should be hijacked to blacktooth-ab-test via http://127.0.0.1:2048/v1',
      );
    } else {
      console.log(
        '❌ ContentGenerator module not found. Please run npm run build first.',
      );
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.message.includes('npm run build')) {
      console.log(
        '\n💡 Tip: Make sure to run "npm run build" in the project directory first',
      );
    }
  }
}

testHijackImplementation();

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create a large context test file
const largeContent = 'A'.repeat(2048); // 2KB content - exceeds 1KB threshold
const testPrompt = `请分析以下大量内容：${largeContent}`;

console.log('📊 Test content size:', Buffer.byteLength(testPrompt, 'utf8'), 'bytes');
console.log('📊 Expected: Content >1KB should be written to temp file');
console.log('🧪 Running test with large context...');

// Create test file to verify the system works
const testFile = path.join(__dirname, 'test_large_context_input.txt');
fs.writeFileSync(testFile, testPrompt);

console.log('📁 Created test file:', testFile);
console.log('🚀 Run this command to test:');
console.log(`gemini -p "读取文件 ${testFile} 并分析其内容"`);
console.log('');
console.log('✅ Expected behavior:');
console.log('1. Large context should be written to temp file');
console.log('2. Temp file should be referenced in message');
console.log('3. Temp file should be cleaned up after processing');
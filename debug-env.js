#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const GEMINI_DIR = '.gemini';

function findEnvFile(startDir) {
  console.log(`🔍 Starting search from: ${startDir}`);
  let currentDir = path.resolve(startDir);
  
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    console.log(`  🔍 Checking: ${geminiEnvPath}`);
    if (fs.existsSync(geminiEnvPath)) {
      console.log(`  ✅ Found: ${geminiEnvPath}`);
      return geminiEnvPath;
    }
    
    const envPath = path.join(currentDir, '.env');
    console.log(`  🔍 Checking: ${envPath}`);
    if (fs.existsSync(envPath)) {
      console.log(`  ✅ Found: ${envPath}`);
      return envPath;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(os.homedir(), GEMINI_DIR, '.env');
      console.log(`  🔍 Checking home: ${homeGeminiEnvPath}`);
      if (fs.existsSync(homeGeminiEnvPath)) {
        console.log(`  ✅ Found home: ${homeGeminiEnvPath}`);
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(os.homedir(), '.env');
      console.log(`  🔍 Checking home: ${homeEnvPath}`);
      if (fs.existsSync(homeEnvPath)) {
        console.log(`  ✅ Found home: ${homeEnvPath}`);
        return homeEnvPath;
      }
      console.log(`  ❌ No .env file found`);
      return null;
    }
    currentDir = parentDir;
  }
}

// Test from different directories
console.log('=== ENV FILE SEARCH DEBUG ===');
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Home directory: ${os.homedir()}`);
console.log('');

const envFile = findEnvFile(process.cwd());
console.log('');
console.log(`Final result: ${envFile}`);

if (envFile) {
  console.log('');
  console.log('=== ENV FILE CONTENTS ===');
  console.log(fs.readFileSync(envFile, 'utf8'));
}
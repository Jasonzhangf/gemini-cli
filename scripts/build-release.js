#!/usr/bin/env node

/**
 * Build script for creating release packages
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🚀 Building Gemini CLI Release...');

// Clean previous builds
console.log('🧹 Cleaning previous builds...');
try {
  execSync('rm -rf dist packages/*/dist', { stdio: 'inherit', cwd: rootDir });
} catch (error) {
  // Ignore if dist doesn't exist
}

// Build all packages
console.log('🔨 Building all packages...');
execSync('npm run build', { stdio: 'inherit', cwd: rootDir });

// Verify builds
const coreDistPath = path.join(rootDir, 'packages/core/dist');
const cliDistPath = path.join(rootDir, 'packages/cli/dist');

if (!fs.existsSync(coreDistPath)) {
  throw new Error('❌ Core package build failed - dist directory not found');
}

if (!fs.existsSync(cliDistPath)) {
  throw new Error('❌ CLI package build failed - dist directory not found');
}

console.log('✅ All packages built successfully!');
console.log(`📦 Core package: ${coreDistPath}`);
console.log(`📦 CLI package: ${cliDistPath}`);

// Check package sizes
const getCoreSize = () => {
  try {
    const output = execSync('du -sh packages/core/dist', { encoding: 'utf8', cwd: rootDir });
    return output.trim().split('\t')[0];
  } catch {
    return 'unknown';
  }
};

const getCliSize = () => {
  try {
    const output = execSync('du -sh packages/cli/dist', { encoding: 'utf8', cwd: rootDir });
    return output.trim().split('\t')[0];
  } catch {
    return 'unknown';
  }
};

console.log(`📊 Package sizes:`);
console.log(`   Core: ${getCoreSize()}`);
console.log(`   CLI:  ${getCliSize()}`);

console.log('🎉 Release build completed successfully!');
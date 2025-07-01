/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// First, generate the git commit info file.
try {
  execSync('node scripts/generate-git-commit-info.js', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to generate git commit info.');
  process.exit(1);
}

console.log('🚀 Building all packages...');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const packagesDir = path.join(PROJECT_ROOT, 'packages');

function runCommand(command, cwd) {
  console.log(`\n📦 Running: ${command}`);
  console.log(`📁 In: ${cwd}`);
  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command} in ${cwd}`);
    process.exit(1);
  }
}

try {
  const packages = readdirSync(packagesDir).filter((file) => {
    return statSync(path.join(packagesDir, file)).isDirectory();
  });

  for (const pkg of packages) {
    const pkgDir = path.join(packagesDir, pkg);
    console.log(`\n🔨 Building @fanzhang/gemini-cli-hijack/${pkg}...`);
    runCommand('npm run build', pkgDir);
  }

  console.log('\n✅ All packages built successfully!');
} catch (error) {
  console.error('❌ Failed to read packages directory.');
  process.exit(1);
}
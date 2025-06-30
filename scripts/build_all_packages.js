#!/usr/bin/env node

/**
 * Build all packages in the correct order
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');

function runCommand(command, cwd = PROJECT_ROOT) {
  console.log(`\n📦 Running: ${command}`);
  console.log(`📁 In: ${cwd}`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

function buildPackage(packagePath) {
  const packageJson = path.join(packagePath, 'package.json');
  if (!fs.existsSync(packageJson)) {
    console.log(`⚠️  No package.json found in ${packagePath}, skipping...`);
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  console.log(`\n🔨 Building ${pkg.name}...`);
  
  // Check if package has build script
  if (pkg.scripts && pkg.scripts.build) {
    runCommand('npm run build', packagePath);
  } else {
    console.log(`ℹ️  No build script found for ${pkg.name}, skipping...`);
  }
}

function main() {
  console.log('🚀 Building all packages...');
  
  // Build order: core first, then cli
  const packages = [
    path.join(PROJECT_ROOT, 'packages', 'core'),
    path.join(PROJECT_ROOT, 'packages', 'cli')
  ];
  
  for (const packagePath of packages) {
    if (fs.existsSync(packagePath)) {
      buildPackage(packagePath);
    } else {
      console.log(`⚠️  Package not found: ${packagePath}`);
    }
  }
  
  // Copy CLI dist to root for global installation
  const cliDistPath = path.join(PROJECT_ROOT, 'packages', 'cli', 'dist');
  const rootDistPath = path.join(PROJECT_ROOT, 'dist');
  
  if (fs.existsSync(cliDistPath)) {
    console.log('\n📋 Copying CLI dist to root...');
    if (fs.existsSync(rootDistPath)) {
      fs.rmSync(rootDistPath, { recursive: true });
    }
    fs.cpSync(cliDistPath, rootDistPath, { recursive: true });
    console.log('✅ CLI dist copied to root');
  } else {
    console.error('❌ CLI dist not found after build');
    process.exit(1);
  }
  
  console.log('\n🎉 All packages built successfully!');
}

if (require.main === module) {
  main();
}

module.exports = { buildPackage, main };
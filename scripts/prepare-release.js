#!/usr/bin/env node

/**
 * Script to prepare release version and update package.json files
 */

import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Please provide a version number');
  console.error('Usage: node scripts/prepare-release.js <version>');
  console.error('Example: node scripts/prepare-release.js 0.1.0');
  process.exit(1);
}

console.log(`🏷️  Preparing release version: ${newVersion}`);

// Update root package.json
const updatePackageJson = (packagePath, packageName) => {
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.warn(`⚠️ Package.json not found at: ${packageJsonPath}`);
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  
  // Update dependencies if they reference other packages in this monorepo
  if (packageJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
      if (depName.startsWith('@fanzhang/gemini-cli')) {
        packageJson.dependencies[depName] = newVersion;
      }
    }
  }
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ Updated ${packageName}: ${packageJson.name}@${newVersion}`);
};

// Update all package.json files
updatePackageJson(rootDir, 'root');
updatePackageJson(path.join(rootDir, 'packages/core'), 'core package');
updatePackageJson(path.join(rootDir, 'packages/cli'), 'cli package');

console.log(`🎉 Version updated to ${newVersion} in all packages!`);
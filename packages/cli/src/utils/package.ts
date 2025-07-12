/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readPackageUp,
  type PackageJson as BasePackageJson,
} from 'read-package-up';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

export type PackageJson = BasePackageJson & {
  nightly?: boolean;
  config?: {
    sandboxImageUri?: string;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let packageJson: PackageJson | undefined;

export async function getPackageJson(): Promise<PackageJson | undefined> {
  if (packageJson) {
    return packageJson;
  }

  // Try to read package.json directly first (to avoid caching issues with read-package-up)
  try {
    // Look for package.json in the expected location based on our directory structure
    let packageJsonPath: string;
    
    // If we're in dist directory, look for dist/package.json
    if (__dirname.includes('/dist/')) {
      const distRoot = __dirname.split('/dist/')[0] + '/dist';
      packageJsonPath = path.join(distRoot, 'package.json');
    } else {
      // Otherwise use read-package-up fallback
      const result = await readPackageUp({ cwd: __dirname });
      if (!result) {
        return;
      }
      packageJson = result.packageJson;
      return packageJson;
    }
    
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(content);
    return packageJson;
  } catch (err) {
    // Fallback to read-package-up
    const result = await readPackageUp({ cwd: __dirname });
    if (!result) {
      // TODO: Maybe bubble this up as an error.
      return;
    }

    packageJson = result.packageJson;
    return packageJson;
  }
}

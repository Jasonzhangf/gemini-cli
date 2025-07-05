/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';
import { writeFileSync, chmodSync, existsSync } from 'fs';
import { join } from 'path';

if (!process.cwd().includes('packages')) {
  console.error('must be invoked from a package directory');
  process.exit(1);
}

// build typescript files
execSync('tsc --build', { stdio: 'inherit' });

// copy .{md,json} files
execSync('node ../../scripts/copy_files.js', { stdio: 'inherit' });

// Set executable permission for CLI entry point if this is the CLI package
const packageName = process.cwd().split('/').pop();
if (packageName === 'cli') {
  const indexPath = join(process.cwd(), 'dist', 'index.js');
  if (existsSync(indexPath)) {
    chmodSync(indexPath, 0o755); // rwxr-xr-x
    console.log('✅ Set executable permission for CLI index.js');
  }
}

// touch dist/.last_build
writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
process.exit(0);

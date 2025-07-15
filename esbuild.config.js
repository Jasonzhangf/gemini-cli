/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

const workspaceResolverPlugin = {
  name: 'workspace-resolver',
  setup(build) {
    // Resolve @google/gemini-cli-core to its actual path in the workspace
    build.onResolve({ filter: /^@google\/gemini-cli-core$/ }, args => {
      return { path: path.resolve(__dirname, 'packages/core/dist/index.js') }
    })
  },
}

esbuild
  .build({
    entryPoints: ['packages/cli/dist/index.js'],
    bundle: true,
    outfile: 'bundle/gemini.js',
    platform: 'node',
    format: 'esm',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    minify: false,
    sourcemap: false,
    loader: {
      '.js': 'js',
      '.json': 'json'
    },
    resolveExtensions: ['.js', '.json'],
    allowOverwrite: true,
    plugins: [workspaceResolverPlugin],
  })
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });

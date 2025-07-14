/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const DEBUG_DIR = path.join(os.homedir(), '.gemini', 'debug');
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

function getDebugFilePath(sessionId: string): string {
  return path.join(DEBUG_DIR, `gemini-debug-${sessionId}.log`);
}

function appendToDebugLog(sessionId: string, content: string) {
  const filePath = getDebugFilePath(sessionId);
  fs.appendFileSync(filePath, content + '\n\n');
}

export function logModelResponse(sessionId: string, response: string) {
  let content = '## Model Response (OpenAI)\n';
  content += response;
  appendToDebugLog(sessionId, content);
} 
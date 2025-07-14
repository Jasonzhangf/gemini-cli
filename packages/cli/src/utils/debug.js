/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Part } from '@google/genai';

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

export function logUserQuery(sessionId: string, query: string | Part | (string | Part)[]) {
  let content = '## User Query\n';
  if (Array.isArray(query)) {
    content += query.map(part => typeof part === 'string' ? part : part.text).join('\n');
  } else if (typeof query === 'string') {
    content += query;
  } else {
    content += query.text;
  }
  appendToDebugLog(sessionId, content);
}

export function logContext(sessionId: string, context: (Part | string)[]) {
  let content = '## Context Sent\n';
  content += context.map(part => 
    typeof part === 'string' ? part : JSON.stringify(part, null, 2)
  ).join('\n');
  appendToDebugLog(sessionId, content);
}

export function logModelResponse(sessionId: string, response: string) {
  let content = '## Model Response\n';
  content += response;
  appendToDebugLog(sessionId, content);
}

export function logToolCall(sessionId: string, toolCall: unknown) {
  let content = '## Tool Call\n';
  content += JSON.stringify(toolCall, null, 2);
  appendToDebugLog(sessionId, content);
} 
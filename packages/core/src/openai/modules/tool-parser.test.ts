/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ToolParser } from './tool-parser.js';
import { ContentIsolator } from './content-isolator.js';

describe('ToolParser', () => {
  describe('parseToolCalls with write_file', () => {
    it('should fail to parse write_file with complex content without isolation', () => {
      const problematicContent = `
# Title
This is some markdown content.
It includes a code block that looks like a tool call:
\`\`\`
✦ some_tool({"key": "value"}) ✦
\`\`\`
And also some JSON:
{"user": "test", "id": 123}
`;
      // This simulates how a model might incorrectly generate a tool call with unescaped content
      const text = `✦ write_file({
  "file_path": "./test.md",
  "content": "${problematicContent.replace(/"/g, '\\"')}"
}) ✦`;

      const toolCalls = ToolParser.parseToolCalls(text);
      
      // The parser should fail because the newlines in the content break the JSON structure.
      // A null is returned from createToolCall, so the final array is empty.
      expect(toolCalls.length).toBe(0);
    });

    it('should correctly parse write_file with complex content using content isolation', () => {
      const problematicContent = `
# Title
This is some markdown content.
It includes a code block that looks like a tool call:
\`\`\`
✦ some_tool({"key": "value"}) ✦
\`\`\`
And also some JSON:
{"user": "test", "id": 123}
`;
      const isolatedContent = ContentIsolator.isolateContent(problematicContent);

      // The parser expects the raw string with markers, not a JSON-stringified version.
      const text = `✦ write_file({
  "file_path": "./test.md",
  "content": "${isolatedContent}"
}) ✦`;

      const toolCalls = ToolParser.parseToolCalls(text);

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].name).toBe('write_file');
      
      const args = toolCalls[0].args;
      expect(args.file_path).toBe('./test.md');
      expect(args.content).toBe(problematicContent);
    });

    it('should correctly parse a simple write_file call', () => {
      const text = `✦ write_file({"file_path": "./simple.txt", "content": "Hello World"}) ✦`;
      const toolCalls = ToolParser.parseToolCalls(text);

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].name).toBe('write_file');
      expect(toolCalls[0].args).toEqual({
        file_path: './simple.txt',
        content: 'Hello World',
      });
    });
  });
}); 
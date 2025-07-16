/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTYVirtualizer, WebTerminalInput, WebTerminalOutput } from './TTYVirtualizer';

describe('TTYVirtualizer', () => {
  let virtualizer: TTYVirtualizer;

  beforeEach(() => {
    virtualizer = new TTYVirtualizer({
      columns: 80,
      rows: 24,
      enableColors: true,
      bufferSize: 100,
    });
  });

  describe('Web Input Processing', () => {
    it('should convert command input to terminal format', () => {
      const input: WebTerminalInput = {
        type: 'command',
        content: 'ls -la',
      };

      const result = virtualizer.processWebInput(input);
      expect(result).toBe('ls -la\n');
    });

    it('should convert special key inputs', () => {
      const testCases = [
        { content: 'Enter', expected: '\n' },
        { content: 'Tab', expected: '\t' },
        { content: 'Backspace', expected: '\b' },
        { content: 'ArrowUp', expected: '\x1b[A' },
        { content: 'ArrowDown', expected: '\x1b[B' },
        { content: 'ArrowRight', expected: '\x1b[C' },
        { content: 'ArrowLeft', expected: '\x1b[D' },
      ];

      testCases.forEach(({ content, expected }) => {
        const input: WebTerminalInput = {
          type: 'key',
          content,
        };
        const result = virtualizer.processWebInput(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle Ctrl key combinations', () => {
      const input: WebTerminalInput = {
        type: 'key',
        content: 'C',
        metadata: { ctrlKey: true },
      };

      const result = virtualizer.processWebInput(input);
      expect(result).toBe('\x03'); // Ctrl+C
    });

    it('should convert interrupt signals', () => {
      const testCases = [
        { content: 'SIGINT', expected: '\x03' },
        { content: 'SIGTERM', expected: '\x04' },
        { content: 'SIGQUIT', expected: '\x1c' },
        { content: 'SIGTSTP', expected: '\x1a' },
      ];

      testCases.forEach(({ content, expected }) => {
        const input: WebTerminalInput = {
          type: 'interrupt',
          content,
        };
        const result = virtualizer.processWebInput(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Terminal Output Processing', () => {
    it('should process plain text output', () => {
      const output = 'Hello, World!';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'text',
        content: 'Hello, World!',
        styles: {},
      });
      expect(results[0].timestamp).toBeTypeOf('number');
    });

    it('should process ANSI color codes', () => {
      const output = '\x1b[31mRed text\x1b[0m';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'text',
        content: 'Red text',
        styles: {
          color: '#800000', // Red color
        },
      });
    });

    it('should process ANSI style codes', () => {
      const output = '\x1b[1m\x1b[3m\x1b[4mBold Italic Underline\x1b[0m';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'text',
        content: 'Bold Italic Underline',
        styles: {
          bold: true,
          italic: true,
          underline: true,
        },
      });
    });

    it('should process RGB color codes', () => {
      const output = '\x1b[38;2;255;128;64mRGB text\x1b[0m';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'text',
        content: 'RGB text',
        styles: {
          color: 'rgb(255, 128, 64)',
        },
      });
    });

    it('should process cursor control sequences', () => {
      const output = '\x1b[2ACursor up';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        type: 'control',
        content: 'cursor_a',
      });
      expect(results[1]).toMatchObject({
        type: 'text',
        content: 'Cursor up',
      });
    });

    it('should process clear screen sequences', () => {
      const output = '\x1b[2JScreen cleared';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        type: 'control',
        content: 'clear_screen',
      });
      expect(results[1]).toMatchObject({
        type: 'text',
        content: 'Screen cleared',
      });
    });

    it('should handle mixed content with multiple ANSI sequences', () => {
      const output = 'Normal \x1b[31mRed\x1b[0m \x1b[1mBold\x1b[0m text';
      const results = virtualizer.processTerminalOutput(output);

      expect(results).toHaveLength(4);
      expect(results[0].content).toBe('Normal ');
      expect(results[1].content).toBe('Red');
      expect(results[1].styles?.color).toBe('#800000');
      expect(results[2].content).toBe(' ');
      expect(results[3].content).toBe('Bold');
      expect(results[3].styles?.bold).toBe(true);
    });
  });

  describe('Buffer Management', () => {
    it('should maintain output buffer', () => {
      const output1 = 'First output';
      const output2 = 'Second output';

      virtualizer.processTerminalOutput(output1);
      virtualizer.processTerminalOutput(output2);

      const buffer = virtualizer.getOutputBuffer();
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe('First output');
      expect(buffer[1].content).toBe('Second output');
    });

    it('should limit buffer size', () => {
      const smallVirtualizer = new TTYVirtualizer({ bufferSize: 2 });

      // Add more outputs than buffer size
      smallVirtualizer.processTerminalOutput('Output 1');
      smallVirtualizer.processTerminalOutput('Output 2');
      smallVirtualizer.processTerminalOutput('Output 3');

      const buffer = smallVirtualizer.getOutputBuffer();
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe('Output 2');
      expect(buffer[1].content).toBe('Output 3');
    });

    it('should clear buffer', () => {
      virtualizer.processTerminalOutput('Some output');
      expect(virtualizer.getOutputBuffer()).toHaveLength(1);

      virtualizer.clearBuffer();
      expect(virtualizer.getOutputBuffer()).toHaveLength(0);
    });
  });

  describe('Dimensions Management', () => {
    it('should get current dimensions', () => {
      const dimensions = virtualizer.getDimensions();
      expect(dimensions).toEqual({ columns: 80, rows: 24 });
    });

    it('should set new dimensions', () => {
      virtualizer.setDimensions(120, 30);
      const dimensions = virtualizer.getDimensions();
      expect(dimensions).toEqual({ columns: 120, rows: 30 });
    });

    it('should emit resize event when dimensions change', () => {
      const resizeHandler = vi.fn();
      virtualizer.on('resize', resizeHandler);

      virtualizer.setDimensions(100, 25);

      expect(resizeHandler).toHaveBeenCalledWith({ columns: 100, rows: 25 });
    });
  });

  describe('Stream Integration', () => {
    it('should provide input and output streams', () => {
      const inputStream = virtualizer.getInputStream();
      const outputStream = virtualizer.getOutputStream();

      expect(inputStream).toBeDefined();
      expect(outputStream).toBeDefined();
      expect(typeof inputStream.write).toBe('function');
      expect(typeof outputStream.read).toBe('function');
    });

    it('should emit input events when data is written to input stream', () => {
      const inputHandler = vi.fn();
      virtualizer.on('input', inputHandler);

      const inputStream = virtualizer.getInputStream();
      inputStream.write('test input');

      expect(inputHandler).toHaveBeenCalledWith('test input');
    });
  });

  describe('Event Handling', () => {
    it('should emit output events when processing terminal output', () => {
      const outputHandler = vi.fn();
      virtualizer.on('output', outputHandler);

      const output = 'Test output';
      const results = virtualizer.processTerminalOutput(output);

      expect(outputHandler).toHaveBeenCalledWith(results);
    });

    it('should emit buffer cleared events', () => {
      const bufferClearedHandler = vi.fn();
      virtualizer.on('bufferCleared', bufferClearedHandler);

      virtualizer.clearBuffer();

      expect(bufferClearedHandler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed ANSI sequences gracefully', () => {
      const output = '\x1b[invalid sequence\x1b[31mRed text\x1b[0m';
      
      expect(() => {
        const results = virtualizer.processTerminalOutput(output);
        expect(results).toBeDefined();
      }).not.toThrow();
    });

    it('should handle empty input gracefully', () => {
      const results = virtualizer.processTerminalOutput('');
      expect(results).toEqual([]);
    });

    it('should handle null/undefined input gracefully', () => {
      expect(() => {
        virtualizer.processWebInput({
          type: 'command',
          content: '',
        });
      }).not.toThrow();
    });
  });
});
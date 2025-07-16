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

import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

/**
 * ANSI escape sequence patterns for terminal control
 */
const ANSI_PATTERNS = {
  // Color codes
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  ITALIC: '\x1b[3m',
  UNDERLINE: '\x1b[4m',
  
  // Cursor control
  CURSOR_UP: /\x1b\[(\d+)?A/g,
  CURSOR_DOWN: /\x1b\[(\d+)?B/g,
  CURSOR_FORWARD: /\x1b\[(\d+)?C/g,
  CURSOR_BACK: /\x1b\[(\d+)?D/g,
  CURSOR_POSITION: /\x1b\[(\d+);(\d+)H/g,
  
  // Screen control
  CLEAR_SCREEN: /\x1b\[2J/g,
  CLEAR_LINE: /\x1b\[K/g,
  
  // Color patterns
  FG_COLOR: /\x1b\[3([0-7])m/g,
  BG_COLOR: /\x1b\[4([0-7])m/g,
  RGB_COLOR: /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
};

/**
 * Web-compatible format for terminal output
 */
export interface WebTerminalOutput {
  type: 'text' | 'control' | 'error';
  content: string;
  styles?: {
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
  timestamp: number;
}

/**
 * Terminal input from web interface
 */
export interface WebTerminalInput {
  type: 'command' | 'key' | 'interrupt';
  content: string;
  metadata?: {
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    keyCode?: number;
  };
}

/**
 * TTY Virtualization configuration
 */
export interface TTYVirtualizerConfig {
  columns: number;
  rows: number;
  enableColors: boolean;
  bufferSize: number;
  encoding: string;
}

/**
 * TTYVirtualizer class provides bidirectional conversion between
 * terminal streams and web-compatible formats
 */
export class TTYVirtualizer extends EventEmitter {
  private config: TTYVirtualizerConfig;
  private inputStream: Writable;
  private outputStream: Readable;
  private outputBuffer: WebTerminalOutput[] = [];
  private currentStyles: WebTerminalOutput['styles'] = {};

  constructor(config: Partial<TTYVirtualizerConfig> = {}) {
    super();
    
    this.config = {
      columns: 80,
      rows: 24,
      enableColors: true,
      bufferSize: 1000,
      encoding: 'utf8',
      ...config,
    };

    this.inputStream = new Writable({
      write: (chunk, encoding, callback) => {
        this.processTerminalInput(chunk.toString());
        callback();
      },
    });

    this.outputStream = new Readable({
      read: () => {
        // Output stream is managed by processTerminalOutput
      },
    });
  }

  /**
   * Convert web input to terminal-compatible format
   */
  public processWebInput(input: WebTerminalInput): string {
    switch (input.type) {
      case 'command':
        return input.content + '\n';
      
      case 'key':
        return this.convertKeyInput(input);
      
      case 'interrupt':
        return this.convertInterruptInput(input);
      
      default:
        return input.content;
    }
  }

  /**
   * Convert terminal output to web-compatible format
   */
  public processTerminalOutput(data: string): WebTerminalOutput[] {
    const outputs: WebTerminalOutput[] = [];
    let currentText = '';
    let position = 0;

    while (position < data.length) {
      const char = data[position];
      
      if (char === '\x1b') {
        // Process accumulated text before escape sequence
        if (currentText) {
          outputs.push(this.createTextOutput(currentText));
          currentText = '';
        }
        
        // Process ANSI escape sequence
        const escapeResult = this.processAnsiEscape(data, position);
        if (escapeResult.controlOutput) {
          outputs.push(escapeResult.controlOutput);
        }
        position = escapeResult.nextPosition;
      } else {
        currentText += char;
        position++;
      }
    }

    // Process remaining text
    if (currentText) {
      outputs.push(this.createTextOutput(currentText));
    }

    // Add to buffer and emit
    this.addToBuffer(outputs);
    this.emit('output', outputs);

    return outputs;
  }

  /**
   * Get current output buffer
   */
  public getOutputBuffer(): WebTerminalOutput[] {
    return [...this.outputBuffer];
  }

  /**
   * Clear output buffer
   */
  public clearBuffer(): void {
    this.outputBuffer = [];
    this.emit('bufferCleared');
  }

  /**
   * Get terminal dimensions
   */
  public getDimensions(): { columns: number; rows: number } {
    return {
      columns: this.config.columns,
      rows: this.config.rows,
    };
  }

  /**
   * Update terminal dimensions
   */
  public setDimensions(columns: number, rows: number): void {
    this.config.columns = columns;
    this.config.rows = rows;
    this.emit('resize', { columns, rows });
  }

  /**
   * Get input stream for terminal integration
   */
  public getInputStream(): Writable {
    return this.inputStream;
  }

  /**
   * Get output stream for terminal integration
   */
  public getOutputStream(): Readable {
    return this.outputStream;
  }

  /**
   * Convert key input to terminal escape sequences
   */
  private convertKeyInput(input: WebTerminalInput): string {
    const { content, metadata = {} } = input;
    
    // Handle special keys
    switch (content) {
      case 'Enter':
        return '\n';
      case 'Tab':
        return '\t';
      case 'Backspace':
        return '\b';
      case 'Delete':
        return '\x7f';
      case 'Escape':
        return '\x1b';
      case 'ArrowUp':
        return '\x1b[A';
      case 'ArrowDown':
        return '\x1b[B';
      case 'ArrowRight':
        return '\x1b[C';
      case 'ArrowLeft':
        return '\x1b[D';
      case 'Home':
        return '\x1b[H';
      case 'End':
        return '\x1b[F';
      case 'PageUp':
        return '\x1b[5~';
      case 'PageDown':
        return '\x1b[6~';
    }

    // Handle Ctrl combinations
    if (metadata.ctrlKey) {
      const charCode = content.charCodeAt(0);
      if (charCode >= 65 && charCode <= 90) { // A-Z
        return String.fromCharCode(charCode - 64);
      }
    }

    return content;
  }

  /**
   * Convert interrupt input to control sequences
   */
  private convertInterruptInput(input: WebTerminalInput): string {
    switch (input.content) {
      case 'SIGINT':
        return '\x03'; // Ctrl+C
      case 'SIGTERM':
        return '\x04'; // Ctrl+D
      case 'SIGQUIT':
        return '\x1c'; // Ctrl+\
      case 'SIGTSTP':
        return '\x1a'; // Ctrl+Z
      default:
        return '';
    }
  }

  /**
   * Process ANSI escape sequences
   */
  private processAnsiEscape(data: string, startPos: number): {
    controlOutput?: WebTerminalOutput;
    nextPosition: number;
  } {
    const remaining = data.slice(startPos);
    
    // Color sequences
    const colorMatch = remaining.match(/^\x1b\[(\d+)m/);
    if (colorMatch) {
      this.processColorCode(parseInt(colorMatch[1]));
      return { nextPosition: startPos + colorMatch[0].length };
    }

    // RGB color sequences
    const rgbMatch = remaining.match(/^\x1b\[38;2;(\d+);(\d+);(\d+)m/);
    if (rgbMatch) {
      if (!this.currentStyles) {
        this.currentStyles = {};
      }
      this.currentStyles.color = `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`;
      return { nextPosition: startPos + rgbMatch[0].length };
    }

    // Cursor control sequences
    const cursorMatch = remaining.match(/^\x1b\[(\d+)?([ABCD])/);
    if (cursorMatch) {
      const controlOutput: WebTerminalOutput = {
        type: 'control',
        content: `cursor_${cursorMatch[2].toLowerCase()}`,
        timestamp: Date.now(),
      };
      return { 
        controlOutput,
        nextPosition: startPos + cursorMatch[0].length 
      };
    }

    // Clear sequences
    if (remaining.startsWith('\x1b[2J')) {
      const controlOutput: WebTerminalOutput = {
        type: 'control',
        content: 'clear_screen',
        timestamp: Date.now(),
      };
      return { 
        controlOutput,
        nextPosition: startPos + 4 
      };
    }

    if (remaining.startsWith('\x1b[K')) {
      const controlOutput: WebTerminalOutput = {
        type: 'control',
        content: 'clear_line',
        timestamp: Date.now(),
      };
      return { 
        controlOutput,
        nextPosition: startPos + 3 
      };
    }

    // Unknown escape sequence, skip it
    let pos = startPos + 1;
    while (pos < data.length && data[pos] !== 'm' && data[pos] !== 'H' && 
           !['A', 'B', 'C', 'D', 'J', 'K'].includes(data[pos])) {
      pos++;
    }
    return { nextPosition: pos + 1 };
  }

  /**
   * Process ANSI color codes
   */
  private processColorCode(code: number): void {
    if (!this.currentStyles) {
      this.currentStyles = {};
    }
    
    switch (code) {
      case 0: // Reset
        this.currentStyles = {};
        break;
      case 1: // Bold
        this.currentStyles.bold = true;
        break;
      case 3: // Italic
        this.currentStyles.italic = true;
        break;
      case 4: // Underline
        this.currentStyles.underline = true;
        break;
      case 30: case 31: case 32: case 33: case 34: case 35: case 36: case 37:
        // Foreground colors
        this.currentStyles.color = this.getAnsiColor(code - 30);
        break;
      case 40: case 41: case 42: case 43: case 44: case 45: case 46: case 47:
        // Background colors
        this.currentStyles.backgroundColor = this.getAnsiColor(code - 40);
        break;
    }
  }

  /**
   * Get CSS color from ANSI color code
   */
  private getAnsiColor(code: number): string {
    const colors = [
      '#000000', // Black
      '#800000', // Red
      '#008000', // Green
      '#808000', // Yellow
      '#000080', // Blue
      '#800080', // Magenta
      '#008080', // Cyan
      '#c0c0c0', // White
    ];
    return colors[code] || '#ffffff';
  }

  /**
   * Create text output with current styles
   */
  private createTextOutput(text: string): WebTerminalOutput {
    return {
      type: 'text',
      content: text,
      styles: { ...this.currentStyles },
      timestamp: Date.now(),
    };
  }

  /**
   * Add outputs to buffer with size management
   */
  private addToBuffer(outputs: WebTerminalOutput[]): void {
    this.outputBuffer.push(...outputs);
    
    // Trim buffer if it exceeds size limit
    if (this.outputBuffer.length > this.config.bufferSize) {
      const excess = this.outputBuffer.length - this.config.bufferSize;
      this.outputBuffer.splice(0, excess);
    }
  }

  /**
   * Process terminal input (for debugging/logging)
   */
  private processTerminalInput(input: string): void {
    this.emit('input', input);
  }
}
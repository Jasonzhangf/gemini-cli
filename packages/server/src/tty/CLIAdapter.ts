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
import { spawn, ChildProcess } from 'child_process';
import { TTYVirtualizer, WebTerminalInput, WebTerminalOutput } from './TTYVirtualizer';
import { TerminalContext } from './types';

/**
 * CLI Adapter integrates the existing Gemini CLI with TTY virtualization
 */
export class CLIAdapter extends EventEmitter {
  private virtualizer: TTYVirtualizer;
  private context: TerminalContext;
  private cliProcess: ChildProcess | null = null;
  private isRunning = false;

  constructor(virtualizer: TTYVirtualizer, context: TerminalContext) {
    super();
    this.virtualizer = virtualizer;
    this.context = context;
    
    this.setupVirtualizerEvents();
  }

  /**
   * Start the CLI process with TTY virtualization
   */
  public async startCLI(cliPath?: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('CLI is already running');
    }

    const geminiCliPath = cliPath || this.findGeminiCLI();
    
    try {
      // Spawn the Gemini CLI process
      this.cliProcess = spawn(geminiCliPath, [], {
        cwd: this.context.workingDirectory,
        env: {
          ...this.context.environment,
          // Force interactive mode and disable color auto-detection
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
          COLUMNS: this.virtualizer.getDimensions().columns.toString(),
          LINES: this.virtualizer.getDimensions().rows.toString(),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.isRunning = true;
      this.setupCLIProcessEvents();
      
      this.emit('started', { pid: this.cliProcess.pid });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the CLI process
   */
  public async stopCLI(): Promise<void> {
    if (!this.cliProcess || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      if (this.cliProcess) {
        this.cliProcess.once('exit', () => {
          this.isRunning = false;
          this.cliProcess = null;
          this.emit('stopped');
          resolve();
        });

        // Graceful shutdown
        this.cliProcess.kill('SIGTERM');
        
        // Force kill after timeout
        setTimeout(() => {
          if (this.cliProcess && this.isRunning) {
            this.cliProcess.kill('SIGKILL');
          }
        }, 5000);
      }
    });
  }

  /**
   * Send web input to CLI
   */
  public sendWebInput(input: WebTerminalInput): void {
    if (!this.cliProcess || !this.isRunning) {
      this.emit('error', new Error('CLI process is not running'));
      return;
    }

    try {
      const terminalInput = this.virtualizer.processWebInput(input);
      
      if (this.cliProcess.stdin) {
        this.cliProcess.stdin.write(terminalInput);
        this.emit('inputSent', { input, terminalInput });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Send raw terminal input to CLI
   */
  public sendTerminalInput(input: string): void {
    if (!this.cliProcess || !this.isRunning) {
      this.emit('error', new Error('CLI process is not running'));
      return;
    }

    try {
      if (this.cliProcess.stdin) {
        this.cliProcess.stdin.write(input);
        this.emit('rawInputSent', { input });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Resize the terminal
   */
  public resize(columns: number, rows: number): void {
    this.virtualizer.setDimensions(columns, rows);
    
    // Send resize signal to CLI process if it supports it
    if (this.cliProcess && this.isRunning) {
      try {
        // Some CLI applications listen for SIGWINCH
        this.cliProcess.kill('SIGWINCH');
      } catch (error) {
        // Ignore errors - not all processes support SIGWINCH
      }
    }
  }

  /**
   * Get current CLI status
   */
  public getStatus(): {
    isRunning: boolean;
    pid?: number;
    uptime?: number;
    workingDirectory: string;
  } {
    return {
      isRunning: this.isRunning,
      pid: this.cliProcess?.pid,
      uptime: this.isRunning ? Date.now() - (this.cliProcess?.spawnargs ? 0 : 0) : undefined,
      workingDirectory: this.context.workingDirectory,
    };
  }

  /**
   * Execute a single command and return the result
   */
  public async executeCommand(command: string, timeout = 30000): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('sh', ['-c', command], {
        cwd: this.context.workingDirectory,
        env: this.context.environment,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('exit', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      childProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout handling
      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      childProcess.on('exit', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Setup virtualizer event handlers
   */
  private setupVirtualizerEvents(): void {
    this.virtualizer.on('output', (outputs: WebTerminalOutput[]) => {
      this.emit('webOutput', outputs);
    });

    this.virtualizer.on('resize', (dimensions) => {
      this.emit('resize', dimensions);
    });
  }

  /**
   * Setup CLI process event handlers
   */
  private setupCLIProcessEvents(): void {
    if (!this.cliProcess) return;

    // Handle stdout
    this.cliProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      const webOutputs = this.virtualizer.processTerminalOutput(output);
      this.emit('terminalOutput', { raw: output, processed: webOutputs });
    });

    // Handle stderr
    this.cliProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      const webOutputs = this.virtualizer.processTerminalOutput(output);
      // Mark as error output
      const errorOutputs = webOutputs.map(o => ({ ...o, type: 'error' as const }));
      this.emit('terminalError', { raw: output, processed: errorOutputs });
    });

    // Handle process exit
    this.cliProcess.on('exit', (code, signal) => {
      this.isRunning = false;
      this.emit('exit', { code, signal });
    });

    // Handle process errors
    this.cliProcess.on('error', (error) => {
      this.isRunning = false;
      this.emit('error', error);
    });
  }

  /**
   * Find the Gemini CLI executable
   */
  private findGeminiCLI(): string {
    // Try common locations for the Gemini CLI
    const possiblePaths = [
      'gemini',
      './gemini',
      '../cli/dist/index.js',
      'node_modules/.bin/gemini',
      process.env.GEMINI_CLI_PATH,
    ].filter(Boolean);

    // For now, return the first available path
    // In a real implementation, you'd check if the file exists
    return possiblePaths[0] || 'gemini';
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.isRunning) {
      this.stopCLI();
    }
    
    this.virtualizer.removeAllListeners();
    this.removeAllListeners();
  }
}
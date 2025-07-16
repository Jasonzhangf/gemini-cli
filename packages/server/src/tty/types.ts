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

/**
 * Terminal session state
 */
export interface TerminalSession {
  id: string;
  userId?: string;
  projectPath?: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  dimensions: {
    columns: number;
    rows: number;
  };
}

/**
 * Terminal command execution context
 */
export interface TerminalContext {
  sessionId: string;
  workingDirectory: string;
  environment: Record<string, string>;
  user: {
    id?: string;
    name?: string;
    permissions: string[];
  };
}

/**
 * Terminal output formatting options
 */
export interface TerminalFormatOptions {
  preserveAnsi: boolean;
  convertToHtml: boolean;
  stripColors: boolean;
  maxLineLength?: number;
  timestampFormat?: string;
}

/**
 * Terminal input validation result
 */
export interface InputValidationResult {
  isValid: boolean;
  sanitizedInput: string;
  warnings: string[];
  errors: string[];
}

/**
 * Terminal stream events
 */
export interface TerminalStreamEvents {
  data: (data: string) => void;
  error: (error: Error) => void;
  close: (code: number, signal: string) => void;
  resize: (dimensions: { columns: number; rows: number }) => void;
}

/**
 * PTY (Pseudo Terminal) configuration
 */
export interface PTYConfig {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  encoding?: string;
  useConpty?: boolean; // Windows only
}

/**
 * Terminal capabilities detection
 */
export interface TerminalCapabilities {
  supportsColor: boolean;
  supports256Color: boolean;
  supportsTrueColor: boolean;
  supportsUnicode: boolean;
  supportsMouseEvents: boolean;
  terminalType: string;
  version?: string;
}

/**
 * Web terminal message types
 */
export type WebTerminalMessageType = 
  | 'input'
  | 'output' 
  | 'resize'
  | 'ping'
  | 'pong'
  | 'error'
  | 'close'
  | 'auth'
  | 'session_start'
  | 'session_end';

/**
 * Web terminal message structure
 */
export interface WebTerminalMessage {
  type: WebTerminalMessageType;
  sessionId?: string;
  timestamp: number;
  data?: any;
  error?: string;
}

/**
 * Terminal security policy
 */
export interface TerminalSecurityPolicy {
  allowedCommands?: string[];
  blockedCommands?: string[];
  allowFileAccess: boolean;
  allowNetworkAccess: boolean;
  allowSystemModification: boolean;
  maxSessionDuration: number; // in milliseconds
  requireAuthentication: boolean;
}

/**
 * Terminal metrics for monitoring
 */
export interface TerminalMetrics {
  sessionId: string;
  commandsExecuted: number;
  bytesTransferred: number;
  uptime: number;
  lastCommand?: string;
  lastCommandTime?: Date;
  errorCount: number;
}
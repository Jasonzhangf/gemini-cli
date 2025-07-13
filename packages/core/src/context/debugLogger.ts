/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export interface DebugTurnData {
  turnId: string;
  sessionId: string;
  timestamp: string;
  userInput?: string;
  systemContext?: any;
  staticContext?: any;
  dynamicContext?: any;
  taskContext?: any;
  modelResponse?: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result?: any;
    error?: string;
  }>;
  errors?: string[];
  metadata?: any;
}

export class DebugLogger {
  private sessionId: string;
  private debugDir: string;
  private enabled: boolean;
  private currentTurn: Partial<DebugTurnData> = {};

  constructor(sessionId: string, enabled: boolean = false) {
    this.sessionId = sessionId;
    this.enabled = enabled;
    this.debugDir = path.join(homedir(), '.gemini', 'debug', 'sessions');
  }

  async initialize() {
    if (!this.enabled) return;
    
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
    } catch (error) {
      console.warn('[DebugLogger] Failed to create debug directory:', error);
      this.enabled = false;
    }
  }

  startTurn(turnId: string, userInput?: string) {
    if (!this.enabled) {
      console.log('[DebugLogger] Not enabled, skipping startTurn');
      return;
    }
    
    console.log(`[DebugLogger] Starting turn ${turnId}...`);
    
    this.currentTurn = {
      turnId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      userInput,
      toolCalls: [],
      errors: []
    };
  }

  logSystemContext(context: any) {
    if (!this.enabled) return;
    this.currentTurn.systemContext = context;
  }

  logStaticContext(context: any) {
    if (!this.enabled) return;
    this.currentTurn.staticContext = context;
  }

  logDynamicContext(context: any) {
    if (!this.enabled) return;
    this.currentTurn.dynamicContext = context;
  }

  logTaskContext(context: any) {
    if (!this.enabled) return;
    this.currentTurn.taskContext = context;
  }

  logModelResponse(response: string) {
    if (!this.enabled) return;
    console.log(`[DebugLogger] Logging model response (${response.length} chars)`);
    this.currentTurn.modelResponse = response;
  }

  logToolCall(name: string, args: any, result?: any, error?: string) {
    if (!this.enabled) return;
    
    if (!this.currentTurn.toolCalls) {
      this.currentTurn.toolCalls = [];
    }
    
    this.currentTurn.toolCalls.push({
      name,
      args,
      result,
      error
    });
  }

  logError(error: string) {
    if (!this.enabled) return;
    
    if (!this.currentTurn.errors) {
      this.currentTurn.errors = [];
    }
    
    this.currentTurn.errors.push(error);
  }

  logMetadata(metadata: any) {
    if (!this.enabled) return;
    this.currentTurn.metadata = { ...this.currentTurn.metadata, ...metadata };
  }

  async finalizeTurn() {
    if (!this.enabled) {
      console.log('[DebugLogger] Not enabled, skipping finalize');
      return;
    }
    
    if (!this.currentTurn.turnId) {
      console.log('[DebugLogger] No current turn ID, skipping finalize');
      return;
    }

    console.log(`[DebugLogger] Finalizing turn ${this.currentTurn.turnId}...`);

    try {
      const filename = `turn-${this.currentTurn.turnId}-${this.currentTurn.timestamp?.replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(this.debugDir, this.sessionId, filename);
      
      console.log(`[DebugLogger] Writing to: ${filepath}`);
      
      // Ensure session directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      // Write the turn data
      await fs.writeFile(filepath, JSON.stringify(this.currentTurn, null, 2), 'utf-8');
      
      // Also write a human-readable markdown version
      const markdownContent = this.formatTurnAsMarkdown(this.currentTurn as DebugTurnData);
      const markdownPath = filepath.replace('.json', '.md');
      await fs.writeFile(markdownPath, markdownContent, 'utf-8');
      
      console.log(`[DebugLogger] ✅ Turn ${this.currentTurn.turnId} logged to: ${filepath}`);
      console.log(`[DebugLogger] Turn data summary:`, {
        hasUserInput: !!this.currentTurn.userInput,
        hasModelResponse: !!this.currentTurn.modelResponse,
        toolCallsCount: this.currentTurn.toolCalls?.length || 0,
        hasSystemContext: !!this.currentTurn.systemContext,
        hasTaskContext: !!this.currentTurn.taskContext
      });
      
    } catch (error) {
      console.warn('[DebugLogger] Failed to write turn data:', error);
    } finally {
      this.currentTurn = {};
    }
  }

  private formatTurnAsMarkdown(turn: DebugTurnData): string {
    const sections: string[] = [];
    
    sections.push(`# Debug Turn ${turn.turnId}`);
    sections.push(`**Session**: ${turn.sessionId}`);
    sections.push(`**Timestamp**: ${turn.timestamp}`);
    sections.push('');

    if (turn.userInput) {
      sections.push('## User Input');
      sections.push('```');
      sections.push(turn.userInput);
      sections.push('```');
      sections.push('');
    }

    if (turn.systemContext) {
      sections.push('## System Context');
      sections.push('```json');
      sections.push(JSON.stringify(turn.systemContext, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (turn.staticContext) {
      sections.push('## Static Context');
      sections.push('```json');
      sections.push(JSON.stringify(turn.staticContext, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (turn.dynamicContext) {
      sections.push('## Dynamic Context');
      sections.push('```json');
      sections.push(JSON.stringify(turn.dynamicContext, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (turn.taskContext) {
      sections.push('## Task Context');
      sections.push('```json');
      sections.push(JSON.stringify(turn.taskContext, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (turn.modelResponse) {
      sections.push('## Model Response');
      sections.push('```');
      sections.push(turn.modelResponse);
      sections.push('```');
      sections.push('');
    }

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      sections.push('## Tool Calls');
      turn.toolCalls.forEach((call, index) => {
        sections.push(`### ${index + 1}. ${call.name}`);
        sections.push('**Arguments:**');
        sections.push('```json');
        sections.push(JSON.stringify(call.args, null, 2));
        sections.push('```');
        
        if (call.result) {
          sections.push('**Result:**');
          sections.push('```json');
          sections.push(JSON.stringify(call.result, null, 2));
          sections.push('```');
        }
        
        if (call.error) {
          sections.push('**Error:**');
          sections.push('```');
          sections.push(call.error);
          sections.push('```');
        }
        sections.push('');
      });
    }

    if (turn.errors && turn.errors.length > 0) {
      sections.push('## Errors');
      turn.errors.forEach((error, index) => {
        sections.push(`${index + 1}. ${error}`);
      });
      sections.push('');
    }

    if (turn.metadata) {
      sections.push('## Metadata');
      sections.push('```json');
      sections.push(JSON.stringify(turn.metadata, null, 2));
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n');
  }

  // Static method to create and initialize a logger
  static async create(sessionId: string, enabled: boolean = false): Promise<DebugLogger> {
    const logger = new DebugLogger(sessionId, enabled);
    await logger.initialize();
    return logger;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DebugTurnData {
  turnId: string;
  sessionId: string;
  timestamp: string;
  turnNumber: number;
  userInput?: string;
  systemContext?: any;
  staticContext?: any;
  dynamicContext?: any;
  taskContext?: any;
  modelResponse?: string;
  rawModelResponse?: string; // 原始模型回复
  toolCalls?: Array<{
    name: string;
    args: any;
    result?: any;
    error?: string;
  }>;
  errors?: string[];
  metadata?: any;
  // 新增：完整的发送给模型的内容
  sentToModel?: {
    systemPrompt?: string;
    enhancedSystemPrompt?: string;
    messages?: Array<{
      role: string;
      content: string;
    }>;
    fullRequest?: any;
  };
}

export class DebugLogger {
  private sessionId: string;
  private projectDir: string;
  private sessionDir: string;
  private enabled: boolean;
  private currentTurn: Partial<DebugTurnData> = {};
  private turnCounter: number = 0;
  private finalizedTurns: Set<string> = new Set(); // Track finalized turn IDs

  constructor(sessionId: string, projectDir: string, enabled: boolean = false) {
    this.sessionId = sessionId;
    this.projectDir = projectDir;
    this.enabled = enabled;
    // 统一到项目目录下的 .gemini/debug/sessions
    this.sessionDir = path.join(projectDir, '.gemini', 'debug', 'sessions', sessionId);
  }

  async initialize() {
    if (!this.enabled) return;
    
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      console.log(`[DebugLogger] Initialized session directory: ${this.sessionDir}`);
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
    
    this.turnCounter++;
    console.log(`[DebugLogger] Starting turn ${this.turnCounter}: ${turnId}...`);
    
    this.currentTurn = {
      turnId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      turnNumber: this.turnCounter,
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

  logRawModelResponse(rawResponse: string) {
    if (!this.enabled) return;
    console.log(`[DebugLogger] Logging raw model response (${rawResponse.length} chars)`);
    this.currentTurn.rawModelResponse = rawResponse;
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

  logSentToModel(sentData: {
    systemPrompt?: string;
    enhancedSystemPrompt?: string;
    messages?: Array<{ role: string; content: string; }>;
    fullRequest?: any;
  }) {
    if (!this.enabled) return;
    this.currentTurn.sentToModel = sentData;
  }

  async finalizeTurn() {
    if (!this.enabled) {
      console.log('[DebugLogger] Not enabled, skipping finalize');
      return;
    }
    
    if (!this.currentTurn.turnId) {
      console.log('[DebugLogger] No current turn ID, skipping finalize');
      console.log('[DebugLogger] Current turn keys:', Object.keys(this.currentTurn));
      console.log('[DebugLogger] Session ID:', this.sessionId);
      return;
    }

    // Check if this turn has already been finalized
    if (this.finalizedTurns.has(this.currentTurn.turnId)) {
      console.log(`[DebugLogger] Turn ${this.currentTurn.turnId} already finalized, skipping`);
      return;
    }

    console.log(`[DebugLogger] Finalizing turn ${this.turnCounter}: ${this.currentTurn.turnId}...`);

    try {
      // 使用轮次编号和时间戳的文件命名：turn-001-turnId-timestamp.json
      const turnNumber = String(this.turnCounter).padStart(3, '0');
      const timestamp = this.currentTurn.timestamp?.replace(/[:.]/g, '-') || '';
      const filename = `turn-${turnNumber}-${this.currentTurn.turnId}-${timestamp}.json`;
      const filepath = path.join(this.sessionDir, filename);
      
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
      
      // Mark this turn as finalized
      this.finalizedTurns.add(this.currentTurn.turnId);
      
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
      
      // Check if it's the new structured dynamic context
      if (turn.dynamicContext.recentOperations || turn.dynamicContext.runtimeInfo || turn.dynamicContext.userInstructions) {
        if (turn.dynamicContext.recentOperations && Array.isArray(turn.dynamicContext.recentOperations)) {
          sections.push('### Recent Operations');
          sections.push('```');
          sections.push(turn.dynamicContext.recentOperations.join('\n'));
          sections.push('```');
          sections.push('');
        }

        if (turn.dynamicContext.runtimeInfo && Array.isArray(turn.dynamicContext.runtimeInfo)) {
          sections.push('### Runtime Info');
          sections.push('```');
          sections.push(turn.dynamicContext.runtimeInfo.join('\n'));
          sections.push('```');
          sections.push('');
        }

        if (turn.dynamicContext.userInstructions && Array.isArray(turn.dynamicContext.userInstructions)) {
          sections.push('### User Instructions');
          sections.push('```');
          sections.push(turn.dynamicContext.userInstructions.join('\n'));
          sections.push('```');
          sections.push('');
        }

        if (turn.dynamicContext.errorHistory && Array.isArray(turn.dynamicContext.errorHistory) && turn.dynamicContext.errorHistory.length > 0) {
          sections.push('### Error History');
          sections.push('```');
          sections.push(turn.dynamicContext.errorHistory.join('\n'));
          sections.push('```');
          sections.push('');
        }
      } else {
        // Fallback to JSON for other formats
        sections.push('```json');
        sections.push(JSON.stringify(turn.dynamicContext, null, 2));
        sections.push('```');
        sections.push('');
      }
    }

    if (turn.taskContext) {
      sections.push('## Task Context');
      sections.push('```json');
      sections.push(JSON.stringify(turn.taskContext, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (turn.sentToModel) {
      sections.push('## Sent to Model (Complete Request)');
      sections.push('### System Prompt');
      if (turn.sentToModel.systemPrompt) {
        sections.push('```');
        sections.push(turn.sentToModel.systemPrompt);
        sections.push('```');
      } else {
        sections.push('*No system prompt*');
      }
      sections.push('');
      
      sections.push('### Messages');
      if (turn.sentToModel.messages && turn.sentToModel.messages.length > 0) {
        turn.sentToModel.messages.forEach((msg, index) => {
          sections.push(`#### Message ${index + 1} (${msg.role})`);
          sections.push('```');
          sections.push(msg.content);
          sections.push('```');
          sections.push('');
        });
      } else {
        sections.push('*No messages*');
        sections.push('');
      }
      
      sections.push('### Request Config');
      sections.push('```json');
      sections.push(JSON.stringify(turn.sentToModel.fullRequest || {}, null, 2));
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
  static async create(sessionId: string, projectDir: string, enabled: boolean = false): Promise<DebugLogger> {
    const logger = new DebugLogger(sessionId, projectDir, enabled);
    await logger.initialize();
    return logger;
  }
}
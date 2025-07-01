/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';

interface ThoughtData {
  thought: string;
  nextThoughtNeeded: boolean;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

/**
 * Parameters for sequential thinking
 */
export interface SequentialThinkingParams {
  thought: string;
  nextThoughtNeeded: boolean;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

/**
 * Sequential Thinking tool for dynamic and reflective problem-solving
 */
export class SequentialThinkingTool extends BaseTool<SequentialThinkingParams, ToolResult> {
  static readonly Name: string = 'sequentialthinking';
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableLogging: boolean;

  constructor(private readonly config: Config) {
    super(
      SequentialThinkingTool.Name,
      'SequentialThinking',
      'A detailed tool for dynamic and reflective problem-solving through structured thought sequences. Supports revision, branching, and hypothesis generation.',
      {
        type: 'object',
        properties: {
          thought: {
            type: 'string',
            description: 'Your current thinking step'
          },
          nextThoughtNeeded: {
            type: 'boolean',
            description: 'Whether another thought step is needed'
          },
          thoughtNumber: {
            type: 'integer',
            description: 'Current thought number',
            minimum: 1
          },
          totalThoughts: {
            type: 'integer',
            description: 'Estimated total thoughts needed',
            minimum: 1
          },
          isRevision: {
            type: 'boolean',
            description: 'Whether this revises previous thinking'
          },
          revisesThought: {
            type: 'integer',
            description: 'Which thought is being reconsidered',
            minimum: 1
          },
          branchFromThought: {
            type: 'integer',
            description: 'Branching point thought number',
            minimum: 1
          },
          branchId: {
            type: 'string',
            description: 'Branch identifier'
          },
          needsMoreThoughts: {
            type: 'boolean',
            description: 'If more thoughts are needed'
          }
        },
        required: ['thought', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts']
      }
    );

    this.disableLogging = process.env.DISABLE_THOUGHT_LOGGING === 'true';
  }

  validateParams(params: SequentialThinkingParams): string | null {
    // Skip SchemaValidator as it's too strict about integer vs number types
    // Do manual validation instead
    
    if (!params.thought || typeof params.thought !== 'string') {
      return 'thought must be a non-empty string';
    }

    if (typeof params.nextThoughtNeeded !== 'boolean') {
      return 'nextThoughtNeeded must be a boolean';
    }

    if (typeof params.thoughtNumber !== 'number' || !Number.isInteger(params.thoughtNumber) || params.thoughtNumber < 1) {
      return 'thoughtNumber must be a positive integer';
    }

    if (typeof params.totalThoughts !== 'number' || !Number.isInteger(params.totalThoughts) || params.totalThoughts < 1) {
      return 'totalThoughts must be a positive integer';
    }

    if (params.thoughtNumber > params.totalThoughts) {
      return 'thoughtNumber cannot exceed totalThoughts';
    }

    if (params.isRevision && (!params.revisesThought || params.revisesThought < 1)) {
      return 'When isRevision is true, revisesThought must be specified';
    }

    if (params.branchFromThought && (!params.branchId || params.branchId.trim() === '')) {
      return 'When branchFromThought is specified, branchId must be provided';
    }

    return null;
  }

  getDescription(params: SequentialThinkingParams): string {
    let desc = `Thought ${params.thoughtNumber}/${params.totalThoughts}`;
    
    if (params.isRevision) {
      desc += ` (revision of thought ${params.revisesThought})`;
    }
    
    if (params.branchId) {
      desc += ` (branch: ${params.branchId})`;
    }

    return desc;
  }

  private logThought(thoughtData: ThoughtData): void {
    if (this.disableLogging) {
      return;
    }

    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m'
    };

    console.log('\n' + colors.blue + '═'.repeat(80) + colors.reset);
    
    let header = `${colors.bright}💭 Thought ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}${colors.reset}`;
    
    if (thoughtData.isRevision) {
      header += ` ${colors.yellow}(REVISION of thought ${thoughtData.revisesThought})${colors.reset}`;
    }
    
    if (thoughtData.branchId) {
      header += ` ${colors.magenta}(Branch: ${thoughtData.branchId})${colors.reset}`;
    }
    
    console.log(header);
    console.log(colors.blue + '─'.repeat(80) + colors.reset);
    
    // Word wrap the thought content
    const words = thoughtData.thought.split(' ');
    let line = '';
    const maxWidth = 76;
    
    for (const word of words) {
      if (line.length + word.length + 1 > maxWidth) {
        console.log(`${colors.cyan}│${colors.reset} ${line}`);
        line = word;
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    
    if (line) {
      console.log(`${colors.cyan}│${colors.reset} ${line}`);
    }
    
    console.log(colors.blue + '─'.repeat(80) + colors.reset);
    
    const status = thoughtData.nextThoughtNeeded ? 
      `${colors.yellow}⏳ More thoughts needed${colors.reset}` : 
      `${colors.green}✅ Thinking complete${colors.reset}`;
    
    console.log(`${colors.cyan}│${colors.reset} ${status}`);
    console.log(colors.blue + '═'.repeat(80) + colors.reset + '\n');
  }

  private validateThoughtSequence(params: SequentialThinkingParams): string | null {
    // Check if this is a valid continuation
    if (params.thoughtNumber > 1 && this.thoughtHistory.length === 0) {
      return 'Cannot start with thought number > 1 when no previous thoughts exist';
    }

    // Check for branching logic
    if (params.branchFromThought) {
      const branchPoint = this.thoughtHistory.find(t => t.thoughtNumber === params.branchFromThought);
      if (!branchPoint) {
        return `Cannot branch from non-existent thought ${params.branchFromThought}`;
      }
    }

    // Check revision logic
    if (params.isRevision && params.revisesThought) {
      const revisedThought = this.thoughtHistory.find(t => t.thoughtNumber === params.revisesThought);
      if (!revisedThought) {
        return `Cannot revise non-existent thought ${params.revisesThought}`;
      }
    }

    return null;
  }

  async execute(params: SequentialThinkingParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError
      };
    }

    const sequenceError = this.validateThoughtSequence(params);
    if (sequenceError) {
      return {
        llmContent: `Error: Invalid thought sequence. Reason: ${sequenceError}`,
        returnDisplay: sequenceError
      };
    }

    try {
      const thoughtData: ThoughtData = {
        thought: params.thought,
        nextThoughtNeeded: params.nextThoughtNeeded,
        thoughtNumber: params.thoughtNumber,
        totalThoughts: params.totalThoughts,
        isRevision: params.isRevision,
        revisesThought: params.revisesThought,
        branchFromThought: params.branchFromThought,
        branchId: params.branchId,
        needsMoreThoughts: params.needsMoreThoughts
      };

      // Add to thought history
      this.thoughtHistory.push(thoughtData);

      // Handle branching
      if (params.branchId) {
        if (!this.branches[params.branchId]) {
          this.branches[params.branchId] = [];
        }
        this.branches[params.branchId].push(thoughtData);
      }

      // Log the thought with formatting
      this.logThought(thoughtData);

      // Prepare response
      const response = {
        thoughtNumber: params.thoughtNumber,
        totalThoughts: params.totalThoughts,
        nextThoughtNeeded: params.nextThoughtNeeded,
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length
      };

      const responseText = JSON.stringify(response, null, 2);

      return {
        llmContent: `Sequential thinking step completed:\n${responseText}\n\nThought: ${params.thought}`,
        returnDisplay: `Thought ${params.thoughtNumber}/${params.totalThoughts} recorded${params.branchId ? ` (branch: ${params.branchId})` : ''}${params.isRevision ? ' (revision)' : ''}`
      };

    } catch (error) {
      const errorMessage = `Sequential thinking failed: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: errorMessage
      };
    }
  }

  // Additional methods for managing thought state
  public getThoughtHistory(): ThoughtData[] {
    return [...this.thoughtHistory];
  }

  public getBranches(): Record<string, ThoughtData[]> {
    return { ...this.branches };
  }

  public resetThoughts(): void {
    this.thoughtHistory = [];
    this.branches = {};
  }

  public getThoughtByNumber(thoughtNumber: number): ThoughtData | undefined {
    return this.thoughtHistory.find(t => t.thoughtNumber === thoughtNumber);
  }

  public getBranchThoughts(branchId: string): ThoughtData[] {
    return this.branches[branchId] || [];
  }
}
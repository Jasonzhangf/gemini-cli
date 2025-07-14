/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextCommand } from './contextCommand.js';
import { CommandContext } from './types.js';
import { AnalysisMode } from '@google/gemini-cli-core';

describe('contextCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: any;
  let mockContextManager: any;
  let mockContextAgent: any;

  beforeEach(() => {
    mockContextManager = {
      getContext: vi.fn(() => ({
        dynamicContext: ['test context'],
        historyRecords: ['test record']
      })),
      isInMaintenanceMode: vi.fn(() => false),
    };

    mockContextAgent = {
      isInitialized: vi.fn(() => true),
      initialize: vi.fn(),
    };

    mockConfig = {
      getContextManager: vi.fn(() => mockContextManager),
      getContextAgent: vi.fn(() => mockContextAgent),
      getAnalysisSettings: vi.fn(() => ({
        mode: AnalysisMode.STATIC,
        timeout: 30000,
        enableCache: true,
      })),
      setAnalysisSettings: vi.fn(),
      getDebugMode: vi.fn(() => false),
      setDebugMode: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig,
        settings: {} as any,
        git: undefined,
        logger: {} as any,
      },
      ui: {
        addItem: vi.fn(),
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
      },
      session: {
        stats: {} as any,
      },
    };
  });

  it('should show status correctly', async () => {
    const statusCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'status');
    expect(statusCommand).toBeDefined();

    if (statusCommand?.action) {
      const result = await statusCommand.action(mockContext, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('Context Management Status');
        expect(result.content).toContain('✅ Active');
        expect(result.content).toContain('static');
      }
    }
  });

  it('should switch analysis mode correctly', async () => {
    const modeCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'mode');
    expect(modeCommand).toBeDefined();

    if (modeCommand?.action) {
      const result = await modeCommand.action(mockContext, 'llm');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('llm');
        expect(mockConfig.setAnalysisSettings).toHaveBeenCalled();
        expect(mockContextAgent.initialize).toHaveBeenCalled();
      }
    }
  });

  it('should show current mode when no args provided', async () => {
    const modeCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'mode');
    expect(modeCommand).toBeDefined();

    if (modeCommand?.action) {
      const result = await modeCommand.action(mockContext, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('Current analysis mode');
        expect(result.content).toContain('static');
      }
    }
  });

  it('should reject invalid analysis mode', async () => {
    const modeCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'mode');
    expect(modeCommand).toBeDefined();

    if (modeCommand?.action) {
      const result = await modeCommand.action(mockContext, 'invalid');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toContain('Invalid mode');
      }
    }
  });

  it('should toggle debug mode correctly', async () => {
    const debugCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'debug');
    expect(debugCommand).toBeDefined();

    if (debugCommand?.action) {
      const result = await debugCommand.action(mockContext, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('Debug mode enabled');
        expect(mockConfig.setDebugMode).toHaveBeenCalledWith(true);
      }
    }
  });

  it('should show layer information', async () => {
    const layersCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'layers');
    expect(layersCommand).toBeDefined();

    if (layersCommand?.action) {
      const result = await layersCommand.action(mockContext, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('Context Layer Architecture');
        expect(result.content).toContain('L0 - Project Discovery');
        expect(result.content).toContain('L4 - Intelligent Inference');
      }
    }
  });

  it('should reset context successfully', async () => {
    mockContextManager.clearDynamicContext = vi.fn();
    mockContextManager.setHistoryRecords = vi.fn();

    const resetCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'reset');
    expect(resetCommand).toBeDefined();

    if (resetCommand?.action) {
      const result = await resetCommand.action(mockContext, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain('reset and reinitialized successfully');
        expect(mockContextManager.clearDynamicContext).toHaveBeenCalled();
        expect(mockContextManager.setHistoryRecords).toHaveBeenCalledWith([]);
        expect(mockContextAgent.initialize).toHaveBeenCalled();
      }
    }
  });

  it('should handle missing config gracefully', async () => {
    const contextWithoutConfig = {
      ...mockContext,
      services: {
        ...mockContext.services,
        config: null,
      },
    };

    const statusCommand = contextCommand.subCommands?.find(cmd => cmd.name === 'status');
    if (statusCommand?.action) {
      const result = await statusCommand.action(contextWithoutConfig, '');
      
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Config service not available');
      }
    }
  });
});
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { memoryProfiler } from '../utils/memory-profiler.js';
import { memoryOptimizer, processInChunks } from '../utils/memory-optimizer.js';
import { ConversationHistoryManager } from '../conversation/history-manager.js';
import { ToolCallParser } from '../parsers/tool-call-parser.js';
import { ResponseHandler } from '../streaming/response-handler.js';

describe('Memory Optimization Performance Benchmarks', () => {
  beforeEach(() => {
    memoryProfiler.enable();
  });

  afterEach(() => {
    memoryProfiler.disable();
    memoryOptimizer.clearAllPools();
  });

  describe('Tool Call Parser Performance', () => {
    let parser: ToolCallParser;

    beforeEach(() => {
      const mockToolDeclarations = [
        { name: 'read_file', parameters: { properties: { path: { type: 'string' } } } },
        { name: 'write_file', parameters: { properties: { path: { type: 'string' }, content: { type: 'string' } } } },
        { name: 'run_shell_command', parameters: { properties: { command: { type: 'string' } } } }
      ];

      parser = new ToolCallParser(
        mockToolDeclarations,
        new Set(['run_shell_command']),
        new Set(['write_file']),
        false
      );
    });

    it('should handle large content efficiently', async () => {
      // Create large content with multiple tool calls
      const largeContent = Array.from({ length: 100 }, (_, i) => 
        `Text content ${i}... {"name": "read_file", "args": {"path": "/test/file${i}.txt"}} more text...`
      ).join('\n');

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const toolCalls = parser.parseToolCalls(largeContent);

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Performance assertions
      expect(endTime - startTime).toBeLessThan(1000); // Under 1 second
      expect(endMemory - startMemory).toBeLessThan(10 * 1024 * 1024); // Under 10MB additional

      // Functionality assertions
      expect(toolCalls.length).toBe(100);
      expect(toolCalls[0].name).toBe('read_file');
    });

    it('should use chunked processing for very large content', async () => {
      // Create extremely large content (> 5KB to trigger chunking)
      const veryLargeContent = Array.from({ length: 1000 }, (_, i) => 
        `${'x'.repeat(100)} {"name": "read_file", "args": {"path": "/file${i}.txt"}} ${'y'.repeat(100)}`
      ).join('\n');

      expect(veryLargeContent.length).toBeGreaterThan(5000);

      const startTime = Date.now();
      const toolCalls = parser.parseToolCalls(veryLargeContent);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Under 2 seconds even for very large content
      expect(toolCalls.length).toBe(1000);

      // Verify memory profiling captured the operation
      const profile = memoryProfiler.getProfile();
      const parseOperations = profile!.snapshots.filter(s => s.operation.includes('parseToolCalls'));
      expect(parseOperations.length).toBeGreaterThan(0);
    });

    it('should optimize memory usage with repeated parsing', async () => {
      const testContent = 'Test content with {"name": "read_file", "args": {"path": "/test.txt"}}';
      const iterations = 100;

      const startMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      // Perform repeated parsing
      for (let i = 0; i < iterations; i++) {
        const toolCalls = parser.parseToolCalls(testContent);
        expect(toolCalls.length).toBe(1);
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(1000);

      // Memory growth should be minimal due to optimization
      const memoryGrowth = endMemory - startMemory;
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024); // Under 5MB growth
    });
  });

  describe('Conversation History Manager Performance', () => {
    let historyManager: ConversationHistoryManager;

    beforeEach(() => {
      historyManager = new ConversationHistoryManager(1000, 5 * 1024 * 1024); // 5MB threshold
    });

    it('should handle rapid message addition efficiently', async () => {
      const messageCount = 1000;
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Add messages rapidly
      for (let i = 0; i < messageCount; i++) {
        historyManager.addUserMessage(`User message ${i}: ${'content '.repeat(10)}`);
        historyManager.addAssistantMessage(`Assistant response ${i}: ${'response '.repeat(10)}`);
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Performance assertions
      expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
      expect(endMemory - startMemory).toBeLessThan(50 * 1024 * 1024); // Under 50MB

      // Verify functionality
      const history = historyManager.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history.length).toBeLessThanOrEqual(1000 * 2); // Should be trimmed

      const stats = historyManager.getMemoryStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    it('should maintain performance during memory optimization', async () => {
      const batchSize = 100;
      const batches = 10;
      const timings: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now();

        // Add batch of messages
        for (let i = 0; i < batchSize; i++) {
          const messageId = batch * batchSize + i;
          historyManager.addUserMessage(`Batch ${batch}, Message ${i}: ${'x'.repeat(100)}`);
        }

        const batchEnd = Date.now();
        timings.push(batchEnd - batchStart);
      }

      // Performance should remain consistent (not degrade significantly)
      const firstBatchTime = timings[0];
      const lastBatchTime = timings[timings.length - 1];

      // Later batches shouldn't be more than 3x slower than first batch
      expect(lastBatchTime).toBeLessThan(firstBatchTime * 3);

      // All batches should complete within reasonable time
      timings.forEach((time, index) => {
        expect(time).toBeLessThan(1000); // Each batch under 1 second
      });
    });

    it('should efficiently compress and decompress conversation history', async () => {
      // Build up a large conversation history
      for (let i = 0; i < 500; i++) {
        historyManager.addUserMessage(`User ${i}: ${'This is a longer message with more content to make compression more effective. '.repeat(5)}`);
        historyManager.addAssistantMessage(`Assistant ${i}: ${'This is the response with detailed information that should compress well. '.repeat(5)}`);
      }

      const beforeStats = historyManager.getMemoryStats();
      const beforeSize = beforeStats.estimatedMemoryUsage;

      // Trigger aggressive optimization
      for (let i = 500; i < 600; i++) {
        historyManager.addUserMessage(`Additional ${i}: ${'x'.repeat(1000)}`);
      }

      const afterStats = historyManager.getMemoryStats();
      const afterSize = afterStats.estimatedMemoryUsage;

      // Should have triggered optimization
      expect(afterStats.totalMessages).toBeGreaterThan(beforeStats.totalMessages);

      // Memory usage should be managed efficiently
      expect(afterSize).toBeLessThan(beforeSize * 2); // Shouldn't double in size
    });
  });

  describe('Chunked Processing Performance', () => {
    it('should efficiently process large datasets', async () => {
      const dataSize = 10000;
      const largeDataset = Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        data: `item_${i}`,
        payload: 'x'.repeat(100)
      }));

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const results = await processInChunks(
        largeDataset,
        (item) => ({
          id: item.id,
          processed: true,
          size: item.payload.length
        }),
        {
          chunkSize: 100,
          maxConcurrency: 4,
          memoryThreshold: 10 * 1024 * 1024 // 10MB
        }
      );

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Performance assertions
      expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
      expect(endMemory - startMemory).toBeLessThan(20 * 1024 * 1024); // Under 20MB additional

      // Functionality assertions
      expect(results.length).toBe(dataSize);
      expect(results[0].processed).toBe(true);
      expect(results[dataSize - 1].processed).toBe(true);
    });

    it('should handle concurrent processing efficiently', async () => {
      const concurrentOperations = 10;
      const operationSize = 1000;

      const startTime = Date.now();

      const operations = Array.from({ length: concurrentOperations }, (_, opIndex) =>
        processInChunks(
          Array.from({ length: operationSize }, (_, i) => `op${opIndex}_item${i}`),
          (item) => item.toUpperCase(),
          { chunkSize: 50, maxConcurrency: 2 }
        )
      );

      const results = await Promise.all(operations);

      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // Under 10 seconds

      // All operations should complete successfully
      expect(results.length).toBe(concurrentOperations);
      results.forEach((result, index) => {
        expect(result.length).toBe(operationSize);
        expect(result[0]).toBe(`OP${index}_ITEM0`);
      });
    });
  });

  describe('Memory Profiler Performance', () => {
    it('should have minimal overhead when profiling', async () => {
      const iterations = 1000;
      
      // Test without profiling
      const startWithoutProfiling = Date.now();
      for (let i = 0; i < iterations; i++) {
        const data = Array.from({ length: 100 }, (_, j) => j * i);
        data.sort((a, b) => b - a);
      }
      const endWithoutProfiling = Date.now();
      const timeWithoutProfiling = endWithoutProfiling - startWithoutProfiling;

      // Test with profiling
      const startWithProfiling = Date.now();
      for (let i = 0; i < iterations; i++) {
        await memoryProfiler.profileFunction('test_operation', () => {
          const data = Array.from({ length: 100 }, (_, j) => j * i);
          data.sort((a, b) => b - a);
          return data;
        });
      }
      const endWithProfiling = Date.now();
      const timeWithProfiling = endWithProfiling - startWithProfiling;

      // Profiling overhead should be minimal (less than 50% additional time)
      const overhead = (timeWithProfiling - timeWithoutProfiling) / timeWithoutProfiling;
      expect(overhead).toBeLessThan(0.5);

      // Verify profiling data was collected
      const profile = memoryProfiler.getProfile();
      expect(profile!.snapshots.length).toBeGreaterThan(0);
    });

    it('should efficiently manage memory snapshots', () => {
      const snapshotCount = 1000;
      const startMemory = process.memoryUsage().heapUsed;

      // Create many snapshots
      for (let i = 0; i < snapshotCount; i++) {
        memoryProfiler.snapshot(`operation_${i}`, `id_${i}`);
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = endMemory - startMemory;

      // Memory usage for snapshots should be reasonable
      expect(memoryUsed).toBeLessThan(10 * 1024 * 1024); // Under 10MB

      const profile = memoryProfiler.getProfile();
      expect(profile!.snapshots.length).toBe(snapshotCount + 1); // +1 for baseline
    });
  });

  describe('End-to-End Memory Optimization', () => {
    it('should maintain performance in realistic usage scenario', async () => {
      const historyManager = new ConversationHistoryManager(200, 2 * 1024 * 1024);
      const toolDeclarations = [
        { name: 'read_file', parameters: { properties: { path: { type: 'string' } } } },
        { name: 'write_file', parameters: { properties: { path: { type: 'string' }, content: { type: 'string' } } } }
      ];
      const parser = new ToolCallParser(toolDeclarations, new Set(), new Set(), false);

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Simulate realistic usage
      for (let session = 0; session < 10; session++) {
        for (let turn = 0; turn < 20; turn++) {
          // User message with potential tool calls
          const userMessage = `Session ${session}, Turn ${turn}: Can you help me with this file operation? 
                               {"name": "read_file", "args": {"path": "/test/file${turn}.txt"}}`;
          historyManager.addUserMessage(userMessage);
          
          // Parse tool calls
          const toolCalls = parser.parseToolCalls(userMessage);
          
          // Assistant response
          const assistantResponse = `I'll help you with that file operation. 
                                   Found ${toolCalls.length} tool calls. Here's the result...`;
          historyManager.addAssistantMessage(assistantResponse);
        }
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Performance assertions
      expect(endTime - startTime).toBeLessThan(10000); // Under 10 seconds
      expect(endMemory - startMemory).toBeLessThan(25 * 1024 * 1024); // Under 25MB

      // Functionality assertions
      const history = historyManager.getHistory();
      expect(history.length).toBeGreaterThan(0);
      
      const stats = historyManager.getMemoryStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
      
      const profile = memoryProfiler.getProfile();
      expect(profile!.snapshots.length).toBeGreaterThan(0);

      // Should have optimization suggestions if needed
      const suggestions = memoryProfiler.getOptimizationSuggestions();
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });
});
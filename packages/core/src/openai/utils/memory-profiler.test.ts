/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryProfiler, memoryProfiler } from './memory-profiler.js';

describe('MemoryProfiler', () => {
  let profiler: MemoryProfiler;

  beforeEach(() => {
    profiler = new MemoryProfiler({ enabled: false, debugMode: false });
  });

  afterEach(() => {
    profiler.disable();
  });

  describe('basic functionality', () => {
    it('should create memory snapshots', () => {
      profiler.enable();
      const snapshot = profiler.snapshot('test_operation', 'test_id');
      
      expect(snapshot).toBeDefined();
      expect(snapshot!.operation).toBe('test_operation');
      expect(snapshot!.operationId).toBe('test_id');
      expect(snapshot!.heapUsed).toBeGreaterThan(0);
      expect(snapshot!.timestamp).toBeGreaterThan(0);
    });

    it('should not create snapshots when disabled', () => {
      const snapshot = profiler.snapshot('test_operation', 'test_id');
      expect(snapshot).toBeNull();
    });

    it('should track operation lifecycle', () => {
      profiler.enable();
      profiler.startOperation('op1', 'test_start');
      
      // Simulate some work
      const largeArray = new Array(1000).fill('test');
      
      const endSnapshot = profiler.endOperation('op1', 'test_end');
      expect(endSnapshot).toBeDefined();
      expect(endSnapshot!.operation).toBe('end_test_end');
    });
  });

  describe('memory profiling', () => {
    it('should profile function execution', async () => {
      profiler.enable();
      let executionCount = 0;
      
      const result = await profiler.profileFunction(
        'test_function',
        async () => {
          executionCount++;
          // Simulate memory-intensive operation
          const data = new Array(1000).fill('test');
          return data.length;
        }
      );

      expect(result).toBe(1000);
      expect(executionCount).toBe(1);
    });

    it('should handle errors in profiled functions', async () => {
      profiler.enable();
      
      await expect(
        profiler.profileFunction('error_function', () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should detect memory threshold violations', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Create profiler with low threshold
      const testProfiler = new MemoryProfiler({ 
        enabled: true, 
        threshold: 1, // 1 byte threshold
        debugMode: false 
      });
      
      testProfiler.enable();
      testProfiler.snapshot('test_violation', 'test_id');
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory threshold exceeded!')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('memory analysis', () => {
    it('should generate optimization suggestions', () => {
      profiler.enable();
      
      // Create multiple snapshots to build profile
      for (let i = 0; i < 10; i++) {
        profiler.snapshot(`operation_${i}`, `id_${i}`);
      }
      
      const suggestions = profiler.getOptimizationSuggestions();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should detect concerning memory usage patterns', () => {
      const testProfiler = new MemoryProfiler({ 
        enabled: true, 
        threshold: 1, // Low threshold
        debugMode: false 
      });
      
      testProfiler.enable();
      
      // Create snapshots that would exceed threshold
      for (let i = 0; i < 5; i++) {
        testProfiler.snapshot(`operation_${i}`, `id_${i}`);
      }
      
      expect(testProfiler.isMemoryUsageConcerning()).toBe(true);
    });

    it('should provide memory profile summary', () => {
      profiler.enable();
      
      // Create some snapshots
      profiler.snapshot('baseline', 'baseline_id');
      profiler.snapshot('operation1', 'op1_id');
      profiler.snapshot('operation2', 'op2_id');
      
      const profile = profiler.getProfile();
      
      expect(profile).toBeDefined();
      expect(profile!.baseline).toBeDefined();
      expect(profile!.snapshots).toHaveLength(3); // All snapshots including baseline
      expect(profile!.peakMemory).toBeDefined();
      expect(profile!.averageMemory).toBeGreaterThan(0);
    });
  });

  describe('memory management', () => {
    it('should clear profiling data', () => {
      profiler.enable();
      
      profiler.snapshot('test1', 'id1');
      profiler.snapshot('test2', 'id2');
      
      let profile = profiler.getProfile();
      expect(profile?.snapshots).toHaveLength(2); // 2 snapshots
      
      profiler.clear();
      
      profile = profiler.getProfile();
      expect(profile).toBeNull(); // Profile should be null after clear
    });

    it('should handle concurrent operations', async () => {
      profiler.enable();
      
      const operations = Array.from({ length: 10 }, (_, i) => 
        profiler.profileFunction(`concurrent_op_${i}`, async () => {
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, 10));
          return i;
        })
      );
      
      const results = await Promise.all(operations);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('singleton instance', () => {
    it('should use global memory profiler instance', () => {
      const instance1 = memoryProfiler;
      const instance2 = memoryProfiler;
      
      expect(instance1).toBe(instance2);
    });
  });
});

describe('Memory Profiler Integration', () => {
  afterEach(() => {
    memoryProfiler.disable();
  });

  it('should profile real memory-intensive operations', async () => {
    memoryProfiler.enable();
    
    const result = await memoryProfiler.profileFunction(
      'memory_intensive_test',
      () => {
        // Create large objects
        const largeData = {
          arrays: Array.from({ length: 1000 }, (_, i) => 
            new Array(100).fill(`item_${i}`)
          ),
          objects: Array.from({ length: 500 }, (_, i) => ({
            id: i,
            data: `data_${i}`.repeat(100),
            metadata: { created: Date.now(), index: i }
          }))
        };
        
        // Simulate processing
        return largeData.arrays.length + largeData.objects.length;
      }
    );
    
    expect(result).toBe(1500);
    
    const profile = memoryProfiler.getProfile();
    expect(profile).toBeDefined();
    expect(profile!.snapshots.length).toBeGreaterThan(0);
  });

  it('should handle memory optimization under load', async () => {
    memoryProfiler.enable();
    
    // Simulate multiple concurrent memory-intensive operations
    const operations = Array.from({ length: 5 }, (_, i) =>
      memoryProfiler.profileFunction(`load_test_${i}`, async () => {
        // Create different types of memory pressure
        if (i % 2 === 0) {
          // String operations
          let result = '';
          for (let j = 0; j < 1000; j++) {
            result += `string_${j}_`;
          }
          return result.length;
        } else {
          // Array operations
          const arrays = Array.from({ length: 100 }, () => 
            new Array(50).fill(Math.random())
          );
          return arrays.flat().length;
        }
      })
    );
    
    const results = await Promise.all(operations);
    expect(results).toHaveLength(5);
    
    const suggestions = memoryProfiler.getOptimizationSuggestions();
    expect(Array.isArray(suggestions)).toBe(true);
  });
});
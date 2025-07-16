/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  MemoryOptimizer, 
  ObjectPool, 
  memoryOptimizer, 
  processInChunks, 
  withStringPool, 
  createStreamingJSONParser 
} from './memory-optimizer.js';

describe('ObjectPool', () => {
  let pool: ObjectPool<string[]>;

  beforeEach(() => {
    pool = new ObjectPool<string[]>({
      maxSize: 3,
      factory: () => [],
      reset: (arr) => arr.length = 0
    });
  });

  it('should create objects when pool is empty', () => {
    const obj = pool.get();
    expect(obj).toEqual([]);
    expect(pool.getStats().poolSize).toBe(0);
  });

  it('should reuse objects from pool', () => {
    const obj1 = pool.get();
    obj1.push('test');
    pool.release(obj1);
    
    const obj2 = pool.get();
    expect(obj2).toEqual([]); // Should be reset
    expect(obj2).toBe(obj1); // Should be the same object
  });

  it('should respect max pool size', () => {
    const objects = [pool.get(), pool.get(), pool.get(), pool.get()];
    objects.forEach(obj => pool.release(obj));
    
    expect(pool.getStats().poolSize).toBe(3); // Max size
  });

  it('should clear pool', () => {
    pool.release(pool.get());
    expect(pool.getStats().poolSize).toBe(1);
    
    pool.clear();
    expect(pool.getStats().poolSize).toBe(0);
  });

  it('should track utilization rate', () => {
    const obj1 = pool.get();
    const obj2 = pool.get();
    
    pool.release(obj1);
    const stats = pool.getStats();
    
    expect(stats.utilizationRate).toBe(2/3); // 2 objects in use out of 3 max
  });
});

describe('MemoryOptimizer', () => {
  let optimizer: MemoryOptimizer;

  beforeEach(() => {
    optimizer = MemoryOptimizer.getInstance();
  });

  afterEach(() => {
    optimizer.clearAllPools();
  });

  describe('chunked processing', () => {
    it('should process arrays in chunks', async () => {
      const inputArray = Array.from({ length: 100 }, (_, i) => i);
      const results: number[] = [];
      
      const processedResults = await optimizer.processArrayInChunks(
        inputArray,
        (item) => {
          results.push(item);
          return item * 2;
        },
        { chunkSize: 10 }
      );
      
      expect(processedResults).toHaveLength(100);
      expect(processedResults[0]).toBe(0);
      expect(processedResults[99]).toBe(198);
      expect(results).toHaveLength(100);
      expect(results).toContain(0);
      expect(results).toContain(99);
    });

    it('should handle async processing', async () => {
      const inputArray = Array.from({ length: 20 }, (_, i) => i);
      
      const results = await optimizer.processArrayInChunks(
        inputArray,
        async (item) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return item * 3;
        },
        { chunkSize: 5, maxConcurrency: 2 }
      );
      
      expect(results).toHaveLength(20);
      expect(results[0]).toBe(0);
      expect(results[19]).toBe(57);
    });

    it('should report progress', async () => {
      const inputArray = Array.from({ length: 50 }, (_, i) => i);
      const progressReports: Array<{ processed: number; total: number }> = [];
      
      await optimizer.processArrayInChunks(
        inputArray,
        (item) => item,
        {
          chunkSize: 10,
          onProgress: (processed, total) => {
            progressReports.push({ processed, total });
          }
        }
      );
      
      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports[progressReports.length - 1]).toEqual({ processed: 50, total: 50 });
    });

    it('should handle errors gracefully', async () => {
      const inputArray = [1, 2, 3, 4, 5];
      
      await expect(
        optimizer.processArrayInChunks(
          inputArray,
          (item) => {
            if (item === 3) throw new Error('Test error');
            return item;
          },
          { chunkSize: 2 }
        )
      ).rejects.toThrow('Test error');
    });
  });

  describe('streaming JSON parser', () => {
    it('should parse complete JSON objects', () => {
      const parsedObjects: any[] = [];
      const errors: Error[] = [];
      
      const parser = optimizer.createStreamingJSONParser<any>(
        (obj) => parsedObjects.push(obj),
        (error) => errors.push(error)
      );
      
      parser.write('{"name": "test1", "value": 123}');
      parser.write('{"name": "test2", "value": 456}');
      parser.end();
      
      expect(parsedObjects).toHaveLength(2);
      expect(parsedObjects[0]).toEqual({ name: 'test1', value: 123 });
      expect(parsedObjects[1]).toEqual({ name: 'test2', value: 456 });
      expect(errors).toHaveLength(0);
    });

    it('should handle chunked JSON input', () => {
      const parsedObjects: any[] = [];
      const parser = optimizer.createStreamingJSONParser<any>(
        (obj) => parsedObjects.push(obj)
      );
      
      parser.write('{"name": "tes');
      parser.write('t", "value": 1');
      parser.write('23}{"name": "test2"');
      parser.write(', "value": 456}');
      parser.end();
      
      expect(parsedObjects).toHaveLength(2);
      expect(parsedObjects[0]).toEqual({ name: 'test', value: 123 });
      expect(parsedObjects[1]).toEqual({ name: 'test2', value: 456 });
    });

    it('should handle invalid JSON gracefully', () => {
      const parsedObjects: any[] = [];
      const errors: Error[] = [];
      
      const parser = optimizer.createStreamingJSONParser<any>(
        (obj) => parsedObjects.push(obj),
        (error) => errors.push(error)
      );
      
      parser.write('{"invalid": json}');
      parser.end();
      
      expect(parsedObjects).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reset parser state', () => {
      const parsedObjects: any[] = [];
      const parser = optimizer.createStreamingJSONParser<any>(
        (obj) => parsedObjects.push(obj)
      );
      
      parser.write('{"name": "test1"}');
      parser.reset();
      parser.write('{"name": "test2"}');
      parser.end();
      
      expect(parsedObjects).toHaveLength(2);
      expect(parsedObjects[0]).toEqual({ name: 'test1' });
      expect(parsedObjects[1]).toEqual({ name: 'test2' });
    });
  });

  describe('string pool optimization', () => {
    it('should optimize string operations', () => {
      const result = optimizer.withStringPool((pool) => {
        pool.push('test1');
        pool.push('test2');
        pool.push('test3');
        return pool.join(',');
      });
      
      expect(result).toBe('test1,test2,test3');
    });

    it('should reuse string pools', () => {
      let firstPool: string[] | undefined;
      let secondPool: string[] | undefined;
      
      optimizer.withStringPool((pool) => {
        firstPool = pool;
        pool.push('test');
        return pool.length;
      });
      
      optimizer.withStringPool((pool) => {
        secondPool = pool;
        return pool.length;
      });
      
      expect(firstPool).toBe(secondPool);
      expect(secondPool).toEqual([]); // Should be reset
    });
  });

  describe('regex optimization', () => {
    it('should create optimized regex matcher', () => {
      const patterns = ['test\\d+', 'value:\\s*\\w+', 'name="[^"]*"'];
      const matcher = optimizer.createOptimizedRegexMatcher(patterns);
      
      const text = 'test123 value: abc name="example" test456';
      const results = matcher(text);
      
      expect(results).toHaveLength(3);
      expect(results[0].pattern).toBe('test\\d+');
      expect(results[0].matches).toHaveLength(2);
      expect(results[1].pattern).toBe('value:\\s*\\w+');
      expect(results[1].matches).toHaveLength(1);
      expect(results[2].pattern).toBe('name="[^"]*"');
      expect(results[2].matches).toHaveLength(1);
    });

    it('should handle patterns with no matches', () => {
      const patterns = ['nomatch\\d+'];
      const matcher = optimizer.createOptimizedRegexMatcher(patterns);
      
      const text = 'test123 value abc';
      const results = matcher(text);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('object pool management', () => {
    it('should register custom object pools', () => {
      const pool = optimizer.registerObjectPool('testPool', {
        maxSize: 5,
        factory: () => ({ data: [] }),
        reset: (obj) => obj.data.length = 0
      });
      
      expect(pool).toBeDefined();
      expect(optimizer.getObjectPool('testPool')).toBe(pool);
    });

    it('should provide memory statistics', () => {
      optimizer.registerObjectPool('pool1', {
        maxSize: 3,
        factory: () => [],
        reset: (arr) => arr.length = 0
      });
      
      optimizer.registerObjectPool('pool2', {
        maxSize: 5,
        factory: () => ({}),
        reset: () => {}
      });
      
      const stats = optimizer.getStats();
      expect(stats.poolCount).toBeGreaterThanOrEqual(4); // 2 registered + 2 built-in
      expect(stats.pools.pool1).toBeDefined();
      expect(stats.pools.pool2).toBeDefined();
    });
  });

  describe('memory optimization patterns', () => {
    it('should handle large dataset processing efficiently', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `item_${i}`,
        metadata: { created: Date.now(), index: i }
      }));
      
      const startTime = Date.now();
      const results = await processInChunks(
        largeDataset,
        (item) => item.id * 2,
        { chunkSize: 100, maxConcurrency: 4 }
      );
      const endTime = Date.now();
      
      expect(results).toHaveLength(10000);
      expect(results[0]).toBe(0);
      expect(results[9999]).toBe(19998);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

describe('Memory Optimizer Helper Functions', () => {
  afterEach(() => {
    memoryOptimizer.clearAllPools();
  });

  it('should process arrays in chunks with helper function', async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const results = await processInChunks(
      data,
      (item) => item * 2,
      { chunkSize: 20 }
    );
    
    expect(results).toHaveLength(100);
    expect(results[50]).toBe(100);
  });

  it('should use string pool with helper function', () => {
    const result = withStringPool((pool) => {
      pool.push('a', 'b', 'c');
      return pool.join('-');
    });
    
    expect(result).toBe('a-b-c');
  });

  it('should create streaming JSON parser with helper function', () => {
    const objects: any[] = [];
    const parser = createStreamingJSONParser<any>((obj) => objects.push(obj));
    
    parser.write('{"test": true}');
    parser.end();
    
    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({ test: true });
  });
});

describe('Memory Optimizer Integration', () => {
  it('should handle real-world memory optimization scenarios', async () => {
    // Simulate processing a large conversation history
    const conversationHistory = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: ${'content '.repeat(100)}`,
      timestamp: Date.now() - (1000 - i) * 1000
    }));
    
    // Process with memory optimization
    const processedHistory = await processInChunks(
      conversationHistory,
      (message) => {
        // Simulate message processing
        return {
          id: message.id,
          role: message.role,
          contentLength: message.content.length,
          processed: true
        };
      },
      { 
        chunkSize: 50, 
        maxConcurrency: 3,
        memoryThreshold: 50 * 1024 * 1024 // 50MB
      }
    );
    
    expect(processedHistory).toHaveLength(1000);
    expect(processedHistory[0].processed).toBe(true);
    
    // Verify memory usage is reasonable
    const memoryUsage = process.memoryUsage();
    expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Should be under 200MB
  });
});
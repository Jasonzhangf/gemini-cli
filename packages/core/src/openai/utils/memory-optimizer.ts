/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Memory optimizer for OpenAI hijack system
 * Implements memory-efficient processing patterns
 */

import { memoryProfiler } from './memory-profiler.js';

export interface ChunkedProcessingOptions {
  chunkSize: number;
  maxConcurrency: number;
  memoryThreshold: number;
  onProgress?: (processed: number, total: number) => void;
}

export interface ObjectPoolOptions<T> {
  maxSize: number;
  factory: () => T;
  reset?: (obj: T) => void;
}

/**
 * Object pool for reusing objects to reduce allocations
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private maxSize: number;
  private factory: () => T;
  private reset?: (obj: T) => void;

  constructor(options: ObjectPoolOptions<T>) {
    this.maxSize = options.maxSize;
    this.factory = options.factory;
    this.reset = options.reset;
  }

  /**
   * Get an object from the pool
   */
  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  /**
   * Return an object to the pool
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      if (this.reset) {
        this.reset(obj);
      }
      this.pool.push(obj);
    }
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * Get pool statistics
   */
  getStats(): { poolSize: number; maxSize: number; utilizationRate: number } {
    return {
      poolSize: this.pool.length,
      maxSize: this.maxSize,
      utilizationRate: (this.maxSize - this.pool.length) / this.maxSize
    };
  }
}

/**
 * Memory optimizer utility class
 */
export class MemoryOptimizer {
  private static instance: MemoryOptimizer;
  private objectPools: Map<string, ObjectPool<any>> = new Map();
  private stringPool: ObjectPool<string[]>;
  private regexPool: ObjectPool<RegExp[]>;

  private constructor() {
    // Initialize common object pools
    this.stringPool = new ObjectPool<string[]>({
      maxSize: 100,
      factory: () => [],
      reset: (arr) => arr.length = 0
    });

    this.regexPool = new ObjectPool<RegExp[]>({
      maxSize: 50,
      factory: () => [],
      reset: (arr) => arr.length = 0
    });
  }

  static getInstance(): MemoryOptimizer {
    if (!MemoryOptimizer.instance) {
      MemoryOptimizer.instance = new MemoryOptimizer();
    }
    return MemoryOptimizer.instance;
  }

  /**
   * Process large arrays in chunks to prevent memory spikes
   */
  async processArrayInChunks<T, R>(
    array: T[],
    processor: (item: T) => Promise<R> | R,
    options: Partial<ChunkedProcessingOptions> = {}
  ): Promise<R[]> {
    const {
      chunkSize = 10,
      maxConcurrency = 3,
      memoryThreshold = 100 * 1024 * 1024, // 100MB
      onProgress
    } = options;

    const results: R[] = [];
    const chunks = this.createChunks(array, chunkSize);
    
    // Process chunks with concurrency control
    for (let i = 0; i < chunks.length; i += maxConcurrency) {
      const currentChunks = chunks.slice(i, i + maxConcurrency);
      
      // Check memory usage before processing
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed > memoryThreshold) {
        console.warn('[MemoryOptimizer] Memory threshold exceeded, forcing garbage collection');
        if (global.gc) {
          global.gc();
        }
        // Wait a bit for GC to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Process chunks in parallel
      const chunkPromises = currentChunks.map(async (chunk, chunkIndex) => {
        const operationId = `chunk_${i + chunkIndex}`;
        
        return memoryProfiler.profileFunction(
          'process_chunk',
          async () => {
            const chunkResults: R[] = [];
            for (const item of chunk) {
              const result = await processor(item);
              chunkResults.push(result);
            }
            return chunkResults;
          },
          { operationId }
        );
      });

      const chunkResults = await Promise.all(chunkPromises);
      
      // Flatten results
      for (const chunkResult of chunkResults) {
        results.push(...chunkResult);
      }

      // Report progress
      if (onProgress) {
        onProgress(results.length, array.length);
      }
    }

    return results;
  }

  /**
   * Create a streaming JSON parser for large responses
   */
  createStreamingJSONParser<T>(
    onObject: (obj: T) => void,
    onError?: (error: Error) => void
  ): {
    write: (chunk: string) => void;
    end: () => void;
    reset: () => void;
  } {
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let currentObject = '';

    const write = (chunk: string): void => {
      buffer += chunk;
      
      // Process character by character to track JSON structure
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        
        if (escaped) {
          escaped = false;
          currentObject += char;
          continue;
        }

        if (char === '\\' && inString) {
          escaped = true;
          currentObject += char;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          currentObject += char;
          continue;
        }

        if (inString) {
          currentObject += char;
          continue;
        }

        if (char === '{') {
          depth++;
          currentObject += char;
        } else if (char === '}') {
          depth--;
          currentObject += char;
          
          if (depth === 0 && currentObject.trim()) {
            // Complete JSON object found
            try {
              const parsed = JSON.parse(currentObject);
              onObject(parsed);
              currentObject = '';
            } catch (error) {
              if (onError) {
                onError(error as Error);
              }
            }
          }
        } else {
          currentObject += char;
        }
      }
      
      // Clear processed buffer
      buffer = '';
    };

    const end = (): void => {
      if (currentObject.trim()) {
        try {
          const parsed = JSON.parse(currentObject);
          onObject(parsed);
        } catch (error) {
          if (onError) {
            onError(error as Error);
          }
        }
      }
    };

    const reset = (): void => {
      buffer = '';
      depth = 0;
      inString = false;
      escaped = false;
      currentObject = '';
    };

    return { write, end, reset };
  }

  /**
   * Optimize string operations with pooling
   */
  withStringPool<T>(operation: (pool: string[]) => T): T {
    const pool = this.stringPool.get();
    try {
      return operation(pool);
    } finally {
      this.stringPool.release(pool);
    }
  }

  /**
   * Create memory-efficient regex matcher
   */
  createOptimizedRegexMatcher(
    patterns: string[],
    flags: string = 'g'
  ): (text: string) => Array<{ pattern: string; matches: RegExpMatchArray[] }> {
    // Pre-compile regex patterns
    const compiledPatterns = patterns.map(pattern => ({
      pattern,
      regex: new RegExp(pattern, flags)
    }));

    return (text: string) => {
      const results: Array<{ pattern: string; matches: RegExpMatchArray[] }> = [];
      
      for (const { pattern, regex } of compiledPatterns) {
        const matches: RegExpMatchArray[] = [];
        let match: RegExpMatchArray | null;
        
        // Reset regex lastIndex
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
          matches.push(match);
          
          // Prevent infinite loops
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
        
        if (matches.length > 0) {
          results.push({ pattern, matches });
        }
      }
      
      return results;
    };
  }

  /**
   * Optimize object creation with pooling
   */
  registerObjectPool<T>(
    poolName: string,
    options: ObjectPoolOptions<T>
  ): ObjectPool<T> {
    const pool = new ObjectPool(options);
    this.objectPools.set(poolName, pool);
    return pool;
  }

  /**
   * Get object pool by name
   */
  getObjectPool<T>(poolName: string): ObjectPool<T> | undefined {
    return this.objectPools.get(poolName);
  }

  /**
   * Clear all object pools
   */
  clearAllPools(): void {
    for (const pool of this.objectPools.values()) {
      pool.clear();
    }
    this.stringPool.clear();
    this.regexPool.clear();
  }

  /**
   * Get memory optimization statistics
   */
  getStats(): {
    poolCount: number;
    pools: Record<string, { poolSize: number; maxSize: number; utilizationRate: number }>;
  } {
    const pools: Record<string, { poolSize: number; maxSize: number; utilizationRate: number }> = {};
    
    for (const [name, pool] of this.objectPools) {
      pools[name] = pool.getStats();
    }
    
    pools['stringPool'] = this.stringPool.getStats();
    pools['regexPool'] = this.regexPool.getStats();

    return {
      poolCount: this.objectPools.size + 2, // +2 for string and regex pools
      pools
    };
  }

  /**
   * Create chunks from array
   */
  private createChunks<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// Singleton instance for global usage
export const memoryOptimizer = MemoryOptimizer.getInstance();

// Helper functions for common patterns
export function processInChunks<T, R>(
  array: T[],
  processor: (item: T) => Promise<R> | R,
  options?: Partial<ChunkedProcessingOptions>
): Promise<R[]> {
  return memoryOptimizer.processArrayInChunks(array, processor, options);
}

export function withStringPool<T>(operation: (pool: string[]) => T): T {
  return memoryOptimizer.withStringPool(operation);
}

export function createStreamingJSONParser<T>(
  onObject: (obj: T) => void,
  onError?: (error: Error) => void
) {
  return memoryOptimizer.createStreamingJSONParser(onObject, onError);
}
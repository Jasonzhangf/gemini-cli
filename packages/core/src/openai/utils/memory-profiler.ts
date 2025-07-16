/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Memory profiler for OpenAI hijack system
 * Tracks memory usage patterns and identifies optimization opportunities
 */

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  operation: string;
  operationId: string;
}

export interface MemoryProfile {
  baseline: MemorySnapshot;
  snapshots: MemorySnapshot[];
  peakMemory: MemorySnapshot;
  averageMemory: number;
  memoryGrowthRate: number;
}

export class MemoryProfiler {
  private enabled: boolean = false;
  private snapshots: MemorySnapshot[] = [];
  private baseline: MemorySnapshot | null = null;
  private operationStartTimes: Map<string, number> = new Map();
  private memoryThreshold: number = 100 * 1024 * 1024; // 100MB default threshold
  private debugMode: boolean = false;

  constructor(options: { enabled?: boolean; threshold?: number; debugMode?: boolean } = {}) {
    this.enabled = options.enabled ?? false;
    this.memoryThreshold = options.threshold ?? this.memoryThreshold;
    this.debugMode = options.debugMode ?? false;
  }

  /**
   * Enable memory profiling
   */
  enable(): void {
    this.enabled = true;
    this.baseline = this.createSnapshot('baseline', 'initial');
    
    if (this.debugMode) {
      console.log('[MemoryProfiler] Memory profiling enabled');
      console.log('[MemoryProfiler] Baseline memory:', this.formatMemoryUsage(this.baseline));
    }
  }

  /**
   * Disable memory profiling
   */
  disable(): void {
    this.enabled = false;
    this.snapshots = [];
    this.baseline = null;
    this.operationStartTimes.clear();
    
    if (this.debugMode) {
      console.log('[MemoryProfiler] Memory profiling disabled');
    }
  }

  /**
   * Take a memory snapshot
   */
  snapshot(operation: string, operationId: string = Date.now().toString()): MemorySnapshot | null {
    if (!this.enabled) return null;

    const snapshot = this.createSnapshot(operation, operationId);
    this.snapshots.push(snapshot);

    // Check for memory threshold violation
    if (snapshot.heapUsed > this.memoryThreshold) {
      this.handleMemoryThresholdViolation(snapshot);
    }

    if (this.debugMode) {
      console.log(`[MemoryProfiler] Snapshot - ${operation}:`, this.formatMemoryUsage(snapshot));
    }

    return snapshot;
  }

  /**
   * Start profiling an operation
   */
  startOperation(operationId: string, operation: string): void {
    if (!this.enabled) return;

    this.operationStartTimes.set(operationId, Date.now());
    this.snapshot(`start_${operation}`, operationId);
  }

  /**
   * End profiling an operation
   */
  endOperation(operationId: string, operation: string): MemorySnapshot | null {
    if (!this.enabled) return null;

    const snapshot = this.snapshot(`end_${operation}`, operationId);
    const startTime = this.operationStartTimes.get(operationId);
    
    if (startTime && snapshot) {
      const duration = snapshot.timestamp - startTime;
      
      if (this.debugMode) {
        console.log(`[MemoryProfiler] Operation ${operation} completed in ${duration}ms`);
      }
    }

    this.operationStartTimes.delete(operationId);
    return snapshot;
  }

  /**
   * Profile a function execution
   */
  async profileFunction<T>(
    operation: string,
    fn: () => Promise<T> | T,
    options: { operationId?: string; trackArgs?: boolean } = {}
  ): Promise<T> {
    if (!this.enabled) {
      return await fn();
    }

    const operationId = options.operationId || Date.now().toString();
    
    this.startOperation(operationId, operation);
    
    try {
      const result = await fn();
      this.endOperation(operationId, operation);
      return result;
    } catch (error) {
      this.endOperation(operationId, `${operation}_error`);
      throw error;
    }
  }

  /**
   * Get memory profile summary
   */
  getProfile(): MemoryProfile | null {
    if (!this.enabled || !this.baseline || this.snapshots.length === 0) {
      return null;
    }

    const peakMemory = this.snapshots.reduce((peak, snapshot) => 
      snapshot.heapUsed > peak.heapUsed ? snapshot : peak
    );

    const averageMemory = this.snapshots.reduce((sum, snapshot) => 
      sum + snapshot.heapUsed, 0
    ) / this.snapshots.length;

    const memoryGrowthRate = this.snapshots.length > 1 
      ? (this.snapshots[this.snapshots.length - 1].heapUsed - this.snapshots[0].heapUsed) / this.snapshots.length
      : 0;

    return {
      baseline: this.baseline,
      snapshots: [...this.snapshots],
      peakMemory,
      averageMemory,
      memoryGrowthRate
    };
  }

  /**
   * Clear all profiling data
   */
  clear(): void {
    this.snapshots = [];
    this.operationStartTimes.clear();
    
    if (this.baseline) {
      this.baseline = this.createSnapshot('baseline', 'reset');
    }
  }

  /**
   * Check if memory usage is concerning
   */
  isMemoryUsageConcerning(): boolean {
    if (!this.enabled || this.snapshots.length === 0) return false;

    const recentSnapshots = this.snapshots.slice(-5);
    const recentAverage = recentSnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / recentSnapshots.length;
    
    return recentAverage > this.memoryThreshold;
  }

  /**
   * Get memory optimization suggestions
   */
  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const profile = this.getProfile();
    
    if (!profile) return suggestions;

    if (profile.peakMemory.heapUsed > this.memoryThreshold) {
      suggestions.push(`Peak memory usage (${this.formatBytes(profile.peakMemory.heapUsed)}) exceeds threshold`);
    }

    if (profile.memoryGrowthRate > 1024 * 1024) { // 1MB growth per operation
      suggestions.push(`High memory growth rate detected: ${this.formatBytes(profile.memoryGrowthRate)}/operation`);
    }

    const recentSnapshots = profile.snapshots.slice(-10);
    const largeAllocations = recentSnapshots.filter(s => s.heapUsed > profile.averageMemory * 2);
    
    if (largeAllocations.length > 0) {
      suggestions.push(`${largeAllocations.length} operations with unusually high memory usage detected`);
    }

    return suggestions;
  }

  /**
   * Create a memory snapshot
   */
  private createSnapshot(operation: string, operationId: string): MemorySnapshot {
    const memoryUsage = process.memoryUsage();
    
    return {
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
      arrayBuffers: memoryUsage.arrayBuffers,
      operation,
      operationId
    };
  }

  /**
   * Handle memory threshold violations
   */
  private handleMemoryThresholdViolation(snapshot: MemorySnapshot): void {
    console.warn('[MemoryProfiler] Memory threshold exceeded!');
    console.warn('[MemoryProfiler] Current usage:', this.formatMemoryUsage(snapshot));
    console.warn('[MemoryProfiler] Threshold:', this.formatBytes(this.memoryThreshold));
    
    // Force garbage collection if available
    if (global.gc) {
      if (this.debugMode) {
        console.log('[MemoryProfiler] Running garbage collection...');
      }
      global.gc();
    }
  }

  /**
   * Format memory usage for display
   */
  private formatMemoryUsage(snapshot: MemorySnapshot): string {
    return `Heap: ${this.formatBytes(snapshot.heapUsed)}/${this.formatBytes(snapshot.heapTotal)}, ` +
           `RSS: ${this.formatBytes(snapshot.rss)}, ` +
           `External: ${this.formatBytes(snapshot.external)}`;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}

// Singleton instance for global usage
export const memoryProfiler = new MemoryProfiler();

// Helper function to enable profiling based on environment
export function enableMemoryProfiling(): void {
  const enabled = process.env.MEMORY_PROFILING === 'true' || process.env.DEBUG === '1';
  const threshold = process.env.MEMORY_THRESHOLD ? parseInt(process.env.MEMORY_THRESHOLD) : undefined;
  const debugMode = process.env.DEBUG === '1';
  
  if (enabled) {
    memoryProfiler.enable();
    console.log('[MemoryProfiler] Memory profiling enabled via environment variables');
  }
}
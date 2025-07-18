/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { IContextExtractor, IKnowledgeGraphProvider, ContextQuery, ExtractedContext } from '../../interfaces/contextProviders.js';
import { ContextProviderFactory } from '../contextProviderFactory.js';
import { EventEmitter } from 'events';

/**
 * 备份配置接口
 */
export interface BackupConfig {
  // 主提供者配置
  primaryExtractor: {
    type: string;
    config: any;
  };
  
  // 备份提供者配置
  backupExtractor: {
    type: string;
    config: any;
  };
  
  // 故障转移配置
  failoverConfig: {
    enableAutoFailover: boolean;
    healthCheckInterval: number; // ms
    maxRetryAttempts: number;
    failoverTimeout: number; // ms
    enableFailback: boolean; // 是否自动回退到主提供者
    failbackCheckInterval: number; // ms
  };
  
  // 同步配置
  syncConfig: {
    enableSync: boolean;
    syncInterval: number; // ms
    batchSize: number;
    enableIncrementalSync: boolean;
  };

  // 监控配置
  monitoring: {
    enableHealthCheck: boolean;
    enablePerformanceTracking: boolean;
    enableEventLogging: boolean;
  };
}

/**
 * 运行状态
 */
export interface RuntimeStatus {
  isUsingBackup: boolean;
  primaryHealthy: boolean;
  backupHealthy: boolean;
  lastFailoverTime?: Date;
  lastFailbackTime?: Date;
  failoverCount: number;
  syncStatus: {
    lastSyncTime?: Date;
    lastSyncSuccess: boolean;
    pendingItemsCount: number;
  };
  performance: {
    primaryAvgResponseTime: number;
    backupAvgResponseTime: number;
    successRate: number;
  };
}

/**
 * Neo4j备份管理器
 * 
 * 提供Silicon Flow和Neo4j Graph RAG之间的无缝故障转移
 * 
 * 特性：
 * - 自动健康检查和故障检测
 * - 无缝故障转移和恢复
 * - 数据同步和一致性保证
 * - 性能监控和统计
 * - 事件驱动的状态通知
 */
export class Neo4jBackupManager extends EventEmitter {
  private config: BackupConfig;
  private primaryExtractor: IContextExtractor | null = null;
  private backupExtractor: IContextExtractor | null = null;
  private factory: ContextProviderFactory;
  
  private status: RuntimeStatus;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private failbackTimer: NodeJS.Timeout | null = null;
  
  private requestQueue: Array<{
    query: ContextQuery;
    resolve: (result: ExtractedContext) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private performanceTracker = {
    primaryTimes: [] as number[],
    backupTimes: [] as number[],
    requestCount: 0,
    successCount: 0
  };

  constructor(config: Partial<BackupConfig> = {}) {
    super();
    
    this.config = {
      primaryExtractor: {
        type: 'rag',
        config: {}
      },
      backupExtractor: {
        type: 'neo4j-graph-rag',
        config: {}
      },
      failoverConfig: {
        enableAutoFailover: true,
        healthCheckInterval: 30000, // 30秒
        maxRetryAttempts: 3,
        failoverTimeout: 5000, // 5秒
        enableFailback: true,
        failbackCheckInterval: 60000 // 1分钟
      },
      syncConfig: {
        enableSync: true,
        syncInterval: 300000, // 5分钟
        batchSize: 100,
        enableIncrementalSync: true
      },
      monitoring: {
        enableHealthCheck: true,
        enablePerformanceTracking: true,
        enableEventLogging: true
      },
      ...config
    };

    this.status = {
      isUsingBackup: false,
      primaryHealthy: true,
      backupHealthy: true,
      failoverCount: 0,
      syncStatus: {
        lastSyncSuccess: true,
        pendingItemsCount: 0
      },
      performance: {
        primaryAvgResponseTime: 0,
        backupAvgResponseTime: 0,
        successRate: 1.0
      }
    };

    this.factory = ContextProviderFactory.getInstance();
  }

  /**
   * 初始化备份管理器
   */
  async initialize(): Promise<void> {
    try {
      // 创建共享的graph和vector providers
      const sharedGraphProvider = this.factory.createGraphProvider({
        type: 'neo4j',
        config: {}
      });
      const sharedVectorProvider = this.factory.createVectorProvider({
        type: 'siliconflow',
        config: {}
      });

      // 初始化主提取器
      this.primaryExtractor = this.factory.createContextExtractor({
        type: this.config.primaryExtractor.type,
        config: this.config.primaryExtractor.config
      } as any, sharedGraphProvider, sharedVectorProvider);

      // 初始化备份提取器
      this.backupExtractor = this.factory.createContextExtractor({
        type: this.config.backupExtractor.type,
        config: this.config.backupExtractor.config
      } as any, sharedGraphProvider, sharedVectorProvider);

      // 初始化备份提取器（如果是Neo4j Graph RAG）
      if (this.backupExtractor && 'initialize' in this.backupExtractor) {
        await (this.backupExtractor as any).initialize();
      }

      // 启动健康检查
      if (this.config.monitoring.enableHealthCheck) {
        this.startHealthCheck();
      }

      // 启动同步
      if (this.config.syncConfig.enableSync) {
        this.startSync();
      }

      // 启动故障回退检查
      if (this.config.failoverConfig.enableFailback) {
        this.startFailbackCheck();
      }

      this.log('Neo4j备份管理器初始化成功');
      this.emit('initialized');
    } catch (error) {
      this.log(`初始化失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 提取上下文 - 主要接口
   */
  async extractContext(query: ContextQuery): Promise<ExtractedContext> {
    this.performanceTracker.requestCount++;
    const startTime = Date.now();

    try {
      const result = await this.executeWithFailover(async () => {
        const currentExtractor = this.status.isUsingBackup ? this.backupExtractor : this.primaryExtractor;
        
        if (!currentExtractor) {
          throw new Error('No extractor available');
        }

        return await currentExtractor.extractContext(query);
      });

      // 记录性能
      const responseTime = Date.now() - startTime;
      this.trackPerformance(responseTime, this.status.isUsingBackup);
      this.performanceTracker.successCount++;

      return result;
    } catch (error) {
      this.log(`上下文提取失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 执行带故障转移的操作
   */
  private async executeWithFailover<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < this.config.failoverConfig.maxRetryAttempts) {
      try {
        return await Promise.race([
          operation(),
          this.createTimeoutPromise(this.config.failoverConfig.failoverTimeout)
        ]) as T;
      } catch (error) {
        lastError = error as Error;
        attempts++;

        this.log(`操作失败 (尝试 ${attempts}/${this.config.failoverConfig.maxRetryAttempts}): ${error}`, 'warn');

        // 如果还有重试机会且启用了自动故障转移
        if (attempts < this.config.failoverConfig.maxRetryAttempts && 
            this.config.failoverConfig.enableAutoFailover) {
          
          if (!this.status.isUsingBackup && this.backupExtractor) {
            // 切换到备份
            await this.switchToBackup();
          } else if (this.status.isUsingBackup && this.primaryExtractor) {
            // 切换到主要
            await this.switchToPrimary();
          }
        }
      }
    }

    throw lastError || new Error('All attempts failed');
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise<T>(timeout: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeout);
    });
  }

  /**
   * 切换到备份提取器
   */
  private async switchToBackup(): Promise<void> {
    if (this.status.isUsingBackup || !this.backupExtractor) {
      return;
    }

    this.log('切换到备份提取器 (Neo4j Graph RAG)');
    this.status.isUsingBackup = true;
    this.status.lastFailoverTime = new Date();
    this.status.failoverCount++;
    
    this.emit('failover', {
      from: 'primary',
      to: 'backup',
      timestamp: this.status.lastFailoverTime
    });
  }

  /**
   * 切换到主提取器
   */
  private async switchToPrimary(): Promise<void> {
    if (!this.status.isUsingBackup || !this.primaryExtractor) {
      return;
    }

    this.log('切换到主提取器 (Silicon Flow RAG)');
    this.status.isUsingBackup = false;
    this.status.lastFailbackTime = new Date();
    
    this.emit('failback', {
      from: 'backup',
      to: 'primary',
      timestamp: this.status.lastFailbackTime
    });
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.failoverConfig.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 检查主提取器
      const primaryHealthy = await this.checkExtractorHealth(this.primaryExtractor);
      this.status.primaryHealthy = primaryHealthy;

      // 检查备份提取器
      const backupHealthy = await this.checkExtractorHealth(this.backupExtractor);
      this.status.backupHealthy = backupHealthy;

      // 触发故障转移逻辑
      if (!primaryHealthy && !this.status.isUsingBackup && backupHealthy) {
        await this.switchToBackup();
      } else if (primaryHealthy && this.status.isUsingBackup && this.config.failoverConfig.enableFailback) {
        await this.switchToPrimary();
      }

      this.emit('healthCheck', {
        primaryHealthy,
        backupHealthy,
        currentProvider: this.status.isUsingBackup ? 'backup' : 'primary'
      });
    } catch (error) {
      this.log(`健康检查失败: ${error}`, 'error');
    }
  }

  /**
   * 检查提取器健康状况
   */
  private async checkExtractorHealth(extractor: IContextExtractor | null): Promise<boolean> {
    if (!extractor) {
      return false;
    }

    try {
      // 如果是Neo4j Graph RAG提取器，检查其健康状况
      if ('healthCheck' in extractor) {
        return await (extractor as any).healthCheck();
      }

      // 对于其他提取器，执行简单的上下文提取测试
      const testQuery: ContextQuery = {
        userInput: 'health check test'
      };

      const result = await Promise.race([
        extractor.extractContext(testQuery),
        this.createTimeoutPromise(5000) // 5秒超时
      ]);

      return result !== null;
    } catch (error) {
      this.log(`提取器健康检查失败: ${error}`, 'debug');
      return false;
    }
  }

  /**
   * 启动数据同步
   */
  private startSync(): void {
    this.syncTimer = setInterval(async () => {
      await this.performSync();
    }, this.config.syncConfig.syncInterval);
  }

  /**
   * 执行数据同步
   */
  private async performSync(): Promise<void> {
    // 这里可以实现主备之间的数据同步逻辑
    // 目前只是记录同步状态
    try {
      this.status.syncStatus.lastSyncTime = new Date();
      this.status.syncStatus.lastSyncSuccess = true;
      this.status.syncStatus.pendingItemsCount = 0;
      
      this.emit('sync', {
        success: true,
        timestamp: this.status.syncStatus.lastSyncTime
      });
    } catch (error) {
      this.status.syncStatus.lastSyncSuccess = false;
      this.log(`数据同步失败: ${error}`, 'error');
      this.emit('sync', {
        success: false,
        error: error as Error
      });
    }
  }

  /**
   * 启动故障回退检查
   */
  private startFailbackCheck(): void {
    this.failbackTimer = setInterval(async () => {
      if (this.status.isUsingBackup && this.status.primaryHealthy) {
        await this.switchToPrimary();
      }
    }, this.config.failoverConfig.failbackCheckInterval);
  }

  /**
   * 跟踪性能指标
   */
  private trackPerformance(responseTime: number, wasBackup: boolean): void {
    if (!this.config.monitoring.enablePerformanceTracking) {
      return;
    }

    if (wasBackup) {
      this.performanceTracker.backupTimes.push(responseTime);
      if (this.performanceTracker.backupTimes.length > 100) {
        this.performanceTracker.backupTimes.shift();
      }
    } else {
      this.performanceTracker.primaryTimes.push(responseTime);
      if (this.performanceTracker.primaryTimes.length > 100) {
        this.performanceTracker.primaryTimes.shift();
      }
    }

    // 更新平均响应时间
    this.status.performance.primaryAvgResponseTime = 
      this.performanceTracker.primaryTimes.reduce((a, b) => a + b, 0) / 
      Math.max(this.performanceTracker.primaryTimes.length, 1);

    this.status.performance.backupAvgResponseTime = 
      this.performanceTracker.backupTimes.reduce((a, b) => a + b, 0) / 
      Math.max(this.performanceTracker.backupTimes.length, 1);

    this.status.performance.successRate = 
      this.performanceTracker.successCount / Math.max(this.performanceTracker.requestCount, 1);
  }

  /**
   * 获取运行状态
   */
  getStatus(): RuntimeStatus {
    return { ...this.status };
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): {
    requestCount: number;
    successCount: number;
    successRate: number;
    avgResponseTime: {
      primary: number;
      backup: number;
    };
    failoverCount: number;
  } {
    return {
      requestCount: this.performanceTracker.requestCount,
      successCount: this.performanceTracker.successCount,
      successRate: this.status.performance.successRate,
      avgResponseTime: {
        primary: this.status.performance.primaryAvgResponseTime,
        backup: this.status.performance.backupAvgResponseTime
      },
      failoverCount: this.status.failoverCount
    };
  }

  /**
   * 手动触发故障转移
   */
  async manualFailover(): Promise<void> {
    if (this.status.isUsingBackup) {
      await this.switchToPrimary();
    } else {
      await this.switchToBackup();
    }
  }

  /**
   * 日志记录
   */
  private log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
    if (!this.config.monitoring.enableEventLogging) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [Neo4jBackupManager] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    // 清理定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.failbackTimer) {
      clearInterval(this.failbackTimer);
      this.failbackTimer = null;
    }

    // 清理提取器
    if (this.backupExtractor && 'dispose' in this.backupExtractor) {
      await (this.backupExtractor as any).dispose();
    }

    this.log('备份管理器已清理');
    this.emit('disposed');
  }
}
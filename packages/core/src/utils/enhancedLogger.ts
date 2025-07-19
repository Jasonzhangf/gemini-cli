/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface LogEntry {
  timestamp: string;
  module: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  data?: any;
  turnId?: string;
  sessionId?: string;
}

export interface LoggerConfig {
  enabled: boolean;
  logDirectory: string;
  maxFileSize: number; // MB
  maxFiles: number;
  turnBasedLogs: boolean;
  filenameFormat: 'content-time' | 'time-content';
  modules: {
    [key: string]: {
      enabled: boolean;
      fileOutput: boolean;
    };
  };
}

/**
 * 增强的模块化日志管理器
 * 支持按轮次分模块记录，文件名格式可配置
 */
export class EnhancedLogger {
  private config: LoggerConfig;
  private currentTurnId: string | null = null;
  private sessionId: string;
  private logBuffer: Map<string, LogEntry[]> = new Map();
  private fileHandles: Map<string, fs.WriteStream> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.sessionId = this.generateSessionId();
    this.config = {
      enabled: process.env.DEBUG === '1' || process.env.DEBUG === 'true',
      logDirectory: process.env.DEBUG_LOG_DIRECTORY || path.join(os.homedir(), '.gemini', 'debug'),
      maxFileSize: parseInt(process.env.DEBUG_MAX_FILE_SIZE || '10'),
      maxFiles: parseInt(process.env.DEBUG_MAX_FILES || '5'),
      turnBasedLogs: process.env.DEBUG_TURN_BASED_LOGS === 'true',
      filenameFormat: (process.env.DEBUG_FILENAME_FORMAT as any) || 'content-time',
      modules: {
        context: {
          enabled: process.env.DEBUG_CONTEXT === 'true',
          fileOutput: process.env.DEBUG_CONTEXT_FILE === 'true'
        },
        rag: {
          enabled: process.env.DEBUG_RAG === 'true',
          fileOutput: process.env.DEBUG_RAG_FILE === 'true'
        },
        llm: {
          enabled: process.env.DEBUG_LLM === 'true' || process.env.CONTEXTAGENT_DEBUG === 'true',
          fileOutput: process.env.DEBUG_LLM_FILE === 'true'
        },
        embedding: {
          enabled: process.env.DEBUG_EMBEDDING === 'true',
          fileOutput: process.env.DEBUG_EMBEDDING_FILE === 'true'
        },
        vectorstore: {
          enabled: process.env.DEBUG_VECTORSTORE === 'true',
          fileOutput: process.env.DEBUG_VECTORSTORE_FILE === 'true'
        },
        contextprovider: {
          enabled: process.env.DEBUG_CONTEXTPROVIDER === 'true',
          fileOutput: process.env.DEBUG_CONTEXTPROVIDER_FILE === 'true'
        },
        promptbuilder: {
          enabled: process.env.DEBUG_PROMPTBUILDER === 'true',
          fileOutput: process.env.DEBUG_PROMPTBUILDER_FILE === 'true'
        },
        toolmanager: {
          enabled: process.env.DEBUG_TOOLMANAGER === 'true',
          fileOutput: process.env.DEBUG_TOOLMANAGER_FILE === 'true'
        },
        taskmanager: {
          enabled: process.env.DEBUG_TASKMANAGER === 'true',
          fileOutput: process.env.DEBUG_TASKMANAGER_FILE === 'true'
        },
        system: {
          enabled: process.env.DEBUG_SYSTEM === 'true',
          fileOutput: process.env.DEBUG_SYSTEM_FILE === 'true'
        }
      },
      ...config
    };

    this.ensureLogDirectory();
  }

  /**
   * 开始新的对话轮次
   */
  startTurn(turnId?: string): string {
    this.currentTurnId = turnId || this.generateTurnId();
    
    if (this.config.turnBasedLogs && this.config.enabled) {
      this.log('system', 'INFO', `Starting new turn: ${this.currentTurnId}`);
    }
    
    return this.currentTurnId;
  }

  /**
   * 结束当前对话轮次
   */
  endTurn(): void {
    if (this.currentTurnId && this.config.turnBasedLogs && this.config.enabled) {
      this.log('system', 'INFO', `Ending turn: ${this.currentTurnId}`);
      this.flushTurnLogs();
    }
    
    this.currentTurnId = null;
  }

  /**
   * 记录日志
   */
  log(module: string, level: LogEntry['level'], message: string, data?: any): void {
    if (!this.config.enabled) return;

    const moduleConfig = this.config.modules[module];
    if (!moduleConfig?.enabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      module,
      level,
      message,
      data,
      turnId: this.currentTurnId || undefined,
      sessionId: this.sessionId
    };

    // 控制台输出
    this.outputToConsole(logEntry);

    // 文件输出
    if (moduleConfig.fileOutput) {
      this.outputToFile(logEntry);
    }

    // 缓存到轮次缓冲区
    if (this.config.turnBasedLogs && this.currentTurnId) {
      const key = `${this.currentTurnId}-${module}`;
      if (!this.logBuffer.has(key)) {
        this.logBuffer.set(key, []);
      }
      this.logBuffer.get(key)!.push(logEntry);
    }
  }

  /**
   * 便捷方法
   */
  debug(module: string, message: string, data?: any): void {
    this.log(module, 'DEBUG', message, data);
  }

  info(module: string, message: string, data?: any): void {
    this.log(module, 'INFO', message, data);
  }

  warn(module: string, message: string, data?: any): void {
    this.log(module, 'WARN', message, data);
  }

  error(module: string, message: string, data?: any): void {
    this.log(module, 'ERROR', message, data);
  }

  success(module: string, message: string, data?: any): void {
    this.log(module, 'SUCCESS', message, data);
  }

  /**
   * 控制台输出
   */
  private outputToConsole(entry: LogEntry): void {
    const colors = {
      DEBUG: '\x1b[36m',   // Cyan
      INFO: '\x1b[34m',    // Blue
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      RESET: '\x1b[0m'
    };

    const color = colors[entry.level];
    const turnInfo = entry.turnId ? ` [Turn:${entry.turnId}]` : '';
    
    console.log(`${color}[${entry.timestamp}] [${entry.module.toUpperCase()}] [${entry.level}]${turnInfo} ${entry.message}${colors.RESET}`);
    
    if (entry.data) {
      console.log(`${color}Data:${colors.RESET}`, JSON.stringify(entry.data, null, 2));
    }
  }

  /**
   * 文件输出
   */
  private outputToFile(entry: LogEntry): void {
    try {
      const filename = this.generateFilename(entry);
      const filepath = path.join(this.config.logDirectory, filename);
      
      const logLine = JSON.stringify(entry) + '\n';
      
      // 检查文件大小
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.size > this.config.maxFileSize * 1024 * 1024) {
          this.rotateLogFile(filepath);
        }
      }
      
      fs.appendFileSync(filepath, logLine, 'utf8');
      
    } catch (error) {
      console.error('[EnhancedLogger] Failed to write to file:', error);
    }
  }

  /**
   * 生成文件名
   */
  private generateFilename(entry: LogEntry): string {
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
    
    if (this.config.turnBasedLogs && entry.turnId) {
      // 按轮次分文件
      if (this.config.filenameFormat === 'content-time') {
        return `${entry.module}-turn-${entry.turnId}-${dateStr}-${timeStr}.jsonl`;
      } else {
        return `${dateStr}-${timeStr}-${entry.module}-turn-${entry.turnId}.jsonl`;
      }
    } else {
      // 按模块分文件
      if (this.config.filenameFormat === 'content-time') {
        return `${entry.module}-${dateStr}-${timeStr}.jsonl`;
      } else {
        return `${dateStr}-${timeStr}-${entry.module}.jsonl`;
      }
    }
  }

  /**
   * 轮换日志文件
   */
  private rotateLogFile(filepath: string): void {
    const dir = path.dirname(filepath);
    const basename = path.basename(filepath, '.jsonl');
    
    for (let i = this.config.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(dir, `${basename}.${i}.jsonl`);
      const newFile = path.join(dir, `${basename}.${i + 1}.jsonl`);
      
      if (fs.existsSync(oldFile)) {
        if (i === this.config.maxFiles - 1) {
          fs.unlinkSync(oldFile); // 删除最老的文件
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }
    
    // 重命名当前文件
    const backupFile = path.join(dir, `${basename}.1.jsonl`);
    fs.renameSync(filepath, backupFile);
  }

  /**
   * 刷新轮次日志到独立文件
   */
  private flushTurnLogs(): void {
    if (!this.currentTurnId) return;

    for (const [key, entries] of this.logBuffer.entries()) {
      if (key.startsWith(this.currentTurnId)) {
        const [turnId, module] = key.split('-');
        const filename = this.generateTurnSummaryFilename(module, turnId);
        const filepath = path.join(this.config.logDirectory, filename);
        
        try {
          const summary = {
            turnId,
            module,
            sessionId: this.sessionId,
            startTime: entries[0]?.timestamp,
            endTime: entries[entries.length - 1]?.timestamp,
            entryCount: entries.length,
            entries
          };
          
          fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf8');
          this.logBuffer.delete(key);
          
        } catch (error) {
          console.error(`[EnhancedLogger] Failed to flush turn logs for ${key}:`, error);
        }
      }
    }
  }

  /**
   * 生成轮次汇总文件名
   */
  private generateTurnSummaryFilename(module: string, turnId: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    
    if (this.config.filenameFormat === 'content-time') {
      return `${module}-turn-summary-${turnId}-${dateStr}-${timeStr}.json`;
    } else {
      return `${dateStr}-${timeStr}-${module}-turn-summary-${turnId}.json`;
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成轮次ID
   */
  private generateTurnId(): string {
    return `turn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 获取当前配置
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * 获取当前轮次ID
   */
  getCurrentTurnId(): string | null {
    return this.currentTurnId;
  }

  /**
   * 获取会话ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 关闭所有文件句柄
    for (const handle of this.fileHandles.values()) {
      handle.end();
    }
    this.fileHandles.clear();

    // 刷新剩余的轮次日志
    if (this.currentTurnId) {
      this.flushTurnLogs();
    }

    this.logBuffer.clear();
  }
}

// 全局单例实例
let globalLogger: EnhancedLogger | null = null;

/**
 * 获取全局日志实例
 */
export function getGlobalLogger(): EnhancedLogger {
  if (!globalLogger) {
    globalLogger = new EnhancedLogger();
  }
  return globalLogger;
}

/**
 * 设置全局日志实例
 */
export function setGlobalLogger(logger: EnhancedLogger): void {
  if (globalLogger) {
    globalLogger.dispose();
  }
  globalLogger = logger;
}

/**
 * 便捷的全局日志方法
 */
export const logger = {
  startTurn: (turnId?: string) => getGlobalLogger().startTurn(turnId),
  endTurn: () => getGlobalLogger().endTurn(),
  debug: (module: string, message: string, data?: any) => getGlobalLogger().debug(module, message, data),
  info: (module: string, message: string, data?: any) => getGlobalLogger().info(module, message, data),
  warn: (module: string, message: string, data?: any) => getGlobalLogger().warn(module, message, data),
  error: (module: string, message: string, data?: any) => getGlobalLogger().error(module, message, data),
  success: (module: string, message: string, data?: any) => getGlobalLogger().success(module, message, data),
  getCurrentTurnId: () => getGlobalLogger().getCurrentTurnId(),
  getSessionId: () => getGlobalLogger().getSessionId(),
  getConfig: () => getGlobalLogger().getConfig()
};
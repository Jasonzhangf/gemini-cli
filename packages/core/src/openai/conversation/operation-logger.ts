/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationHistoryManager } from './history-manager.js';
import { ExtendedConversationMessage, MessageType } from './context-history-separator.js';
import { ToolCallEvent } from '../../telemetry/types.js';
import { Config } from '../../config/config.js';
import { logToolCall } from '../../telemetry/loggers.js';

/**
 * 操作类型定义
 */
export enum OperationType {
  TASK_EXECUTION = 'task_execution',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  TASK_CREATION = 'task_creation',
  TASK_COMPLETION = 'task_completion',
  TASK_FAILURE = 'task_failure',
  ERROR_RECOVERY = 'error_recovery',
  RETRY_ATTEMPT = 'retry_attempt',
  USER_INTERACTION = 'user_interaction',
  SYSTEM_OPERATION = 'system_operation'
}

/**
 * 操作状态定义
 */
export enum OperationStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
  RECOVERED = 'recovered'
}

/**
 * 详细操作记录接口
 */
export interface DetailedOperationRecord {
  id: string;
  timestamp: Date;
  operationType: OperationType;
  status: OperationStatus;
  description: string;
  metadata: {
    taskId?: string;
    toolName?: string;
    toolCallId?: string;
    durationMs?: number;
    retryCount?: number;
    errorMessage?: string;
    errorType?: string;
    userInput?: string;
    systemResponse?: string;
    context?: Record<string, any>;
  };
  relatedRecords?: string[]; // IDs of related operation records
}

/**
 * 任务执行详情接口
 */
export interface TaskExecutionDetails {
  taskId: string;
  taskDescription: string;
  startTime: Date;
  endTime?: Date;
  status: OperationStatus;
  toolCalls: DetailedOperationRecord[];
  errorRecords: DetailedOperationRecord[];
  retryRecords: DetailedOperationRecord[];
  recoveryActions: DetailedOperationRecord[];
  totalDurationMs: number;
  successRate: number;
}

/**
 * 恢复操作详情接口
 */
export interface RecoveryActionDetails {
  originalError: string;
  recoveryStrategy: string;
  recoveryActions: DetailedOperationRecord[];
  recoverySuccess: boolean;
  recoveryDurationMs: number;
}

/**
 * 详细操作日志记录器
 * 实现细菌式编程：小巧、模块化、自包含
 * 
 * 核心功能：
 * 1. 详细记录任务执行过程
 * 2. 跟踪工具调用成功/失败
 * 3. 记录错误恢复操作
 * 4. 提供重试机制跟踪
 * 5. 生成详细的审计日志
 */
export class DetailedOperationLogger {
  private operationRecords: Map<string, DetailedOperationRecord> = new Map();
  private taskExecutions: Map<string, TaskExecutionDetails> = new Map();
  private historyManager: ConversationHistoryManager;
  private config: Config;
  private currentTaskId: string | null = null;

  constructor(historyManager: ConversationHistoryManager, config: Config) {
    this.historyManager = historyManager;
    this.config = config;
  }

  /**
   * 开始任务执行记录
   */
  startTaskExecution(taskId: string, taskDescription: string): string {
    const recordId = this.generateRecordId();
    const now = new Date();
    
    const record: DetailedOperationRecord = {
      id: recordId,
      timestamp: now,
      operationType: OperationType.TASK_EXECUTION,
      status: OperationStatus.STARTED,
      description: `Started task execution: ${taskDescription}`,
      metadata: {
        taskId,
        context: {
          taskDescription,
          startedAt: now.toISOString()
        }
      }
    };

    this.operationRecords.set(recordId, record);
    this.currentTaskId = taskId;

    // 初始化任务执行详情
    const taskExecution: TaskExecutionDetails = {
      taskId,
      taskDescription,
      startTime: now,
      status: OperationStatus.STARTED,
      toolCalls: [],
      errorRecords: [],
      retryRecords: [],
      recoveryActions: [],
      totalDurationMs: 0,
      successRate: 0
    };

    this.taskExecutions.set(taskId, taskExecution);

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Task Execution] Started: ${taskDescription} (Task ID: ${taskId})`
    );

    return recordId;
  }

  /**
   * 记录工具调用
   */
  logToolCall(
    toolName: string, 
    args: Record<string, any>, 
    callId?: string,
    taskId?: string
  ): string {
    const recordId = this.generateRecordId();
    const now = new Date();
    const startTime = Date.now();

    const record: DetailedOperationRecord = {
      id: recordId,
      timestamp: now,
      operationType: OperationType.TOOL_CALL,
      status: OperationStatus.STARTED,
      description: `Tool call: ${toolName}`,
      metadata: {
        taskId: taskId || this.currentTaskId || undefined,
        toolName,
        toolCallId: callId || recordId,
        context: {
          args,
          startedAt: now.toISOString(),
          startTimeMs: startTime
        }
      }
    };

    this.operationRecords.set(recordId, record);

    // 添加到任务执行记录
    if (taskId || this.currentTaskId) {
      const taskExecution = this.taskExecutions.get(taskId || this.currentTaskId!);
      if (taskExecution) {
        taskExecution.toolCalls.push(record);
      }
    }

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Tool Call] ${toolName} with args: ${JSON.stringify(args)}`
    );

    return recordId;
  }

  /**
   * 记录工具调用结果
   */
  logToolResult(
    recordId: string, 
    success: boolean, 
    result?: any, 
    error?: Error,
    durationMs?: number
  ): void {
    const record = this.operationRecords.get(recordId);
    if (!record) {
      console.warn(`Operation record not found: ${recordId}`);
      return;
    }

    const now = new Date();
    const actualDurationMs = durationMs || 
      (record.metadata.context?.startTimeMs ? 
        Date.now() - record.metadata.context.startTimeMs : 0);

    // 更新记录状态
    record.status = success ? OperationStatus.COMPLETED : OperationStatus.FAILED;
    record.metadata.durationMs = actualDurationMs;
    
    if (error) {
      record.metadata.errorMessage = error.message;
      record.metadata.errorType = error.name;
    }

    if (success && result) {
      record.metadata.context = {
        ...record.metadata.context,
        result,
        completedAt: now.toISOString()
      };
    }

    // 创建工具结果记录
    const resultRecordId = this.generateRecordId();
    const resultRecord: DetailedOperationRecord = {
      id: resultRecordId,
      timestamp: now,
      operationType: OperationType.TOOL_RESULT,
      status: success ? OperationStatus.COMPLETED : OperationStatus.FAILED,
      description: `Tool result: ${record.metadata.toolName} - ${success ? 'Success' : 'Failed'}`,
      metadata: {
        taskId: record.metadata.taskId,
        toolName: record.metadata.toolName,
        toolCallId: record.metadata.toolCallId,
        durationMs: actualDurationMs,
        errorMessage: error?.message,
        errorType: error?.name,
        context: {
          success,
          result: success ? result : undefined,
          error: error ? { message: error.message, name: error.name } : undefined,
          completedAt: now.toISOString()
        }
      },
      relatedRecords: [recordId]
    };

    this.operationRecords.set(resultRecordId, resultRecord);

    // 记录到现有遥测系统
    if (record.metadata.toolName) {
      const toolCallEvent = new ToolCallEvent({
        request: {
          name: record.metadata.toolName,
          args: record.metadata.context?.args || {},
          prompt_id: this.config.getSessionId() || 'unknown'
        },
        response: {
          result: success ? result : undefined,
          error: error ? { message: error.message, name: error.name } : undefined
        },
        status: success ? 'success' : 'error',
        durationMs: actualDurationMs
      } as any);

      logToolCall(this.config, toolCallEvent);
    }

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Tool Result] ${record.metadata.toolName}: ${success ? 'Success' : `Failed - ${error?.message}`} (Duration: ${actualDurationMs}ms)`
    );

    // 更新任务执行统计
    this.updateTaskExecutionStats(record.metadata.taskId, success);
  }

  /**
   * 记录错误恢复操作
   */
  logRecoveryAction(
    originalRecordId: string,
    recoveryStrategy: string,
    recoveryDescription: string,
    taskId?: string
  ): string {
    const recordId = this.generateRecordId();
    const now = new Date();

    const record: DetailedOperationRecord = {
      id: recordId,
      timestamp: now,
      operationType: OperationType.ERROR_RECOVERY,
      status: OperationStatus.STARTED,
      description: `Recovery action: ${recoveryDescription}`,
      metadata: {
        taskId: taskId || this.currentTaskId || undefined,
        context: {
          recoveryStrategy,
          originalError: originalRecordId,
          startedAt: now.toISOString()
        }
      },
      relatedRecords: [originalRecordId]
    };

    this.operationRecords.set(recordId, record);

    // 添加到任务执行记录
    if (taskId || this.currentTaskId) {
      const taskExecution = this.taskExecutions.get(taskId || this.currentTaskId!);
      if (taskExecution) {
        taskExecution.recoveryActions.push(record);
      }
    }

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Error Recovery] ${recoveryDescription} (Strategy: ${recoveryStrategy})`
    );

    return recordId;
  }

  /**
   * 记录重试操作
   */
  logRetryAttempt(
    originalRecordId: string,
    retryCount: number,
    reason: string,
    taskId?: string
  ): string {
    const recordId = this.generateRecordId();
    const now = new Date();

    const record: DetailedOperationRecord = {
      id: recordId,
      timestamp: now,
      operationType: OperationType.RETRY_ATTEMPT,
      status: OperationStatus.STARTED,
      description: `Retry attempt ${retryCount}: ${reason}`,
      metadata: {
        taskId: taskId || this.currentTaskId || undefined,
        retryCount,
        context: {
          reason,
          originalOperation: originalRecordId,
          startedAt: now.toISOString()
        }
      },
      relatedRecords: [originalRecordId]
    };

    this.operationRecords.set(recordId, record);

    // 添加到任务执行记录
    if (taskId || this.currentTaskId) {
      const taskExecution = this.taskExecutions.get(taskId || this.currentTaskId!);
      if (taskExecution) {
        taskExecution.retryRecords.push(record);
      }
    }

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Retry Attempt] ${retryCount}: ${reason}`
    );

    return recordId;
  }

  /**
   * 完成任务执行
   */
  completeTaskExecution(taskId: string, success: boolean, summary?: string): void {
    const taskExecution = this.taskExecutions.get(taskId);
    if (!taskExecution) {
      console.warn(`Task execution not found: ${taskId}`);
      return;
    }

    const now = new Date();
    taskExecution.endTime = now;
    taskExecution.status = success ? OperationStatus.COMPLETED : OperationStatus.FAILED;
    taskExecution.totalDurationMs = now.getTime() - taskExecution.startTime.getTime();

    // 计算成功率
    const totalToolCalls = taskExecution.toolCalls.length;
    const successfulToolCalls = taskExecution.toolCalls.filter(
      call => call.status === OperationStatus.COMPLETED
    ).length;
    taskExecution.successRate = totalToolCalls > 0 ? successfulToolCalls / totalToolCalls : 1;

    // 创建任务完成记录
    const recordId = this.generateRecordId();
    const record: DetailedOperationRecord = {
      id: recordId,
      timestamp: now,
      operationType: success ? OperationType.TASK_COMPLETION : OperationType.TASK_FAILURE,
      status: success ? OperationStatus.COMPLETED : OperationStatus.FAILED,
      description: `Task ${success ? 'completed' : 'failed'}: ${taskExecution.taskDescription}`,
      metadata: {
        taskId,
        context: {
          summary,
          totalDurationMs: taskExecution.totalDurationMs,
          successRate: taskExecution.successRate,
          toolCallCount: totalToolCalls,
          errorCount: taskExecution.errorRecords.length,
          retryCount: taskExecution.retryRecords.length,
          recoveryActionCount: taskExecution.recoveryActions.length,
          completedAt: now.toISOString()
        }
      }
    };

    this.operationRecords.set(recordId, record);

    // 记录到对话历史
    this.historyManager.addSystemMessage(
      `[Task ${success ? 'Completed' : 'Failed'}] ${taskExecution.taskDescription} - Duration: ${taskExecution.totalDurationMs}ms, Success Rate: ${(taskExecution.successRate * 100).toFixed(1)}%${summary ? `, Summary: ${summary}` : ''}`
    );

    // 清除当前任务ID
    if (this.currentTaskId === taskId) {
      this.currentTaskId = null;
    }
  }

  /**
   * 获取任务执行详情
   */
  getTaskExecutionDetails(taskId: string): TaskExecutionDetails | null {
    return this.taskExecutions.get(taskId) || null;
  }

  /**
   * 获取所有操作记录
   */
  getAllOperationRecords(): DetailedOperationRecord[] {
    return Array.from(this.operationRecords.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * 获取特定类型的操作记录
   */
  getOperationRecordsByType(type: OperationType): DetailedOperationRecord[] {
    return this.getAllOperationRecords().filter(record => record.operationType === type);
  }

  /**
   * 获取任务相关的所有记录
   */
  getTaskOperationRecords(taskId: string): DetailedOperationRecord[] {
    return this.getAllOperationRecords().filter(
      record => record.metadata.taskId === taskId
    );
  }

  /**
   * 生成操作统计报告
   */
  generateOperationReport(): {
    totalOperations: number;
    operationsByType: Record<OperationType, number>;
    operationsByStatus: Record<OperationStatus, number>;
    taskSummary: {
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      averageSuccessRate: number;
      averageDuration: number;
    };
    errorAnalysis: {
      totalErrors: number;
      errorsByType: Record<string, number>;
      recoverySuccessRate: number;
    };
  } {
    const allRecords = this.getAllOperationRecords();
    const allTasks = Array.from(this.taskExecutions.values());

    // 按类型统计操作
    const operationsByType: Record<OperationType, number> = {} as any;
    Object.values(OperationType).forEach(type => {
      operationsByType[type] = 0;
    });

    // 按状态统计操作
    const operationsByStatus: Record<OperationStatus, number> = {} as any;
    Object.values(OperationStatus).forEach(status => {
      operationsByStatus[status] = 0;
    });

    allRecords.forEach(record => {
      operationsByType[record.operationType]++;
      operationsByStatus[record.status]++;
    });

    // 任务统计
    const completedTasks = allTasks.filter(task => task.status === OperationStatus.COMPLETED);
    const failedTasks = allTasks.filter(task => task.status === OperationStatus.FAILED);
    const averageSuccessRate = allTasks.length > 0 
      ? allTasks.reduce((sum, task) => sum + task.successRate, 0) / allTasks.length 
      : 0;
    const averageDuration = allTasks.length > 0 
      ? allTasks.reduce((sum, task) => sum + task.totalDurationMs, 0) / allTasks.length 
      : 0;

    // 错误分析
    const errorRecords = allRecords.filter(
      record => record.status === OperationStatus.FAILED
    );
    const errorsByType: Record<string, number> = {};
    errorRecords.forEach(record => {
      const errorType = record.metadata.errorType || 'Unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    const recoveryRecords = allRecords.filter(
      record => record.operationType === OperationType.ERROR_RECOVERY
    );
    const successfulRecoveries = recoveryRecords.filter(
      record => record.status === OperationStatus.COMPLETED
    );
    const recoverySuccessRate = recoveryRecords.length > 0 
      ? successfulRecoveries.length / recoveryRecords.length 
      : 0;

    return {
      totalOperations: allRecords.length,
      operationsByType,
      operationsByStatus,
      taskSummary: {
        totalTasks: allTasks.length,
        completedTasks: completedTasks.length,
        failedTasks: failedTasks.length,
        averageSuccessRate,
        averageDuration
      },
      errorAnalysis: {
        totalErrors: errorRecords.length,
        errorsByType,
        recoverySuccessRate
      }
    };
  }

  /**
   * 清理旧记录
   */
  cleanupOldRecords(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAge;
    
    // 清理操作记录
    for (const [id, record] of this.operationRecords.entries()) {
      if (record.timestamp.getTime() < cutoffTime) {
        this.operationRecords.delete(id);
      }
    }

    // 清理任务执行记录
    for (const [taskId, execution] of this.taskExecutions.entries()) {
      if (execution.startTime.getTime() < cutoffTime) {
        this.taskExecutions.delete(taskId);
      }
    }
  }

  /**
   * 私有方法：生成记录ID
   */
  private generateRecordId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 私有方法：更新任务执行统计
   */
  private updateTaskExecutionStats(taskId: string | undefined, success: boolean): void {
    if (!taskId) return;
    
    const taskExecution = this.taskExecutions.get(taskId);
    if (!taskExecution) return;

    // 重新计算成功率
    const totalToolCalls = taskExecution.toolCalls.length;
    const successfulToolCalls = taskExecution.toolCalls.filter(
      call => call.status === OperationStatus.COMPLETED
    ).length;
    taskExecution.successRate = totalToolCalls > 0 ? successfulToolCalls / totalToolCalls : 1;
  }
}
/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  DetailedOperationLogger, 
  OperationType, 
  OperationStatus,
  DetailedOperationRecord,
  TaskExecutionDetails
} from './operation-logger.js';
import { ConversationHistoryManager } from './history-manager.js';
import { Config } from '../../config/config.js';

// Mock dependencies
vi.mock('../../telemetry/loggers.js', () => ({
  logToolCall: vi.fn()
}));

vi.mock('../../config/config.js', () => ({
  Config: vi.fn(() => ({
    getSessionId: () => 'test-session-123'
  }))
}));

describe('DetailedOperationLogger', () => {
  let logger: DetailedOperationLogger;
  let historyManager: ConversationHistoryManager;
  let config: Config;

  beforeEach(() => {
    historyManager = new ConversationHistoryManager(20);
    config = {} as Config;
    logger = new DetailedOperationLogger(historyManager, config);
    
    // Mock console.warn to avoid noise in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task Execution Logging', () => {
    it('should start task execution logging correctly', () => {
      const taskId = 'task-123';
      const taskDescription = 'Create a new React component';

      const recordId = logger.startTaskExecution(taskId, taskDescription);

      expect(recordId).toBeTruthy();
      expect(recordId).toMatch(/^op_\d+_[a-z0-9]+$/);

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails).toBeTruthy();
      expect(taskDetails?.taskId).toBe(taskId);
      expect(taskDetails?.taskDescription).toBe(taskDescription);
      expect(taskDetails?.status).toBe(OperationStatus.STARTED);
      expect(taskDetails?.toolCalls).toEqual([]);
      expect(taskDetails?.errorRecords).toEqual([]);
    });

    it('should complete task execution with success', () => {
      const taskId = 'task-123';
      const taskDescription = 'Create a new React component';

      logger.startTaskExecution(taskId, taskDescription);
      logger.completeTaskExecution(taskId, true, 'Component created successfully');

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails?.status).toBe(OperationStatus.COMPLETED);
      expect(taskDetails?.endTime).toBeTruthy();
      expect(taskDetails?.totalDurationMs).toBeGreaterThan(0);
      expect(taskDetails?.successRate).toBe(1); // No tool calls, so 100% success
    });

    it('should complete task execution with failure', () => {
      const taskId = 'task-123';
      const taskDescription = 'Create a new React component';

      logger.startTaskExecution(taskId, taskDescription);
      logger.completeTaskExecution(taskId, false, 'Failed to create component');

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails?.status).toBe(OperationStatus.FAILED);
      expect(taskDetails?.endTime).toBeTruthy();
    });

    it('should calculate success rate correctly with mixed tool call results', () => {
      const taskId = 'task-123';
      const taskDescription = 'Multi-step task';

      logger.startTaskExecution(taskId, taskDescription);

      // Add successful tool call
      const toolCallId1 = logger.logToolCall('write_file', { path: 'test.txt' }, undefined, taskId);
      logger.logToolResult(toolCallId1, true, 'File created');

      // Add failed tool call
      const toolCallId2 = logger.logToolCall('read_file', { path: 'missing.txt' }, undefined, taskId);
      logger.logToolResult(toolCallId2, false, undefined, new Error('File not found'));

      logger.completeTaskExecution(taskId, true);

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails?.successRate).toBe(0.5); // 1 success out of 2 total
      expect(taskDetails?.toolCalls).toHaveLength(2);
    });
  });

  describe('Tool Call Logging', () => {
    it('should log tool call start correctly', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('write_file', { path: 'test.txt', content: 'Hello' });

      expect(toolCallId).toBeTruthy();
      
      const allRecords = logger.getAllOperationRecords();
      const toolCallRecords = allRecords.filter(r => r.operationType === OperationType.TOOL_CALL);
      expect(toolCallRecords).toHaveLength(1);
      
      const toolCallRecord = toolCallRecords[0];
      expect(toolCallRecord.metadata.toolName).toBe('write_file');
      expect(toolCallRecord.metadata.context?.args).toEqual({ path: 'test.txt', content: 'Hello' });
      expect(toolCallRecord.status).toBe(OperationStatus.STARTED);
    });

    it('should log tool call success correctly', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('write_file', { path: 'test.txt' });
      logger.logToolResult(toolCallId, true, 'File written successfully', undefined, 150);

      const allRecords = logger.getAllOperationRecords();
      const toolResultRecords = allRecords.filter(r => r.operationType === OperationType.TOOL_RESULT);
      expect(toolResultRecords).toHaveLength(1);

      const resultRecord = toolResultRecords[0];
      expect(resultRecord.status).toBe(OperationStatus.COMPLETED);
      expect(resultRecord.metadata.durationMs).toBe(150);
      expect(resultRecord.metadata.context?.success).toBe(true);
      expect(resultRecord.metadata.context?.result).toBe('File written successfully');
    });

    it('should log tool call failure correctly', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('read_file', { path: 'missing.txt' });
      const error = new Error('File not found');
      error.name = 'FileNotFoundError';
      logger.logToolResult(toolCallId, false, undefined, error, 50);

      const allRecords = logger.getAllOperationRecords();
      const toolResultRecords = allRecords.filter(r => r.operationType === OperationType.TOOL_RESULT);
      expect(toolResultRecords).toHaveLength(1);

      const resultRecord = toolResultRecords[0];
      expect(resultRecord.status).toBe(OperationStatus.FAILED);
      expect(resultRecord.metadata.errorMessage).toBe('File not found');
      expect(resultRecord.metadata.errorType).toBe('FileNotFoundError');
      expect(resultRecord.metadata.durationMs).toBe(50);
    });

    it('should handle missing record ID gracefully', () => {
      logger.logToolResult('non-existent-id', true, 'result');
      
      expect(console.warn).toHaveBeenCalledWith('Operation record not found: non-existent-id');
    });
  });

  describe('Error Recovery Logging', () => {
    it('should log recovery actions correctly', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('write_file', { path: '/readonly/test.txt' });
      logger.logToolResult(toolCallId, false, undefined, new Error('Permission denied'));

      const recoveryId = logger.logRecoveryAction(
        toolCallId,
        'change_path',
        'Attempting to write to user directory instead',
        taskId
      );

      expect(recoveryId).toBeTruthy();

      const allRecords = logger.getAllOperationRecords();
      const recoveryRecords = allRecords.filter(r => r.operationType === OperationType.ERROR_RECOVERY);
      expect(recoveryRecords).toHaveLength(1);

      const recoveryRecord = recoveryRecords[0];
      expect(recoveryRecord.metadata.context?.recoveryStrategy).toBe('change_path');
      expect(recoveryRecord.relatedRecords).toContain(toolCallId);
      expect(recoveryRecord.status).toBe(OperationStatus.STARTED);
    });

    it('should track recovery actions in task execution details', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('write_file', { path: '/readonly/test.txt' });
      logger.logRecoveryAction(toolCallId, 'change_path', 'Recovery attempt', taskId);

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails?.recoveryActions).toHaveLength(1);
    });
  });

  describe('Retry Logging', () => {
    it('should log retry attempts correctly', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('network_request', { url: 'https://api.example.com' });
      const retryId = logger.logRetryAttempt(toolCallId, 1, 'Network timeout', taskId);

      expect(retryId).toBeTruthy();

      const allRecords = logger.getAllOperationRecords();
      const retryRecords = allRecords.filter(r => r.operationType === OperationType.RETRY_ATTEMPT);
      expect(retryRecords).toHaveLength(1);

      const retryRecord = retryRecords[0];
      expect(retryRecord.metadata.retryCount).toBe(1);
      expect(retryRecord.metadata.context?.reason).toBe('Network timeout');
      expect(retryRecord.relatedRecords).toContain(toolCallId);
    });

    it('should track retry attempts in task execution details', () => {
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      const toolCallId = logger.logToolCall('network_request', { url: 'https://api.example.com' });
      logger.logRetryAttempt(toolCallId, 1, 'Network timeout', taskId);
      logger.logRetryAttempt(toolCallId, 2, 'Network timeout', taskId);

      const taskDetails = logger.getTaskExecutionDetails(taskId);
      expect(taskDetails?.retryRecords).toHaveLength(2);
    });
  });

  describe('Record Retrieval and Filtering', () => {
    beforeEach(() => {
      // Set up a complex scenario with multiple operations
      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Complex task');

      const toolCallId1 = logger.logToolCall('write_file', { path: 'test1.txt' }, undefined, taskId);
      logger.logToolResult(toolCallId1, true, 'Success');

      const toolCallId2 = logger.logToolCall('read_file', { path: 'missing.txt' }, undefined, taskId);
      logger.logToolResult(toolCallId2, false, undefined, new Error('Not found'));

      logger.logRecoveryAction(toolCallId2, 'create_file', 'Creating missing file', taskId);
      logger.logRetryAttempt(toolCallId2, 1, 'Retry after creation', taskId);

      logger.completeTaskExecution(taskId, true);
    });

    it('should retrieve all operation records in chronological order', () => {
      const allRecords = logger.getAllOperationRecords();
      
      expect(allRecords.length).toBeGreaterThan(5);
      
      // Check chronological order
      for (let i = 1; i < allRecords.length; i++) {
        expect(allRecords[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          allRecords[i - 1].timestamp.getTime()
        );
      }
    });

    it('should filter records by operation type', () => {
      const toolCallRecords = logger.getOperationRecordsByType(OperationType.TOOL_CALL);
      const toolResultRecords = logger.getOperationRecordsByType(OperationType.TOOL_RESULT);
      const recoveryRecords = logger.getOperationRecordsByType(OperationType.ERROR_RECOVERY);

      expect(toolCallRecords).toHaveLength(2);
      expect(toolResultRecords).toHaveLength(2);
      expect(recoveryRecords).toHaveLength(1);
      
      toolCallRecords.forEach(record => {
        expect(record.operationType).toBe(OperationType.TOOL_CALL);
      });
    });

    it('should retrieve task-specific records', () => {
      const taskRecords = logger.getTaskOperationRecords('task-123');
      
      expect(taskRecords.length).toBeGreaterThan(0);
      taskRecords.forEach(record => {
        expect(record.metadata.taskId).toBe('task-123');
      });
    });

    it('should return empty array for non-existent task', () => {
      const records = logger.getTaskOperationRecords('non-existent-task');
      expect(records).toEqual([]);
    });
  });

  describe('Operation Report Generation', () => {
    beforeEach(() => {
      // Create multiple tasks with different outcomes
      
      // Task 1: Successful task
      const taskId1 = 'task-1';
      logger.startTaskExecution(taskId1, 'Successful task');
      const toolCall1 = logger.logToolCall('write_file', { path: 'test1.txt' }, undefined, taskId1);
      logger.logToolResult(toolCall1, true, 'Success');
      logger.completeTaskExecution(taskId1, true);

      // Task 2: Failed task with recovery
      const taskId2 = 'task-2';
      logger.startTaskExecution(taskId2, 'Failed task');
      const toolCall2 = logger.logToolCall('read_file', { path: 'missing.txt' }, undefined, taskId2);
      logger.logToolResult(toolCall2, false, undefined, new Error('FileNotFoundError'));
      logger.logRecoveryAction(toolCall2, 'create_file', 'Recovery attempt', taskId2);
      logger.completeTaskExecution(taskId2, false);
    });

    it('should generate comprehensive operation report', () => {
      const report = logger.generateOperationReport();

      expect(report.totalOperations).toBeGreaterThan(0);
      expect(report.operationsByType).toBeDefined();
      expect(report.operationsByStatus).toBeDefined();
      expect(report.taskSummary).toBeDefined();
      expect(report.errorAnalysis).toBeDefined();

      // Check task summary
      expect(report.taskSummary.totalTasks).toBe(2);
      expect(report.taskSummary.completedTasks).toBe(1);
      expect(report.taskSummary.failedTasks).toBe(1);

      // Check error analysis
      expect(report.errorAnalysis.totalErrors).toBeGreaterThan(0);
      expect(report.errorAnalysis.errorsByType).toBeDefined();
    });

    it('should calculate correct operation counts by type', () => {
      const report = logger.generateOperationReport();

      expect(report.operationsByType[OperationType.TASK_EXECUTION]).toBe(2);
      expect(report.operationsByType[OperationType.TOOL_CALL]).toBe(2);
      expect(report.operationsByType[OperationType.TOOL_RESULT]).toBe(2);
      expect(report.operationsByType[OperationType.ERROR_RECOVERY]).toBe(1);
    });

    it('should calculate correct success rates', () => {
      const report = logger.generateOperationReport();

      expect(report.taskSummary.averageSuccessRate).toBeGreaterThan(0);
      expect(report.taskSummary.averageSuccessRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Cleanup and Maintenance', () => {
    beforeEach(() => {
      // Create some old records
      const taskId = 'old-task';
      logger.startTaskExecution(taskId, 'Old task');
      
      // Mock old timestamps
      const oldRecord = logger.getAllOperationRecords()[0];
      if (oldRecord) {
        oldRecord.timestamp = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }
    });

    it('should cleanup old records correctly', () => {
      const initialCount = logger.getAllOperationRecords().length;
      expect(initialCount).toBeGreaterThan(0);

      // Cleanup records older than 24 hours
      logger.cleanupOldRecords(24 * 60 * 60 * 1000);

      const finalCount = logger.getAllOperationRecords().length;
      expect(finalCount).toBeLessThan(initialCount);
    });

    it('should preserve recent records during cleanup', () => {
      // Add a recent record
      const recentTaskId = 'recent-task';
      logger.startTaskExecution(recentTaskId, 'Recent task');

      const beforeCleanup = logger.getTaskExecutionDetails(recentTaskId);
      expect(beforeCleanup).toBeTruthy();

      logger.cleanupOldRecords(24 * 60 * 60 * 1000);

      const afterCleanup = logger.getTaskExecutionDetails(recentTaskId);
      expect(afterCleanup).toBeTruthy();
    });
  });

  describe('Integration with ConversationHistoryManager', () => {
    it('should add messages to conversation history', () => {
      const spy = vi.spyOn(historyManager, 'addSystemMessage');

      const taskId = 'task-123';
      logger.startTaskExecution(taskId, 'Test task');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Task Execution] Started: Test task')
      );
    });

    it('should add tool call messages to history', () => {
      const spy = vi.spyOn(historyManager, 'addSystemMessage');

      const toolCallId = logger.logToolCall('write_file', { path: 'test.txt' });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Tool Call] write_file with args:')
      );
    });

    it('should add tool result messages to history', () => {
      const spy = vi.spyOn(historyManager, 'addSystemMessage');

      const toolCallId = logger.logToolCall('write_file', { path: 'test.txt' });
      logger.logToolResult(toolCallId, true, 'Success', undefined, 100);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Tool Result] write_file: Success (Duration: 100ms)')
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle task completion without start', () => {
      logger.completeTaskExecution('non-existent-task', true);
      
      expect(console.warn).toHaveBeenCalledWith('Task execution not found: non-existent-task');
    });

    it('should handle tool result logging without tool call', () => {
      logger.logToolResult('non-existent-call', true, 'result');
      
      expect(console.warn).toHaveBeenCalledWith('Operation record not found: non-existent-call');
    });

    it('should generate record IDs correctly', () => {
      const taskId = 'task-123';
      const recordId1 = logger.startTaskExecution(taskId, 'Task 1');
      const recordId2 = logger.startTaskExecution(taskId + '2', 'Task 2');

      expect(recordId1).not.toBe(recordId2);
      expect(recordId1).toMatch(/^op_\d+_[a-z0-9]+$/);
      expect(recordId2).toMatch(/^op_\d+_[a-z0-9]+$/);
    });

    it('should handle empty reports gracefully', () => {
      const emptyLogger = new DetailedOperationLogger(historyManager, config);
      const report = emptyLogger.generateOperationReport();

      expect(report.totalOperations).toBe(0);
      expect(report.taskSummary.totalTasks).toBe(0);
      expect(report.taskSummary.averageSuccessRate).toBe(0);
      expect(report.errorAnalysis.totalErrors).toBe(0);
    });
  });
});
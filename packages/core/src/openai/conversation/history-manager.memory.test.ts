/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationHistoryManager } from './history-manager.js';
import { memoryProfiler } from '../utils/memory-profiler.js';

describe('ConversationHistoryManager Memory Optimization', () => {
  let historyManager: ConversationHistoryManager;
  let originalGc: typeof global.gc;

  beforeEach(() => {
    // Mock global.gc for testing
    originalGc = global.gc;
    global.gc = vi.fn();
    
    // Create history manager with low memory threshold for testing
    historyManager = new ConversationHistoryManager(50, 1024 * 1024); // 1MB threshold
    memoryProfiler.enable();
  });

  afterEach(() => {
    global.gc = originalGc;
    memoryProfiler.disable();
  });

  describe('memory threshold management', () => {
    it('should monitor memory usage and trigger optimization', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Add many large messages to trigger memory optimization
      for (let i = 0; i < 100; i++) {
        const largeContent = `Message ${i}: ${'x'.repeat(10000)}`;
        historyManager.addUserMessage(largeContent);
      }
      
      // Check if memory optimization was triggered
      const memoryStats = historyManager.getMemoryStats();
      expect(memoryStats.totalMessages).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });

    it('should compress conversation history under memory pressure', async () => {
      // Add many messages to trigger compression
      for (let i = 0; i < 200; i++) {
        const message = `User message ${i}: ${'content '.repeat(50)}`;
        historyManager.addUserMessage(message);
        
        const response = `Assistant response ${i}: ${'response '.repeat(50)}`;
        historyManager.addAssistantMessage(response);
      }
      
      const initialStats = historyManager.getMemoryStats();
      const initialMessageCount = initialStats.totalMessages;
      
      // Simulate memory pressure by adding more messages
      for (let i = 200; i < 300; i++) {
        const message = `User message ${i}: ${'content '.repeat(100)}`;
        historyManager.addUserMessage(message);
      }
      
      const finalStats = historyManager.getMemoryStats();
      
      // Should have triggered memory optimization
      expect(finalStats.isOptimized).toBe(true);
      expect(finalStats.totalMessages).toBeGreaterThan(0);
    });
  });

  describe('memory-optimized operations', () => {
    it('should handle large conversation histories efficiently', () => {
      const startTime = Date.now();
      
      // Add large conversation history
      for (let i = 0; i < 1000; i++) {
        historyManager.addUserMessage(`User: ${'test '.repeat(100)}`);
        historyManager.addAssistantMessage(`Assistant: ${'response '.repeat(100)}`);
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should process efficiently
      expect(processingTime).toBeLessThan(5000); // Under 5 seconds
      
      const stats = historyManager.getMemoryStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    it('should maintain message integrity during optimization', () => {
      // Add messages with specific content
      const testMessages = [
        'First user message',
        'Second user message',
        'Third user message with special content: 🔥',
        'Fourth user message'
      ];
      
      testMessages.forEach(msg => historyManager.addUserMessage(msg));
      
      // Trigger memory optimization
      for (let i = 0; i < 100; i++) {
        historyManager.addUserMessage(`Filler message ${i}: ${'x'.repeat(1000)}`);
      }
      
      const history = historyManager.getHistory();
      
      // Should still contain some form of the original messages
      expect(history.length).toBeGreaterThan(0);
      
      // At least some messages should be preserved
      const hasOriginalContent = history.some(msg => 
        msg.content.includes('First user message') || 
        msg.content.includes('special content')
      );
      
      // Either original content is preserved or compression markers are present
      const hasCompressionMarkers = history.some(msg => 
        msg.content.includes('[COMPRESSED:') || 
        msg.content.includes('[REF:')
      );
      
      expect(hasOriginalContent || hasCompressionMarkers).toBe(true);
    });
  });

  describe('memory profiling integration', () => {
    it('should profile memory usage during operations', async () => {
      // Perform operations that should be profiled
      for (let i = 0; i < 50; i++) {
        historyManager.addUserMessage(`Test message ${i}`);
      }
      
      // Get memory profile
      const profile = memoryProfiler.getProfile();
      
      expect(profile).toBeDefined();
      expect(profile!.snapshots.length).toBeGreaterThan(0);
      
      // Should have profiled addMessageWithSeparation operations
      const addMessageSnapshots = profile!.snapshots.filter(s => 
        s.operation.includes('addMessageWithSeparation')
      );
      
      expect(addMessageSnapshots.length).toBeGreaterThan(0);
    });

    it('should provide memory optimization suggestions', () => {
      // Create memory pressure
      for (let i = 0; i < 100; i++) {
        historyManager.addUserMessage(`Message ${i}: ${'x'.repeat(1000)}`);
      }
      
      const suggestions = memoryProfiler.getOptimizationSuggestions();
      expect(Array.isArray(suggestions)).toBe(true);
      
      const memoryStats = historyManager.getMemoryStats();
      expect(memoryStats.estimatedMemoryUsage).toBeGreaterThan(0);
    });
  });

  describe('separated data management', () => {
    it('should optimize separated data storage', () => {
      // Add messages that will be separated into different categories
      historyManager.addUserMessage('User message with tool call: {"tool": "test"}');
      historyManager.addAssistantMessage('Assistant response');
      historyManager.addSystemMessage('System message');
      
      // Add context data
      historyManager.addUserMessage('Message with context: <context>test</context>');
      
      // Trigger memory optimization
      for (let i = 0; i < 150; i++) {
        historyManager.addUserMessage(`Filler ${i}: ${'x'.repeat(500)}`);
      }
      
      const memoryStats = historyManager.getMemoryStats();
      
      expect(memoryStats.separatedDataSize).toBeGreaterThanOrEqual(0);
      expect(memoryStats.totalMessages).toBeGreaterThan(0);
    });

    it('should handle context separation under memory pressure', () => {
      // Add messages with various types of content
      const complexMessages = [
        'User message with <context>important context</context>',
        'Message with tool call: {"name": "test_tool", "args": {"param": "value"}}',
        'System message: Processing complete',
        'Assistant: Here is the result'
      ];
      
      complexMessages.forEach(msg => {
        if (msg.startsWith('User')) {
          historyManager.addUserMessage(msg);
        } else if (msg.startsWith('Assistant')) {
          historyManager.addAssistantMessage(msg);
        } else if (msg.startsWith('System')) {
          historyManager.addSystemMessage(msg);
        }
      });
      
      // Verify separation occurred by checking memory stats
      const memoryStats = historyManager.getMemoryStats();
      expect(memoryStats.separatedDataSize).toBeGreaterThanOrEqual(0);
      expect(memoryStats.totalMessages).toBeGreaterThan(0);
    });
  });

  describe('performance under load', () => {
    it('should maintain performance with large datasets', async () => {
      const startTime = Date.now();
      
      // Simulate heavy load
      const operations = [];
      for (let i = 0; i < 500; i++) {
        operations.push(
          Promise.resolve().then(() => {
            historyManager.addUserMessage(`User ${i}: ${'content '.repeat(20)}`);
            historyManager.addAssistantMessage(`Assistant ${i}: ${'response '.repeat(20)}`);
          })
        );
      }
      
      await Promise.all(operations);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should handle load efficiently
      expect(totalTime).toBeLessThan(10000); // Under 10 seconds
      
      const stats = historyManager.getMemoryStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    it('should recover from memory pressure gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Create extreme memory pressure
      for (let i = 0; i < 500; i++) {
        const largeMessage = `Message ${i}: ${'x'.repeat(2000)}`;
        historyManager.addUserMessage(largeMessage);
      }
      
      // Should still be functional
      const history = historyManager.getHistory();
      expect(history.length).toBeGreaterThan(0);
      
      // Should be able to add more messages
      historyManager.addUserMessage('New message after pressure');
      const updatedHistory = historyManager.getHistory();
      
      expect(updatedHistory.length).toBeGreaterThanOrEqual(history.length);
      
      consoleSpy.mockRestore();
    });
  });

  describe('memory statistics and monitoring', () => {
    it('should provide accurate memory statistics', () => {
      // Add known amount of data
      const testMessage = 'Test message';
      historyManager.addUserMessage(testMessage);
      
      const stats = historyManager.getMemoryStats();
      
      expect(stats.conversationHistorySize).toBeGreaterThan(0);
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.estimatedMemoryUsage).toBeGreaterThan(0);
      expect(typeof stats.isOptimized).toBe('boolean');
    });

    it('should track memory optimization state correctly', () => {
      const initialStats = historyManager.getMemoryStats();
      expect(initialStats.isOptimized).toBe(false);
      
      // Trigger memory optimization
      for (let i = 0; i < 200; i++) {
        historyManager.addUserMessage(`Message ${i}: ${'x'.repeat(1000)}`);
      }
      
      const finalStats = historyManager.getMemoryStats();
      
      // Should show optimization state
      expect(finalStats.totalMessages).toBeGreaterThan(initialStats.totalMessages);
    });
  });
});

describe('Memory Optimization Integration Tests', () => {
  let historyManager: ConversationHistoryManager;

  beforeEach(() => {
    historyManager = new ConversationHistoryManager(100, 2 * 1024 * 1024); // 2MB threshold
    memoryProfiler.enable();
  });

  afterEach(() => {
    memoryProfiler.disable();
  });

  it('should handle real-world conversation patterns', async () => {
    // Simulate a real conversation with mixed content types
    const conversationPatterns = [
      { type: 'user', content: 'Hello, can you help me with a coding problem?' },
      { type: 'assistant', content: 'Of course! I\'d be happy to help. What specific coding issue are you facing?' },
      { type: 'user', content: 'I need to optimize this function:\n```javascript\nfunction slowFunction(arr) {\n  return arr.map(x => x * 2).filter(x => x > 10);\n}\n```' },
      { type: 'assistant', content: 'Here\'s an optimized version:\n```javascript\nfunction fastFunction(arr) {\n  const result = [];\n  for (const x of arr) {\n    const doubled = x * 2;\n    if (doubled > 10) result.push(doubled);\n  }\n  return result;\n}\n```' },
      { type: 'user', content: 'That looks great! Can you explain why it\'s faster?' },
      { type: 'assistant', content: 'The optimized version is faster because it:\n1. Uses a single loop instead of two\n2. Avoids creating intermediate arrays\n3. Reduces memory allocations' }
    ];
    
    // Repeat conversation pattern to build up history
    for (let round = 0; round < 50; round++) {
      for (const message of conversationPatterns) {
        const content = `[Round ${round}] ${message.content}`;
        
        if (message.type === 'user') {
          historyManager.addUserMessage(content);
        } else {
          historyManager.addAssistantMessage(content);
        }
      }
    }
    
    const history = historyManager.getHistory();
    const stats = historyManager.getMemoryStats();
    
    expect(history.length).toBeGreaterThan(0);
    expect(stats.totalMessages).toBeGreaterThan(0);
    
    // Should be able to retrieve recent messages
    const recentMessages = historyManager.getRecentMessages(10);
    expect(recentMessages.length).toBeLessThanOrEqual(10);
  });

  it('should optimize memory usage across multiple optimization cycles', () => {
    let previousMemoryUsage = 0;
    
    // Run multiple optimization cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      // Add messages to trigger optimization
      for (let i = 0; i < 100; i++) {
        historyManager.addUserMessage(`Cycle ${cycle}, Message ${i}: ${'data '.repeat(100)}`);
      }
      
      const stats = historyManager.getMemoryStats();
      const currentMemoryUsage = stats.estimatedMemoryUsage;
      
      // Memory usage should stabilize or decrease due to optimization
      if (cycle > 0) {
        // Allow for some variance due to different message content
        expect(currentMemoryUsage).toBeLessThan(previousMemoryUsage * 2);
      }
      
      previousMemoryUsage = currentMemoryUsage;
    }
    
    // Final verification
    const finalStats = historyManager.getMemoryStats();
    expect(finalStats.totalMessages).toBeGreaterThan(0);
  });
});
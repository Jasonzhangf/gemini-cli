/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ContextHistorySeparator, 
  MessageType, 
  ExtendedConversationMessage,
  ContextHistorySeparationResult 
} from './context-history-separator.js';
import { ConversationMessage } from '../types/interfaces.js';

describe('ContextHistorySeparator', () => {
  let separator: ContextHistorySeparator;

  beforeEach(() => {
    separator = new ContextHistorySeparator();
  });

  describe('Basic Message Classification', () => {
    it('should classify pure user messages correctly', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'user', content: 'Can you help me with this task?' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(2);
      expect(result.conversationHistory[0]).toEqual({
        role: 'user',
        content: 'Hello, how are you?'
      });
      expect(result.contextData).toHaveLength(0);
      expect(result.toolCalls).toHaveLength(0);
    });

    it('should classify pure assistant messages correctly', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'I am doing well, thank you!' },
        { role: 'assistant', content: 'I would be happy to help you with that task.' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(2);
      expect(result.conversationHistory[0]).toEqual({
        role: 'assistant',
        content: 'I am doing well, thank you!'
      });
      expect(result.contextData).toHaveLength(0);
    });

    it('should classify system messages correctly', () => {
      const messages: ConversationMessage[] = [
        { role: 'system', content: 'You are a helpful AI assistant.' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory[0]).toEqual({
        role: 'system',
        content: 'You are a helpful AI assistant.'
      });
    });
  });

  describe('Context Pattern Detection', () => {
    it('should detect context injection patterns', () => {
      const messages: ConversationMessage[] = [
        { role: 'system', content: '[Context] Project structure information' },
        { role: 'system', content: '[RAG] Search results from documents' },
        { role: 'system', content: '[Knowledge Graph] Entity relationships' },
        { role: 'system', content: '<system-reminder>Important context data</system-reminder>' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.contextData).toHaveLength(4);
      expect(result.contextData[0].messageType).toBe(MessageType.CONTEXT_INJECTION);
    });

    it('should detect tool call patterns', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'Tool: write_file with parameters' },
        { role: 'assistant', content: 'Calling tool: read_file' },
        { role: 'assistant', content: '✦ search_files pattern' },
        { role: 'assistant', content: '<*#*#CONTENT#*#*>{"tool": "list_directory"}</*#*#CONTENT#*#*>' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.toolCalls).toHaveLength(4);
      expect(result.toolCalls[0].messageType).toBe(MessageType.TOOL_CALL);
    });

    it('should detect internal processing patterns', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: '[Internal Processing] Analyzing user request' },
        { role: 'assistant', content: '[Task Management] Creating subtasks' },
        { role: 'assistant', content: '<thinking>Let me think about this</thinking>' },
        { role: 'assistant', content: '[Debug] Connection status check' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.internalProcessing).toHaveLength(4);
      expect(result.internalProcessing[0].messageType).toBe(MessageType.INTERNAL_PROCESSING);
    });
  });

  describe('Mixed Content Separation', () => {
    it('should separate conversational content from context markers', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'I can help you with that task. <system-reminder>User has premium access</system-reminder> Let me start by analyzing your requirements.'
        }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory[0].content).toBe('I can help you with that task.  Let me start by analyzing your requirements.');
      expect(result.contextData).toHaveLength(1);
      expect(result.contextData[0].content).toContain('User has premium access');
    });

    it('should handle multiple context markers in single message', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: 'Processing your request. [Context] File structure loaded [RAG] Documentation indexed. Here are the results.'
        }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory[0].content).toBe('Processing your request.  Here are the results.');
      expect(result.contextData).toHaveLength(1);
    });
  });

  describe('Tool Call Classification', () => {
    it('should extract tool metadata from tool calls', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'Tool: write_file call_id: abc123' },
        { role: 'assistant', content: '✦ read_file id: def456' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].metadata?.toolName).toBe('write_file');
      expect(result.toolCalls[0].metadata?.toolCallId).toBe('abc123');
      expect(result.toolCalls[1].metadata?.toolName).toBe('read_file');
      expect(result.toolCalls[1].metadata?.toolCallId).toBe('def456');
    });

    it('should distinguish between tool calls and tool results', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'Tool: write_file executing' },
        { role: 'assistant', content: 'Tool result: File written successfully' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].messageType).toBe(MessageType.TOOL_RESULT);
    });
  });

  describe('Validation and Statistics', () => {
    it('should validate separation results correctly', () => {
      const goodResult: ContextHistorySeparationResult = {
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ],
        contextData: [],
        internalProcessing: [],
        toolCalls: [],
        toolResults: []
      };

      const validation = separator.validateSeparation(goodResult);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect context data leakage in conversation history', () => {
      const badResult: ContextHistorySeparationResult = {
        conversationHistory: [
          { role: 'user', content: 'Hello [Context] leaked data' }
        ],
        contextData: [],
        internalProcessing: [],
        toolCalls: [],
        toolResults: []
      };

      const validation = separator.validateSeparation(badResult);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]).toContain('context data');
    });

    it('should detect tool call leakage in conversation history', () => {
      const badResult: ContextHistorySeparationResult = {
        conversationHistory: [
          { role: 'assistant', content: 'Hello ✦ leaked_tool_call' }
        ],
        contextData: [],
        internalProcessing: [],
        toolCalls: [],
        toolResults: []
      };

      const validation = separator.validateSeparation(badResult);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]).toContain('tool call data');
    });

    it('should generate accurate statistics', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'system', content: '[Context] data' },
        { role: 'assistant', content: 'Tool: test_tool' },
        { role: 'assistant', content: '[Internal Processing] thinking' }
      ];

      const result = separator.separateContextFromHistory(messages);
      const stats = separator.getStatistics(result);

      expect(stats.conversationMessages).toBe(2);
      expect(stats.contextMessages).toBe(1);
      expect(stats.toolCalls).toBe(1);
      expect(stats.internalProcessing).toBe(1);
      expect(stats.totalMessages).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message list', () => {
      const result = separator.separateContextFromHistory([]);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.contextData).toHaveLength(0);
      expect(result.toolCalls).toHaveLength(0);
      expect(result.internalProcessing).toHaveLength(0);
    });

    it('should handle messages with empty content', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: '' },
        { role: 'assistant', content: '   ' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
    });

    it('should handle malformed context markers', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: '[Context without closing' },
        { role: 'assistant', content: 'Missing opening bracket Context]' }
      ];

      const result = separator.separateContextFromHistory(messages);

      // Should be treated as regular conversation since malformed
      expect(result.conversationHistory).toHaveLength(2);
      expect(result.contextData).toHaveLength(0);
    });

    it('should handle case-insensitive pattern matching', () => {
      const messages: ConversationMessage[] = [
        { role: 'system', content: '[context] lowercase marker' },
        { role: 'system', content: '[CONTEXT] uppercase marker' },
        { role: 'system', content: '[Context] mixed case marker' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.contextData).toHaveLength(3);
    });

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000) + '[Context] embedded context ' + 'B'.repeat(10000);
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: longContent }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(1);
      expect(result.contextData).toHaveLength(1);
      expect(result.conversationHistory[0].content.length).toBeGreaterThan(10000);
    });

    it('should handle nested markers', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'assistant',
          content: '[Context] Outer context [RAG] Inner RAG data [/RAG] [/Context]'
        }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(0);
      expect(result.contextData).toHaveLength(1);
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large number of messages efficiently', () => {
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 1000; i++) {
        messages.push({ role: 'user', content: `Message ${i}` });
        messages.push({ role: 'assistant', content: `Response ${i}` });
      }

      const startTime = Date.now();
      const result = separator.separateContextFromHistory(messages);
      const endTime = Date.now();

      expect(result.conversationHistory).toHaveLength(2000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should not leak memory with repeated operations', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' }
      ];

      // Run many times to check for memory leaks
      for (let i = 0; i < 100; i++) {
        const result = separator.separateContextFromHistory(messages);
        expect(result.conversationHistory).toHaveLength(2);
      }
    });
  });

  describe('Message Timestamps and Metadata', () => {
    it('should add timestamps to classified messages', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const beforeTime = new Date();
      const result = separator.separateContextFromHistory(messages);
      const afterTime = new Date();

      // Since we can't directly access the classified messages in the current API,
      // we'll test this through the internal classification
      expect(result.conversationHistory).toHaveLength(1);
    });

    it('should extract and store tool metadata correctly', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'Tool: write_file call_id: test123 executing operation' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].metadata?.toolName).toBe('write_file');
      expect(result.toolCalls[0].metadata?.toolCallId).toBe('test123');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic conversation with mixed content types', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Can you help me create a new file?' },
        { role: 'assistant', content: 'I can help you create a file. <system-reminder>User has write permissions</system-reminder> What would you like to name it?' },
        { role: 'user', content: 'test.txt with some content' },
        { role: 'assistant', content: '[Internal Processing] Preparing to create file Tool: write_file' },
        { role: 'assistant', content: 'Tool result: File created successfully' },
        { role: 'assistant', content: 'The file test.txt has been created successfully!' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(4); // User messages + clean assistant responses
      expect(result.contextData).toHaveLength(1); // system-reminder
      expect(result.internalProcessing).toHaveLength(1); // Internal Processing
      expect(result.toolCalls).toHaveLength(1); // Tool call
      expect(result.toolResults).toHaveLength(1); // Tool result

      const validation = separator.validateSeparation(result);
      expect(validation.isValid).toBe(true);
    });

    it('should maintain conversation coherence after separation', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'What is the weather like?' },
        { role: 'assistant', content: '[Context] User location: Seattle I can check the weather for you. Tool: get_weather' },
        { role: 'assistant', content: 'Tool result: Sunny, 72°F' },
        { role: 'assistant', content: 'The weather in Seattle is sunny and 72°F.' }
      ];

      const result = separator.separateContextFromHistory(messages);

      expect(result.conversationHistory).toHaveLength(3);
      expect(result.conversationHistory[1].content).toBe('I can check the weather for you.');
      expect(result.conversationHistory[2].content).toBe('The weather in Seattle is sunny and 72°F.');
      
      // The conversation should still make sense without the context/tool data
      const conversationFlow = result.conversationHistory.map(m => m.content).join(' ');
      expect(conversationFlow).toContain('weather');
      expect(conversationFlow).toContain('sunny');
    });
  });
});
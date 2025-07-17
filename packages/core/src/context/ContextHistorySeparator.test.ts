/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest';
import { ContextHistorySeparator, ContextType, ContextualMessage } from './ContextHistorySeparator';

describe('ContextHistorySeparator', () => {
  const separator = new ContextHistorySeparator();

  describe('filterContextFromHistory', () => {
    it('should filter out system context messages', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'System context', contextType: ContextType.SYSTEM },
        { role: 'user', content: 'User message', contextType: ContextType.USER },
        { role: 'assistant', content: 'Model response', contextType: ContextType.MODEL },
      ];

      const filtered = separator.filterContextFromHistory(messages);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].content).toBe('User message');
      expect(filtered[1].content).toBe('Model response');
    });

    it('should filter out all context types that should not be in history', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'System context', contextType: ContextType.SYSTEM },
        { role: 'system', content: 'Static context', contextType: ContextType.STATIC },
        { role: 'system', content: 'Dynamic context', contextType: ContextType.DYNAMIC },
        { role: 'system', content: 'RAG results', contextType: ContextType.RAG },
        { role: 'system', content: 'Knowledge graph', contextType: ContextType.KNOWLEDGE_GRAPH },
        { role: 'user', content: 'User message', contextType: ContextType.USER },
        { role: 'assistant', content: 'Model response', contextType: ContextType.MODEL },
        { role: 'function', content: 'Tool call', contextType: ContextType.TOOL_CALL },
        { role: 'tool', content: 'Tool result', contextType: ContextType.TOOL_RESULT },
      ];

      const filtered = separator.filterContextFromHistory(messages);
      
      expect(filtered).toHaveLength(4);
      expect(filtered.map(m => m.contextType)).toEqual([
        ContextType.USER,
        ContextType.MODEL,
        ContextType.TOOL_CALL,
        ContextType.TOOL_RESULT,
      ]);
    });

    it('should handle messages without explicit contextType', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'System message without type' },
        { role: 'user', content: 'User message without type' },
        { role: 'assistant', content: 'Assistant message without type' },
        { role: 'function', content: 'Function message without type' },
        { role: 'unknown', content: 'Unknown role without type' },
      ];

      const filtered = separator.filterContextFromHistory(messages);
      
      expect(filtered).toHaveLength(3);
      expect(filtered.map(m => m.role)).toEqual(['user', 'assistant', 'function']);
    });
  });

  describe('classifyMessageType', () => {
    it('should classify messages based on role', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
        { role: 'function', content: 'Function message' },
        { role: 'tool', content: 'Tool message' },
      ];

      const classified = messages.map(m => separator.classifyMessageType(m));
      
      expect(classified[0].contextType).toBe(ContextType.SYSTEM);
      expect(classified[1].contextType).toBe(ContextType.USER);
      expect(classified[2].contextType).toBe(ContextType.MODEL);
      expect(classified[3].contextType).toBe(ContextType.TOOL_CALL);
      expect(classified[4].contextType).toBe(ContextType.TOOL_RESULT);
    });

    it('should classify system messages with special content', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'RAG results: some data' },
        { role: 'system', content: 'Knowledge Graph: some data' },
        { role: 'system', content: 'Regular system message' },
        { role: 'system', content: 'RAG data', metadata: { source: 'rag' } },
      ];

      const classified = messages.map(m => separator.classifyMessageType(m));
      
      expect(classified[0].contextType).toBe(ContextType.RAG);
      expect(classified[1].contextType).toBe(ContextType.KNOWLEDGE_GRAPH);
      expect(classified[2].contextType).toBe(ContextType.SYSTEM);
      expect(classified[3].contextType).toBe(ContextType.RAG);
    });

    it('should not reclassify already classified messages', () => {
      const message: ContextualMessage = {
        role: 'system',
        content: 'Already classified',
        contextType: ContextType.STATIC,
      };

      const classified = separator.classifyMessageType(message);
      expect(classified.contextType).toBe(ContextType.STATIC);
    });
  });

  describe('processMessages', () => {
    it('should separate messages into history and context', () => {
      const messages: ContextualMessage[] = [
        { role: 'system', content: 'System context' },
        { role: 'system', content: 'RAG results: some data' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Model response' },
        { role: 'function', content: 'Tool call' },
        { role: 'tool', content: 'Tool result' },
      ];

      const { history, context } = separator.processMessages(messages);
      
      expect(history).toHaveLength(4);
      expect(context).toHaveLength(2);
      
      expect(history.map(m => m.role)).toEqual(['user', 'assistant', 'function', 'tool']);
      expect(context.map(m => m.role)).toEqual(['system', 'system']);
    });
  });
});
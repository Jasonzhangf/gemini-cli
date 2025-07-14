/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TFIDFVectorProvider } from './tfidfVectorProvider.js';

describe('TFIDFVectorProvider', () => {
  let provider: TFIDFVectorProvider;

  beforeEach(async () => {
    provider = new TFIDFVectorProvider({
      maxFeatures: 100,
      minDocFreq: 1,
      maxDocFreq: 0.95
    });
    await provider.initialize();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const newProvider = new TFIDFVectorProvider();
      await expect(newProvider.initialize()).resolves.not.toThrow();
    });
  });

  describe('indexDocument', () => {
    it('should index a document successfully', async () => {
      await provider.indexDocument('doc1', 'This is a test document about machine learning', {
        type: 'file',
        category: 'AI'
      });

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(1);
      expect(stats.vectorDimensions).toBeGreaterThan(0);
    });

    it('should update existing document', async () => {
      await provider.indexDocument('doc1', 'Original content');
      await provider.indexDocument('doc1', 'Updated content');

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(1);
    });

    it('should handle multiple documents', async () => {
      await provider.indexDocument('doc1', 'First document about programming');
      await provider.indexDocument('doc2', 'Second document about testing');
      await provider.indexDocument('doc3', 'Third document about debugging');

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(3);
    });

    it('should handle Chinese content', async () => {
      await provider.indexDocument('doc1', '这是一个关于机器学习的测试文档');
      await provider.indexDocument('doc2', '这是另一个关于深度学习的文档');

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(2);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Index test documents
      await provider.indexDocument('doc1', 'JavaScript programming language tutorial', {
        type: 'tutorial',
        language: 'javascript'
      });
      await provider.indexDocument('doc2', 'Python machine learning algorithms', {
        type: 'guide',
        language: 'python'
      });
      await provider.indexDocument('doc3', 'React component testing best practices', {
        type: 'tutorial',
        language: 'javascript'
      });
      await provider.indexDocument('doc4', 'Node.js server development guide', {
        type: 'guide',
        language: 'javascript'
      });
    });

    it('should search and return relevant documents', async () => {
      const results = await provider.search({
        text: 'JavaScript programming',
        topK: 10
      });

      expect(results.query).toBe('JavaScript programming');
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].score).toBeGreaterThan(0);
      expect(results.searchTime).toBeGreaterThan(0);
      expect(results.totalDocuments).toBe(4);
    });

    it('should respect topK parameter', async () => {
      const results = await provider.search({
        text: 'programming',
        topK: 2
      });

      expect(results.results.length).toBeLessThanOrEqual(2);
    });

    it('should apply threshold filter', async () => {
      const results = await provider.search({
        text: 'programming',
        threshold: 0.8
      });

      expect(results.results.every(r => r.score >= 0.8)).toBe(true);
    });

    it('should apply metadata filters', async () => {
      const results = await provider.search({
        text: 'JavaScript',
        filters: { language: 'javascript' }
      });

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results.every(r => r.metadata.language === 'javascript')).toBe(true);
    });

    it('should include metadata when requested', async () => {
      const results = await provider.search({
        text: 'JavaScript',
        includeMetadata: true
      });

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].metadata).toBeDefined();
    });

    it('should handle empty search gracefully', async () => {
      const results = await provider.search({
        text: 'nonexistent content xyz',
        topK: 10
      });

      expect(results.results.length).toBe(0);
    });

    it('should handle Chinese search', async () => {
      await provider.indexDocument('doc5', '这是一个关于JavaScript编程的教程');
      
      const results = await provider.search({
        text: 'JavaScript编程',
        topK: 10
      });

      expect(results.results.length).toBeGreaterThan(0);
    });
  });

  describe('removeDocument', () => {
    beforeEach(async () => {
      await provider.indexDocument('doc1', 'Document to be removed');
      await provider.indexDocument('doc2', 'Document to keep');
    });

    it('should remove document successfully', async () => {
      await provider.removeDocument('doc1');

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(1);

      const results = await provider.search({
        text: 'removed',
        topK: 10
      });

      expect(results.results.every(r => r.id !== 'doc1')).toBe(true);
    });

    it('should handle removing non-existent document', async () => {
      await expect(provider.removeDocument('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getIndexStats', () => {
    beforeEach(async () => {
      await provider.indexDocument('doc1', 'Test document one');
      await provider.indexDocument('doc2', 'Test document two');
    });

    it('should return correct statistics', async () => {
      const stats = await provider.getIndexStats();

      expect(stats.documentCount).toBe(2);
      expect(stats.vectorDimensions).toBeGreaterThan(0);
      expect(stats.indexSize).toMatch(/\d+(\.\d+)?(B|KB|MB|GB)/);
      expect(stats.lastUpdated).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources successfully', async () => {
      await provider.indexDocument('doc1', 'Test document');
      await provider.dispose();

      const stats = await provider.getIndexStats();
      expect(stats.documentCount).toBe(0);
    });
  });

  describe('vocabulary and TF-IDF', () => {
    beforeEach(async () => {
      await provider.indexDocument('doc1', 'machine learning artificial intelligence');
      await provider.indexDocument('doc2', 'deep learning neural networks');
      await provider.indexDocument('doc3', 'machine learning algorithms');
    });

    it('should build vocabulary correctly', () => {
      const vocabulary = provider.getVocabulary();
      expect(vocabulary.size).toBeGreaterThan(0);
      expect(vocabulary.has('machine')).toBe(true);
      expect(vocabulary.has('learning')).toBe(true);
    });

    it('should calculate document frequencies', () => {
      const docFreqs = provider.getDocumentFrequencies();
      expect(docFreqs.get('machine')).toBe(2); // appears in doc1 and doc3
      expect(docFreqs.get('learning')).toBe(3); // appears in all documents
    });

    it('should filter stop words', () => {
      const vocabulary = provider.getVocabulary();
      expect(vocabulary.has('the')).toBe(false);
      expect(vocabulary.has('and')).toBe(false);
      expect(vocabulary.has('a')).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should respect maxFeatures setting', async () => {
      const limitedProvider = new TFIDFVectorProvider({
        maxFeatures: 5,
        minDocFreq: 1
      });
      await limitedProvider.initialize();

      // Index documents with many different words
      await limitedProvider.indexDocument('doc1', 'apple banana cherry date elderberry fig grape');
      await limitedProvider.indexDocument('doc2', 'apple banana cherry date elderberry fig grape');

      const vocabulary = limitedProvider.getVocabulary();
      expect(vocabulary.size).toBeLessThanOrEqual(5);
    });

    it('should respect minDocFreq setting', async () => {
      const strictProvider = new TFIDFVectorProvider({
        minDocFreq: 2,
        maxFeatures: 100
      });
      await strictProvider.initialize();

      await strictProvider.indexDocument('doc1', 'unique word common word');
      await strictProvider.indexDocument('doc2', 'another unique common word');

      const vocabulary = strictProvider.getVocabulary();
      expect(vocabulary.has('unique')).toBe(false); // appears in only 1 document
      expect(vocabulary.has('common')).toBe(true); // appears in 2 documents
    });

    it('should handle custom stop words', async () => {
      const customProvider = new TFIDFVectorProvider({
        stopWords: ['custom', 'stop', 'word']
      });
      await customProvider.initialize();

      await customProvider.indexDocument('doc1', 'this is a custom stop word test');

      const vocabulary = customProvider.getVocabulary();
      expect(vocabulary.has('custom')).toBe(false);
      expect(vocabulary.has('stop')).toBe(false);
      expect(vocabulary.has('word')).toBe(false);
      expect(vocabulary.has('test')).toBe(true);
    });
  });
});
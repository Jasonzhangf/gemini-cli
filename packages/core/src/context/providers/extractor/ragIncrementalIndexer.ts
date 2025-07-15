/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { watch, FSWatcher } from 'fs';
import { EventEmitter } from 'events';
import { IKnowledgeGraphProvider, IVectorSearchProvider } from '../../interfaces/contextProviders.js';

/**
 * RAG增量索引触发器类型
 */
export type RAGIndexTrigger = 
  | 'graph_change'      // graph变化
  | 'init_command'      // /init命令
  | 'file_name_change'  // 文件夹和文件名变化引起的名称RAG
  | 'file_content_change' // md和txt文本文件变化引起的内容索引
  | 'manual_trigger';   // 手动触发

/**
 * 文件变化类型
 */
export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed';

/**
 * 索引变化事件
 */
export interface IndexChangeEvent {
  trigger: RAGIndexTrigger;
  changeType: FileChangeType;
  filePath: string;
  oldPath?: string; // 重命名时的旧路径
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * 索引配置
 */
export interface IncrementalIndexConfig {
  watchDirectories: string[];
  supportedExtensions: string[];
  debounceTime: number;
  maxBatchSize: number;
  enableFileWatcher: boolean;
  debugMode: boolean;
}

/**
 * RAG增量索引器
 * 
 * 实现智能的增量索引系统，支持以下触发机制：
 * 1. Graph变化触发索引更新
 * 2. /init命令触发完整重建
 * 3. 文件夹和文件名变化触发名称RAG更新
 * 4. MD和TXT文件内容变化触发内容索引更新
 */
export class RAGIncrementalIndexer extends EventEmitter {
  private config: IncrementalIndexConfig;
  private graphProvider: IKnowledgeGraphProvider;
  private vectorProvider: IVectorSearchProvider;
  private fileWatchers: Map<string, FSWatcher> = new Map();
  private indexingQueue: Map<string, IndexChangeEvent> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastIndexTime: Map<string, number> = new Map();
  private isInitialized = false;
  private isIndexing = false;

  // 支持的文本文件扩展名
  private readonly TEXT_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml'];
  
  // 支持的代码文件扩展名（用于名称索引）
  private readonly CODE_EXTENSIONS = ['.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h'];

  constructor(
    graphProvider: IKnowledgeGraphProvider,
    vectorProvider: IVectorSearchProvider,
    config: Partial<IncrementalIndexConfig> = {}
  ) {
    super();
    
    this.graphProvider = graphProvider;
    this.vectorProvider = vectorProvider;
    this.config = {
      watchDirectories: [process.cwd()],
      supportedExtensions: [...this.TEXT_EXTENSIONS, ...this.CODE_EXTENSIONS],
      debounceTime: 1000, // 1秒防抖
      maxBatchSize: 50,
      enableFileWatcher: true,
      debugMode: false,
      ...config
    };

    // 绑定事件处理器
    this.setupEventHandlers();
  }

  /**
   * 初始化增量索引器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 初始化providers
      await this.graphProvider.initialize();
      await this.vectorProvider.initialize();

      // 启动文件监控
      if (this.config.enableFileWatcher) {
        await this.setupFileWatchers();
      }

      this.isInitialized = true;
      this.emit('initialized');
      
      if (this.config.debugMode) {
        console.log('[RAGIncrementalIndexer] 增量索引器初始化完成');
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 处理/init命令触发的完整重建
   */
  async handleInitCommand(projectRoot: string): Promise<void> {
    if (this.config.debugMode) {
      console.log('[RAGIncrementalIndexer] 处理/init命令，开始完整重建索引');
    }

    try {
      this.isIndexing = true;
      this.emit('indexing_started', { trigger: 'init_command' });

      // 清空现有索引
      await this.clearAllIndexes();

      // 扫描项目文件并重建索引
      await this.rebuildFullIndex(projectRoot);

      this.emit('indexing_completed', { trigger: 'init_command' });
      
      if (this.config.debugMode) {
        console.log('[RAGIncrementalIndexer] /init命令处理完成');
      }
    } catch (error) {
      this.emit('indexing_failed', { trigger: 'init_command', error });
      throw error;
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * 处理Graph变化触发的索引更新
   */
  async handleGraphChange(changeType: 'node_added' | 'node_updated' | 'node_removed', nodeId: string, nodeData?: any): Promise<void> {
    if (this.config.debugMode) {
      console.log(`[RAGIncrementalIndexer] 处理Graph变化: ${changeType} - ${nodeId}`);
    }

    const event: IndexChangeEvent = {
      trigger: 'graph_change',
      changeType: changeType === 'node_added' ? 'created' : 
                 changeType === 'node_updated' ? 'modified' : 'deleted',
      filePath: nodeId,
      timestamp: new Date().toISOString(),
      metadata: { nodeData, graphChangeType: changeType }
    };

    await this.queueIndexUpdate(event);
  }

  /**
   * 处理文件名变化触发的名称RAG更新
   */
  async handleFileNameChange(filePath: string, changeType: FileChangeType, oldPath?: string): Promise<void> {
    if (this.config.debugMode) {
      console.log(`[RAGIncrementalIndexer] 处理文件名变化: ${changeType} - ${filePath}`);
    }

    const event: IndexChangeEvent = {
      trigger: 'file_name_change',
      changeType,
      filePath,
      oldPath,
      timestamp: new Date().toISOString(),
      metadata: { 
        isNameChange: true,
        fileName: path.basename(filePath),
        fileExtension: path.extname(filePath)
      }
    };

    await this.queueIndexUpdate(event);
  }

  /**
   * 处理文件内容变化触发的内容索引更新
   */
  async handleFileContentChange(filePath: string, changeType: FileChangeType): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    
    // 只处理支持的文本文件
    if (!this.TEXT_EXTENSIONS.includes(ext)) {
      return;
    }

    if (this.config.debugMode) {
      console.log(`[RAGIncrementalIndexer] 处理文件内容变化: ${changeType} - ${filePath}`);
    }

    const event: IndexChangeEvent = {
      trigger: 'file_content_change',
      changeType,
      filePath,
      timestamp: new Date().toISOString(),
      metadata: { 
        isContentChange: true,
        fileExtension: ext,
        isTextFile: this.TEXT_EXTENSIONS.includes(ext)
      }
    };

    await this.queueIndexUpdate(event);
  }

  /**
   * 手动触发索引更新
   */
  async triggerManualIndex(filePath: string, changeType: FileChangeType = 'modified'): Promise<void> {
    if (this.config.debugMode) {
      console.log(`[RAGIncrementalIndexer] 手动触发索引更新: ${changeType} - ${filePath}`);
    }

    const event: IndexChangeEvent = {
      trigger: 'manual_trigger',
      changeType,
      filePath,
      timestamp: new Date().toISOString(),
      metadata: { manualTrigger: true }
    };

    await this.processIndexUpdate(event);
  }

  /**
   * 设置文件监控器
   */
  private async setupFileWatchers(): Promise<void> {
    for (const directory of this.config.watchDirectories) {
      try {
        const exists = await fs.access(directory).then(() => true).catch(() => false);
        if (!exists) continue;

        const watcher = watch(directory, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          
          const filePath = path.join(directory, filename);
          const ext = path.extname(filename).toLowerCase();
          
          // 跳过不支持的文件类型
          if (!this.config.supportedExtensions.includes(ext)) {
            return;
          }

          // 根据文件类型决定触发类型
          if (this.TEXT_EXTENSIONS.includes(ext)) {
            this.handleFileContentChange(filePath, eventType === 'rename' ? 'renamed' : 'modified');
          } else {
            this.handleFileNameChange(filePath, eventType === 'rename' ? 'renamed' : 'modified');
          }
        });

        this.fileWatchers.set(directory, watcher);
        
        if (this.config.debugMode) {
          console.log(`[RAGIncrementalIndexer] 文件监控器设置完成: ${directory}`);
        }
      } catch (error) {
        console.warn(`[RAGIncrementalIndexer] 无法设置文件监控器: ${directory}`, error);
      }
    }
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 处理索引队列
    this.on('queue_update', async (event: IndexChangeEvent) => {
      await this.processIndexUpdate(event);
    });

    // 处理错误
    this.on('error', (error) => {
      console.error('[RAGIncrementalIndexer] 索引错误:', error);
    });
  }

  /**
   * 队列索引更新（带防抖）
   */
  private async queueIndexUpdate(event: IndexChangeEvent): Promise<void> {
    const key = `${event.trigger}:${event.filePath}`;
    
    // 清除已存在的防抖定时器
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }

    // 更新队列中的事件
    this.indexingQueue.set(key, event);

    // 设置新的防抖定时器
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      const queuedEvent = this.indexingQueue.get(key);
      if (queuedEvent) {
        this.indexingQueue.delete(key);
        this.emit('queue_update', queuedEvent);
      }
    }, this.config.debounceTime);

    this.debounceTimers.set(key, timer);
  }

  /**
   * 处理索引更新
   */
  private async processIndexUpdate(event: IndexChangeEvent): Promise<void> {
    if (this.isIndexing) {
      // 如果正在索引，重新排队
      setTimeout(() => this.queueIndexUpdate(event), 100);
      return;
    }

    try {
      this.isIndexing = true;
      this.emit('indexing_started', { trigger: event.trigger, filePath: event.filePath });

      switch (event.trigger) {
        case 'graph_change':
          await this.processGraphChange(event);
          break;
        case 'file_name_change':
          await this.processFileNameChange(event);
          break;
        case 'file_content_change':
          await this.processFileContentChange(event);
          break;
        case 'manual_trigger':
          await this.processManualTrigger(event);
          break;
      }

      this.lastIndexTime.set(event.filePath, Date.now());
      this.emit('indexing_completed', { trigger: event.trigger, filePath: event.filePath });
      
      if (this.config.debugMode) {
        console.log(`[RAGIncrementalIndexer] 索引更新完成: ${event.trigger} - ${event.filePath}`);
      }
    } catch (error) {
      this.emit('indexing_failed', { trigger: event.trigger, filePath: event.filePath, error });
      if (this.config.debugMode) {
        console.error(`[RAGIncrementalIndexer] 索引更新失败: ${event.trigger} - ${event.filePath}`, error);
      }
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * 处理Graph变化
   */
  private async processGraphChange(event: IndexChangeEvent): Promise<void> {
    const { nodeData, graphChangeType } = event.metadata || {};
    
    switch (graphChangeType) {
      case 'node_added':
      case 'node_updated':
        if (nodeData) {
          await this.graphProvider.upsertNode(nodeData);
          // 如果是文件节点，同时更新向量索引
          if (nodeData.type === 'file' && nodeData.content) {
            await this.vectorProvider.indexDocument(nodeData.id, nodeData.content, nodeData.metadata);
          }
        }
        break;
      case 'node_removed':
        await this.graphProvider.removeNode(event.filePath);
        await this.vectorProvider.removeDocument(event.filePath);
        break;
    }
  }

  /**
   * 处理文件名变化
   */
  private async processFileNameChange(event: IndexChangeEvent): Promise<void> {
    const { fileName, fileExtension } = event.metadata || {};
    
    if (event.changeType === 'deleted') {
      // 删除相关索引
      await this.graphProvider.removeNode(event.filePath);
      await this.vectorProvider.removeDocument(event.filePath);
    } else if (event.changeType === 'renamed' && event.oldPath) {
      // 处理重命名：删除旧索引，创建新索引
      await this.graphProvider.removeNode(event.oldPath);
      await this.vectorProvider.removeDocument(event.oldPath);
      
      // 创建新的文件名索引
      await this.indexFileName(event.filePath, fileName, fileExtension);
    } else {
      // 创建或更新文件名索引
      await this.indexFileName(event.filePath, fileName, fileExtension);
    }
  }

  /**
   * 处理文件内容变化
   */
  private async processFileContentChange(event: IndexChangeEvent): Promise<void> {
    if (event.changeType === 'deleted') {
      // 删除相关索引
      await this.graphProvider.removeNode(event.filePath);
      await this.vectorProvider.removeDocument(event.filePath);
    } else {
      // 重新索引文件内容
      await this.indexFileContent(event.filePath);
    }
  }

  /**
   * 处理手动触发
   */
  private async processManualTrigger(event: IndexChangeEvent): Promise<void> {
    const ext = path.extname(event.filePath).toLowerCase();
    
    if (this.TEXT_EXTENSIONS.includes(ext)) {
      await this.indexFileContent(event.filePath);
    } else {
      const fileName = path.basename(event.filePath);
      await this.indexFileName(event.filePath, fileName, ext);
    }
  }

  /**
   * 索引文件名
   */
  private async indexFileName(filePath: string, fileName: string, fileExtension: string): Promise<void> {
    const nodeId = `filename:${filePath}`;
    
    // 提取文件名实体
    const fileNameEntities = this.extractFileNameEntities(fileName);
    
    const node = {
      id: nodeId,
      type: 'file' as const,
      name: fileName,
      content: `[FILENAME] ${fileName} [EXTENSION] ${fileExtension}`,
      metadata: {
        filePath,
        fileName,
        fileExtension,
        isFileName: true,
        entities: fileNameEntities
      },
      relationships: []
    };

    await this.graphProvider.upsertNode(node);
    await this.vectorProvider.indexDocument(nodeId, node.content, node.metadata);
  }

  /**
   * 索引文件内容
   */
  private async indexFileContent(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath);
      
      // 处理文件内容
      const processedContent = this.processFileContent(content, fileExtension);
      
      const node = {
        id: filePath,
        type: 'file' as const,
        name: fileName,
        content: processedContent,
        metadata: {
          filePath,
          fileName,
          fileExtension,
          isContent: true,
          contentType: this.getContentType(fileExtension)
        },
        relationships: []
      };

      await this.graphProvider.upsertNode(node);
      await this.vectorProvider.indexDocument(filePath, processedContent, node.metadata);
    } catch (error) {
      if (this.config.debugMode) {
        console.error(`[RAGIncrementalIndexer] 读取文件失败: ${filePath}`, error);
      }
    }
  }

  /**
   * 提取文件名实体
   */
  private extractFileNameEntities(fileName: string): string[] {
    const entities: string[] = [];
    
    // 移除扩展名
    const nameWithoutExt = path.parse(fileName).name;
    
    // 按常见分隔符分割
    const parts = nameWithoutExt.split(/[-_\s\.]+/);
    
    for (const part of parts) {
      if (part.length > 1) {
        entities.push(part.toLowerCase());
      }
    }
    
    return entities;
  }

  /**
   * 处理文件内容
   */
  private processFileContent(content: string, fileExtension: string): string {
    switch (fileExtension) {
      case '.md':
        return this.processMdContent(content);
      case '.txt':
        return `[TEXT] ${content}`;
      case '.json':
        return `[JSON] ${content}`;
      default:
        return content;
    }
  }

  /**
   * 处理MD文件内容
   */
  private processMdContent(content: string): string {
    // 标记标题
    content = content.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
      const level = hashes.length;
      return `[HEADING_${level}] ${title}`;
    });

    // 标记代码块
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `[CODE_${lang || 'text'}] ${code}`;
    });

    // 标记列表
    content = content.replace(/^[\s]*[-*+]\s+(.+)$/gm, '[LIST_ITEM] $1');

    return content;
  }

  /**
   * 获取内容类型
   */
  private getContentType(fileExtension: string): string {
    switch (fileExtension) {
      case '.md': return 'markdown';
      case '.txt': return 'text';
      case '.json': return 'json';
      case '.yaml':
      case '.yml': return 'yaml';
      case '.xml': return 'xml';
      default: return 'text';
    }
  }

  /**
   * 清空所有索引
   */
  private async clearAllIndexes(): Promise<void> {
    // 这里需要实现清空逻辑
    // 暂时跳过，因为providers没有clear方法
    if (this.config.debugMode) {
      console.log('[RAGIncrementalIndexer] 清空所有索引');
    }
  }

  /**
   * 重建完整索引
   */
  private async rebuildFullIndex(projectRoot: string): Promise<void> {
    const files = await this.scanProjectFiles(projectRoot);
    
    let processed = 0;
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      
      if (this.TEXT_EXTENSIONS.includes(ext)) {
        await this.indexFileContent(file);
      } else {
        const fileName = path.basename(file);
        await this.indexFileName(file, fileName, ext);
      }
      
      processed++;
      if (processed % 10 === 0) {
        this.emit('progress', { processed, total: files.length });
      }
    }
  }

  /**
   * 扫描项目文件
   */
  private async scanProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    const self = this;
    
    async function scanDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // 跳过常见的忽略目录
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if ([...self.TEXT_EXTENSIONS, ...self.CODE_EXTENSIONS].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略权限错误等
      }
    }
    
    await scanDir(projectRoot);
    return files;
  }

  /**
   * 获取索引状态
   */
  getIndexingStatus(): {
    isIndexing: boolean;
    queueSize: number;
    lastIndexTime: Record<string, number>;
    watchedDirectories: string[];
  } {
    return {
      isIndexing: this.isIndexing,
      queueSize: this.indexingQueue.size,
      lastIndexTime: Object.fromEntries(this.lastIndexTime),
      watchedDirectories: this.config.watchDirectories
    };
  }

  /**
   * 添加监控目录
   */
  async addWatchDirectory(directory: string): Promise<void> {
    if (!this.config.watchDirectories.includes(directory)) {
      this.config.watchDirectories.push(directory);
      
      if (this.config.enableFileWatcher && this.isInitialized) {
        await this.setupFileWatchers();
      }
    }
  }

  /**
   * 移除监控目录
   */
  removeWatchDirectory(directory: string): void {
    const index = this.config.watchDirectories.indexOf(directory);
    if (index > -1) {
      this.config.watchDirectories.splice(index, 1);
      
      const watcher = this.fileWatchers.get(directory);
      if (watcher) {
        watcher.close();
        this.fileWatchers.delete(directory);
      }
    }
  }

  /**
   * 销毁索引器
   */
  async dispose(): Promise<void> {
    // 清除所有定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // 关闭所有文件监控器
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();

    // 清空队列
    this.indexingQueue.clear();
    
    this.isInitialized = false;
    this.removeAllListeners();
  }
}
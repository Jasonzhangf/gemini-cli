#!/usr/bin/env node

/**
 * 测试存储路径修复
 * 验证知识图谱和RAG系统使用正确的存储路径
 */

import os from 'os';
import path from 'path';
import fs from 'fs/promises';

console.log('='.repeat(80));
console.log('测试存储路径修复');
console.log('='.repeat(80));

// 测试ProjectStorageManager
console.log('\n1. 测试ProjectStorageManager路径生成');
try {
  const { ProjectStorageManager } = await import('./packages/core/src/config/projectStorageManager.js');
  
  const projectRoot = process.cwd();
  const storageManager = new ProjectStorageManager(projectRoot);
  
  console.log('项目根目录:', projectRoot);
  console.log('项目ID:', storageManager.getProjectId());
  
  const structure = storageManager.getStorageStructure();
  console.log('存储结构:');
  console.log('  - 存储根目录:', structure.storageRoot);
  console.log('  - RAG存储:', structure.ragStorage);
  console.log('  - 知识图谱存储:', structure.knowledgeGraphStorage);
  
  const ragPath = storageManager.getRAGProviderPath('lightrag');
  const graphPath = storageManager.getKnowledgeGraphProviderPath('graphology');
  
  console.log('具体路径:');
  console.log('  - RAG lightrag:', ragPath);
  console.log('  - Graph graphology:', graphPath);
  
  // 验证路径是否在~/.gemini/projects/下
  const expectedBase = path.join(os.homedir(), '.gemini', 'projects');
  if (structure.storageRoot.startsWith(expectedBase)) {
    console.log('✅ 存储路径正确使用~/.gemini/projects/');
  } else {
    console.log('❌ 存储路径不正确，应该在~/.gemini/projects/下');
  }
  
} catch (error) {
  console.error('❌ ProjectStorageManager测试失败:', error.message);
}

// 测试ContextAgent初始化
console.log('\n2. 测试ContextAgent初始化');
try {
  const { ContextAgent } = await import('./packages/core/src/context/contextAgent.js');
  const { Config } = await import('./packages/core/src/config/config.js');
  
  // 创建配置
  const config = new Config();
  config.setDebugMode(true);
  
  // 创建ContextAgent
  const contextAgent = new ContextAgent(process.cwd(), config);
  
  console.log('ContextAgent创建成功');
  console.log('开始初始化...');
  
  // 初始化（这会创建存储目录）
  await contextAgent.initialize();
  
  console.log('✅ ContextAgent初始化成功');
  
  // 检查是否创建了正确的目录结构
  const storageManager = new (await import('./packages/core/src/config/projectStorageManager.js')).ProjectStorageManager(process.cwd());
  const structure = storageManager.getStorageStructure();
  
  console.log('\n检查创建的目录结构:');
  
  const dirsToCheck = [
    structure.storageRoot,
    structure.ragStorage,
    structure.knowledgeGraphStorage,
    path.join(structure.knowledgeGraphStorage, 'graphology')
  ];
  
  for (const dir of dirsToCheck) {
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        console.log(`✅ 目录存在: ${dir}`);
      } else {
        console.log(`❌ 不是目录: ${dir}`);
      }
    } catch (error) {
      console.log(`❌ 目录不存在: ${dir}`);
    }
  }
  
} catch (error) {
  console.error('❌ ContextAgent测试失败:', error.message);
  console.error('错误详情:', error.stack);
}

console.log('\n='.repeat(80));
console.log('测试完成');
console.log('='.repeat(80));
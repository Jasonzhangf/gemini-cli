/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { getProjectFolderName } from '../utils/paths.js';
import path from 'path';
import os from 'os';

/**
 * RAG数据库存储目录命名示例
 * 
 * 展示使用绝对路径转换为文件夹名称的方式，而不是使用UUID
 */

console.log('=== RAG数据库存储目录命名示例 ===\n');

// 测试各种项目路径
const testProjects = [
  '/Users/fanzhang/Documents/github/gemini-cli',
  '/home/user/workspace/my-project',
  '/var/www/html/website',
  '/opt/apps/backend-service',
  '/tmp/test-project',
  '/Users/john/Development/React Projects/my-app',
  'C:\\Users\\john\\Documents\\projects\\my-app', // Windows路径
  'D:\\workspace\\gemini-cli', // Windows路径
];

testProjects.forEach(projectRoot => {
  const folderName = getProjectFolderName(projectRoot);
  const ragStorageDir = path.join(os.homedir(), '.gemini', 'projects', folderName, 'rag');
  
  console.log(`项目路径: ${projectRoot}`);
  console.log(`文件夹名: ${folderName}`);
  console.log(`RAG存储: ${ragStorageDir}`);
  console.log('---');
});

console.log('\n=== 存储目录结构示例 ===\n');

const exampleStructure = `
~/.gemini/projects/
├── Users-fanzhang-Documents-github-gemini-cli/
│   └── rag/
│       ├── graph/
│       │   ├── nodes.json
│       │   └── relationships.json
│       ├── vector/
│       │   ├── documents.json
│       │   └── embeddings.json
│       └── metadata.json
├── home-user-workspace-my-project/
│   └── rag/
│       ├── graph/
│       ├── vector/
│       └── metadata.json
└── var-www-html-website/
    └── rag/
        ├── graph/
        ├── vector/
        └── metadata.json
`;

console.log(exampleStructure);

console.log('\n=== 优势对比 ===\n');

const advantages = [
  '✅ 可读性强：可以直接从文件夹名看出项目路径',
  '✅ 易于管理：开发者可以轻松识别和管理不同项目的RAG数据',
  '✅ 调试友好：便于调试时快速定位对应项目的RAG存储',
  '✅ 备份方便：可以选择性备份特定项目的RAG数据',
  '✅ 迁移简单：可以轻松迁移特定项目的RAG数据到其他机器',
  '✅ 跨平台兼容：自动处理Windows和Unix路径差异',
  '✅ 安全字符：自动处理特殊字符和空格',
  '✅ 长度限制：自动截断过长的路径名'
];

advantages.forEach(advantage => {
  console.log(advantage);
});

console.log('\n=== UUID方式的问题 ===\n');

const uuidProblems = [
  '❌ 不可读：无法从UUID看出对应的项目',
  '❌ 难管理：需要额外的映射表来管理项目和UUID的关系',
  '❌ 调试困难：调试时难以快速找到对应项目的数据',
  '❌ 备份复杂：无法直观地选择备份哪个项目的数据',
  '❌ 迁移麻烦：需要同时迁移数据和映射关系'
];

uuidProblems.forEach(problem => {
  console.log(problem);
});

console.log('\n=== 实际使用示例 ===\n');

// 模拟实际使用场景
const currentProject = process.cwd();
const ragFolderName = getProjectFolderName(currentProject);
const ragStorageDir = path.join(os.homedir(), '.gemini', 'projects', ragFolderName, 'rag');

console.log(`当前项目: ${currentProject}`);
console.log(`RAG文件夹名: ${ragFolderName}`);
console.log(`RAG存储目录: ${ragStorageDir}`);

// 展示不同的RAG文件结构
const ragFiles = [
  `${ragStorageDir}/graph/nodes.json`,
  `${ragStorageDir}/graph/relationships.json`,
  `${ragStorageDir}/vector/documents.json`,
  `${ragStorageDir}/vector/embeddings.json`,
  `${ragStorageDir}/metadata.json`,
  `${ragStorageDir}/config.json`
];

console.log('\nRAG文件结构:');
ragFiles.forEach(file => {
  console.log(`  ${file}`);
});

console.log('\n=== 命名规则说明 ===\n');

const namingRules = [
  '1. 使用绝对路径，移除驱动器字母（Windows）',
  '2. 将路径分隔符 "/" 替换为 "-"',
  '3. 将空格替换为 "_"',
  '4. 处理特殊字符：< > : " | ? * 替换为 "_"',
  '5. 移除前导和尾随的 "-"',
  '6. 限制长度为100个字符',
  '7. 空路径或根路径使用 "root"'
];

namingRules.forEach(rule => {
  console.log(rule);
});

export { getProjectFolderName };
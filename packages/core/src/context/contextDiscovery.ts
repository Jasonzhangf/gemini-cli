/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { LSTool } from '../tools/ls.js';
import { GlobTool } from '../tools/glob.js';
import { ReadFileTool } from '../tools/read-file.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { GitService } from '../services/gitService.js';
import { Config } from '../config/config.js';

export interface ProjectContext {
  structure: string;
  dependencies: string[];
  documentation: string[];
  gitStatus?: string;
  summary: string;
}

/**
 * 上下文发现服务 - 自动收集项目相关信息
 */
export class ContextDiscoveryService {
  private config: Config;
  private projectDir: string;
  private lsTool: LSTool;
  private globTool: GlobTool;
  private readTool: ReadFileTool;
  private gitService: GitService | undefined;

  constructor(config: Config, projectDir: string = process.cwd()) {
    this.config = config;
    this.projectDir = projectDir;
    this.lsTool = new LSTool(projectDir, config);
    this.globTool = new GlobTool(projectDir, config);
    this.readTool = new ReadFileTool(projectDir, config);
    
    try {
      this.gitService = new GitService(projectDir);
    } catch {
      // Git not available
      this.gitService = undefined;
    }
  }

  /**
   * 发现项目结构
   */
  async discoverProjectStructure(): Promise<string> {
    try {
      // 获取目录树结构（限制数量避免过大）
      const structure = await getFolderStructure(this.projectDir, {
        maxItems: 100
      });
      return structure;
    } catch (error) {
      console.error('[ContextDiscovery] Failed to get folder structure:', error);
      
      // 回退到基本目录列表
      try {
        const result = await this.lsTool.execute({ path: this.projectDir }, new AbortController().signal);
        return `项目根目录内容:\n${result.llmContent}`;
      } catch (fallbackError) {
        return `无法获取项目结构: ${fallbackError}`;
      }
    }
  }

  /**
   * 发现项目依赖配置
   */
  async discoverDependencies(): Promise<string[]> {
    const dependencyFiles = [
      'package.json',
      'requirements.txt',
      'Pipfile',
      'poetry.lock',
      'Cargo.toml',
      'go.mod',
      'build.gradle',
      'pom.xml',
      'composer.json',
      'Gemfile',
      'CMakeLists.txt'
    ];

    const foundDependencies: string[] = [];

    for (const file of dependencyFiles) {
      try {
        const filePath = path.join(this.projectDir, file);
        const result = await this.readTool.execute({ file_path: filePath }, new AbortController().signal);
        
        if (typeof result.llmContent === 'string') {
          foundDependencies.push(`=== ${file} ===\n${result.llmContent.substring(0, 1000)}${result.llmContent.length > 1000 ? '...(truncated)' : ''}`);
        }
      } catch {
        // 文件不存在，继续
      }
    }

    return foundDependencies;
  }

  /**
   * 发现项目文档
   */
  async discoverDocumentation(): Promise<string[]> {
    const docFiles: string[] = [];

    try {
      // 查找README文件
      const readmeResult = await this.globTool.execute({ 
        pattern: 'README*',
        path: this.projectDir 
      }, new AbortController().signal);

      if (typeof readmeResult.llmContent === 'string') {
        const readmeFiles = readmeResult.llmContent.split('\n').filter(Boolean);
        
        for (const file of readmeFiles.slice(0, 3)) { // 最多读取3个README
          try {
            const content = await this.readTool.execute({ file_path: file }, new AbortController().signal);
            if (typeof content.llmContent === 'string') {
              docFiles.push(`=== ${path.basename(file)} ===\n${content.llmContent.substring(0, 2000)}${content.llmContent.length > 2000 ? '...(truncated)' : ''}`);
            }
          } catch {
            // 读取失败，跳过
          }
        }
      }
    } catch {
      // Glob失败，尝试直接读取常见文件名
      const commonReadmes = ['README.md', 'README.txt', 'README'];
      for (const readme of commonReadmes) {
        try {
          const result = await this.readTool.execute({ 
            file_path: path.join(this.projectDir, readme) 
          }, new AbortController().signal);
          
          if (typeof result.llmContent === 'string') {
            docFiles.push(`=== ${readme} ===\n${result.llmContent.substring(0, 2000)}${result.llmContent.length > 2000 ? '...(truncated)' : ''}`);
            break; // 找到一个就够了
          }
        } catch {
          // 继续尝试下一个
        }
      }
    }

    return docFiles;
  }

  /**
   * 发现Git状态
   */
  async discoverGitStatus(): Promise<string | undefined> {
    if (!this.gitService) {
      return undefined;
    }

    try {
      // GitService doesn't have getStatus/getCurrentBranch methods
      // Use shell command as fallback
      const result = await this.executeShellCommand('git status --porcelain && echo "---" && git branch --show-current');
      return result ? `Git状态:\n${result}` : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 执行shell命令的辅助方法
   */
  private async executeShellCommand(command: string): Promise<string | undefined> {
    try {
      // 这里应该使用ShellTool，但为了简化，暂时返回undefined
      // 在实际使用中，可以通过config获取ShellTool并执行命令
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 完整的上下文发现
   */
  async discoverFullContext(options: {
    projectStructure?: boolean;
    dependencies?: boolean;
    documentation?: boolean;
    gitStatus?: boolean;
  } = {}): Promise<ProjectContext> {
    const {
      projectStructure = true,
      dependencies = true,
      documentation = true,
      gitStatus = false
    } = options;

    const context: ProjectContext = {
      structure: '',
      dependencies: [],
      documentation: [],
      summary: ''
    };

    // 并行执行上下文发现
    const tasks: Promise<void>[] = [];

    if (projectStructure) {
      tasks.push(
        this.discoverProjectStructure().then(structure => {
          context.structure = structure;
        })
      );
    }

    if (dependencies) {
      tasks.push(
        this.discoverDependencies().then(deps => {
          context.dependencies = deps;
        })
      );
    }

    if (documentation) {
      tasks.push(
        this.discoverDocumentation().then(docs => {
          context.documentation = docs;
        })
      );
    }

    if (gitStatus) {
      tasks.push(
        this.discoverGitStatus().then(status => {
          context.gitStatus = status;
        })
      );
    }

    // 等待所有任务完成
    await Promise.all(tasks);

    // 生成项目摘要
    context.summary = this.generateProjectSummary(context);

    return context;
  }

  /**
   * 生成项目摘要
   */
  private generateProjectSummary(context: ProjectContext): string {
    const parts: string[] = [];

    parts.push(`📁 项目目录: ${path.basename(this.projectDir)}`);
    
    if (context.dependencies.length > 0) {
      const hasPackageJson = context.dependencies.some(d => d.includes('package.json'));
      const hasPython = context.dependencies.some(d => d.includes('requirements.txt') || d.includes('Pipfile'));
      const hasRust = context.dependencies.some(d => d.includes('Cargo.toml'));
      
      const languages = [];
      if (hasPackageJson) languages.push('Node.js/JavaScript');
      if (hasPython) languages.push('Python');
      if (hasRust) languages.push('Rust');
      
      if (languages.length > 0) {
        parts.push(`💻 技术栈: ${languages.join(', ')}`);
      }
    }

    if (context.documentation.length > 0) {
      parts.push(`📖 包含项目文档 (${context.documentation.length}个文件)`);
    }

    if (context.gitStatus) {
      parts.push(`🔗 Git仓库已初始化`);
    }

    // 分析项目结构特征
    if (context.structure) {
      const hasTests = context.structure.includes('test') || context.structure.includes('spec');
      const hasSrc = context.structure.includes('src/') || context.structure.includes('lib/');
      const hasDocs = context.structure.includes('docs/') || context.structure.includes('documentation/');
      
      if (hasTests) parts.push(`✅ 包含测试代码`);
      if (hasSrc) parts.push(`📦 包含源代码目录`);
      if (hasDocs) parts.push(`📚 包含文档目录`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化完整上下文为模型可读格式
   */
  formatContextForModel(context: ProjectContext): string {
    const sections: string[] = [];

    sections.push(`# 🎯 项目上下文概览\n${context.summary}\n`);

    if (context.structure) {
      sections.push(`## 📁 项目结构\n\`\`\`\n${context.structure}\n\`\`\``);
    }

    if (context.dependencies.length > 0) {
      sections.push(`## 📦 依赖配置\n${context.dependencies.join('\n\n')}`);
    }

    if (context.documentation.length > 0) {
      sections.push(`## 📖 项目文档\n${context.documentation.join('\n\n')}`);
    }

    if (context.gitStatus) {
      sections.push(`## 🔗 Git状态\n\`\`\`\n${context.gitStatus}\n\`\`\``);
    }

    return sections.join('\n\n---\n\n');
  }
}
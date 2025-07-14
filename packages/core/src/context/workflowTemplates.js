/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

export interface WorkflowStep {
  name: string;
  description: string;
  tools?: string[];
  contextRequired?: string[];
  autoExecute?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'analysis' | 'research' | 'maintenance' | 'custom';
  steps: WorkflowStep[];
  contextDiscovery: {
    projectStructure: boolean;
    dependencies: boolean;
    documentation: boolean;
    gitStatus: boolean;
  };
  createdAt: string;
  version: string;
}

/**
 * Predefined workflow templates
 */
export const BUILTIN_TEMPLATES: Record<string, WorkflowTemplate> = {
  'explore-plan-code-test': {
    id: 'explore-plan-code-test',
    name: 'Explore, Plan, Code, Test',
    description: 'Comprehensive development workflow with thorough exploration and testing',
    category: 'development',
    steps: [
      {
        name: '📊 探索项目结构',
        description: '使用并行子代理分析项目结构，找到相关文件和示例',
        tools: ['list_directory', 'glob', 'search_file_content'],
        contextRequired: ['project_structure', 'file_patterns'],
        autoExecute: true
      },
      {
        name: '📋 制定详细计划',
        description: '基于探索结果制定实现计划，包括测试和文档',
        tools: ['read_file'],
        contextRequired: ['requirements', 'existing_patterns']
      },
      {
        name: '💻 编写代码实现',
        description: '遵循现有代码风格，实现功能并运行格式化工具',
        tools: ['write_file', 'edit', 'run_shell_command'],
        contextRequired: ['coding_standards', 'existing_patterns']
      },
      {
        name: '🧪 运行测试验证',
        description: '使用并行子代理运行测试，确保所有测试通过',
        tools: ['run_shell_command'],
        contextRequired: ['test_commands', 'build_commands']
      }
    ],
    contextDiscovery: {
      projectStructure: true,
      dependencies: true,
      documentation: true,
      gitStatus: true
    },
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  },

  'project-analysis': {
    id: 'project-analysis',
    name: '项目分析工作流',
    description: '深度分析项目结构、依赖关系和代码模式',
    category: 'analysis',
    steps: [
      {
        name: '📁 分析目录结构',
        description: '获取完整项目目录树和文件组织',
        tools: ['list_directory', 'glob'],
        autoExecute: true
      },
      {
        name: '📦 分析依赖配置',
        description: '检查package.json、requirements.txt等依赖文件',
        tools: ['read_file', 'glob'],
        autoExecute: true
      },
      {
        name: '📖 分析文档和README',
        description: '读取项目文档了解用途和架构',
        tools: ['read_file', 'search_file_content'],
        autoExecute: true
      },
      {
        name: '🔍 分析核心代码模式',
        description: '识别主要代码文件和架构模式',
        tools: ['search_file_content', 'read_file']
      }
    ],
    contextDiscovery: {
      projectStructure: true,
      dependencies: true,
      documentation: true,
      gitStatus: false
    },
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  },

  'bug-fix': {
    id: 'bug-fix',
    name: 'Bug修复工作流',
    description: '系统化的bug定位和修复流程',
    category: 'maintenance',
    steps: [
      {
        name: '🐛 重现和分析问题',
        description: '理解bug现象，定位相关代码区域',
        tools: ['search_file_content', 'read_file']
      },
      {
        name: '🔍 查找根本原因',
        description: '深入分析代码逻辑，确定bug根源',
        tools: ['read_file', 'search_file_content']
      },
      {
        name: '🛠️ 实现修复方案',
        description: '编写修复代码，确保不引入新问题',
        tools: ['edit', 'write_file']
      },
      {
        name: '✅ 验证修复效果',
        description: '运行测试确认bug已修复且无副作用',
        tools: ['run_shell_command']
      }
    ],
    contextDiscovery: {
      projectStructure: true,
      dependencies: false,
      documentation: false,
      gitStatus: true
    },
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  }
};

/**
 * 工作流模板服务
 */
export class WorkflowTemplateService {
  private readonly projectDir: string;

  constructor(projectDir: string = process.cwd()) {
    this.projectDir = projectDir;
  }

  /**
   * 获取项目特定的模板存储目录
   */
  private getTemplateDir(): string {
    const absolutePath = path.resolve(this.projectDir);
    const projectDirName = absolutePath.replace(/\//g, '-');
    return path.join(homedir(), '.gemini', 'projects', projectDirName, 'templates');
  }

  /**
   * 获取全局模板目录
   */
  private getGlobalTemplateDir(): string {
    return path.join(homedir(), '.gemini', 'templates');
  }

  /**
   * 列出所有可用模板
   */
  async listTemplates(): Promise<WorkflowTemplate[]> {
    const templates: WorkflowTemplate[] = [];
    
    // 添加内置模板
    templates.push(...Object.values(BUILTIN_TEMPLATES));

    // 添加全局自定义模板
    try {
      const globalDir = this.getGlobalTemplateDir();
      const globalFiles = await fs.readdir(globalDir);
      for (const file of globalFiles.filter(f => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(globalDir, file), 'utf-8');
        templates.push(JSON.parse(content));
      }
    } catch {
      // 目录不存在，忽略
    }

    // 添加项目特定模板
    try {
      const projectDir = this.getTemplateDir();
      const projectFiles = await fs.readdir(projectDir);
      for (const file of projectFiles.filter(f => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(projectDir, file), 'utf-8');
        templates.push(JSON.parse(content));
      }
    } catch {
      // 目录不存在，忽略
    }

    return templates;
  }

  /**
   * 获取特定模板
   */
  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    // 检查内置模板
    if (BUILTIN_TEMPLATES[templateId]) {
      return BUILTIN_TEMPLATES[templateId];
    }

    // 检查自定义模板
    const templates = await this.listTemplates();
    return templates.find(t => t.id === templateId) || null;
  }

  /**
   * 保存自定义模板
   */
  async saveTemplate(template: WorkflowTemplate, global: boolean = false): Promise<void> {
    const templateDir = global ? this.getGlobalTemplateDir() : this.getTemplateDir();
    await fs.mkdir(templateDir, { recursive: true });
    
    const filePath = path.join(templateDir, `${template.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(template, null, 2), 'utf-8');
  }

  /**
   * 删除自定义模板
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    // 不能删除内置模板
    if (BUILTIN_TEMPLATES[templateId]) {
      return false;
    }

    // 尝试从项目和全局目录删除
    const dirs = [this.getTemplateDir(), this.getGlobalTemplateDir()];
    let deleted = false;

    for (const dir of dirs) {
      try {
        const filePath = path.join(dir, `${templateId}.json`);
        await fs.unlink(filePath);
        deleted = true;
      } catch {
        // 文件不存在，继续
      }
    }

    return deleted;
  }

  /**
   * 从模板创建任务列表
   */
  createTasksFromTemplate(template: WorkflowTemplate): string[] {
    return template.steps.map(step => step.name);
  }

  /**
   * 获取模板的上下文发现需求
   */
  getContextRequirements(template: WorkflowTemplate): {
    needsProjectStructure: boolean;
    needsDependencies: boolean;
    needsDocumentation: boolean;
    needsGitStatus: boolean;
  } {
    return {
      needsProjectStructure: template.contextDiscovery.projectStructure,
      needsDependencies: template.contextDiscovery.dependencies,
      needsDocumentation: template.contextDiscovery.documentation,
      needsGitStatus: template.contextDiscovery.gitStatus
    };
  }
}
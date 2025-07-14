/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

export interface MigrateProjectDataParams {
  action: 'analyze' | 'migrate' | 'cleanup';
  dryRun?: boolean;
}

/**
 * 项目数据迁移工具
 * 将旧的MD5哈希目录迁移到新的可读路径格式
 */
export class MigrateProjectDataTool extends BaseTool<MigrateProjectDataParams, ToolResult> {
  static readonly Name = 'migrate_project_data';
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'migrate_project_data',
      '项目数据迁移工具',
      '将旧的MD5哈希目录迁移到新的可读路径格式',
      {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: '操作类型：analyze(分析), migrate(迁移), cleanup(清理)',
            enum: ['analyze', 'migrate', 'cleanup'],
          },
          dryRun: {
            type: Type.BOOLEAN,
            description: '是否为演练模式（不实际执行迁移）',
          }
        },
        required: ['action']
      }
    );
    
    this.config = config || null;
  }

  async execute(params: MigrateProjectDataParams): Promise<ToolResult> {
    const { action, dryRun = false } = params;

    switch (action) {
      case 'analyze':
        return await this.analyzeOldData();
      
      case 'migrate':
        return await this.migrateData(dryRun);
      
      case 'cleanup':
        return await this.cleanupOldData(dryRun);
      
      default:
        throw new Error(`未支持的操作: ${action}`);
    }
  }

  private async analyzeOldData(): Promise<ToolResult> {
    const oldTasksDir = path.join(homedir(), '.gemini', 'tasks');
    const oldTemplatesDir = path.join(homedir(), '.gemini', 'templates');
    
    const analysis = {
      oldTaskDirs: [],
      oldTemplateDirs: [],
      canMigrate: [],
      issues: []
    } as any;

    try {
      // 分析旧的任务目录
      try {
        const taskDirs = await fs.readdir(oldTasksDir);
        analysis.oldTaskDirs = taskDirs.filter(dir => 
          dir.length === 16 && /^[a-f0-9]+$/.test(dir) // MD5哈希格式
        );

        // 尝试从project_meta.json恢复原始路径
        for (const hashDir of analysis.oldTaskDirs) {
          const metaFile = path.join(oldTasksDir, hashDir, 'project_meta.json');
          try {
            const metaContent = await fs.readFile(metaFile, 'utf-8');
            const meta = JSON.parse(metaContent);
            if (meta.projectPath) {
              analysis.canMigrate.push({
                hashDir,
                projectPath: meta.projectPath,
                newDir: meta.projectPath.replace(/\//g, '-')
              });
            }
          } catch {
            analysis.issues.push(`无法读取 ${hashDir}/project_meta.json`);
          }
        }
      } catch {
        // 旧任务目录不存在
      }

      // 分析旧的模板目录
      try {
        const templateDirs = await fs.readdir(oldTemplatesDir);
        analysis.oldTemplateDirs = templateDirs;
      } catch {
        // 旧模板目录不存在
      }

    } catch (error) {
      analysis.issues.push(`分析失败: ${error}`);
    }

    const displayMessage = `📊 **项目数据迁移分析报告**

## 🗂️ 发现的旧数据

**旧任务目录**: ${analysis.oldTaskDirs.length} 个MD5哈希目录
**旧模板目录**: ${analysis.oldTemplateDirs.length} 个目录

## ✅ 可迁移的项目

${analysis.canMigrate.map((item: any, index: number) => 
  `${index + 1}. **${item.hashDir}** → \`${item.newDir}\`
   路径: \`${item.projectPath}\``
).join('\n\n')}

## ⚠️ 发现的问题

${analysis.issues.length > 0 ? analysis.issues.map((issue: string) => `- ${issue}`).join('\n') : '无问题'}

## 📋 建议的迁移步骤

1. 运行迁移: \`migrate_project_data with action "migrate" dryRun true\` (演练)
2. 确认无误后: \`migrate_project_data with action "migrate"\` (实际迁移)  
3. 清理旧数据: \`migrate_project_data with action "cleanup"\`

**迁移后的新结构:**
\`\`\`
~/.gemini/
├── projects/          # 项目工作目录上下文
│   └── -Users-...-project/
│       ├── project_meta.json
│       ├── context.json
│       └── templates/
└── todos/             # 任务安排
    └── -Users-...-project/
        ├── todo_context.json
        └── current_task.txt
\`\`\``;

    return {
      llmContent: JSON.stringify({
        action: 'analyze',
        analysis,
        migratable: analysis.canMigrate.length,
        issues: analysis.issues.length
      }),
      returnDisplay: displayMessage,
    };
  }

  private async migrateData(dryRun: boolean): Promise<ToolResult> {
    const oldTasksDir = path.join(homedir(), '.gemini', 'tasks');
    const results = {
      migrated: [],
      failed: [],
      skipped: []
    } as any;

    const dryRunText = dryRun ? ' (演练模式)' : '';

    try {
      const taskDirs = await fs.readdir(oldTasksDir);
      const hashDirs = taskDirs.filter(dir => 
        dir.length === 16 && /^[a-f0-9]+$/.test(dir)
      );

      for (const hashDir of hashDirs) {
        try {
          // 读取项目元数据
          const metaFile = path.join(oldTasksDir, hashDir, 'project_meta.json');
          const metaContent = await fs.readFile(metaFile, 'utf-8');
          const meta = JSON.parse(metaContent);
          
          if (!meta.projectPath) {
            results.failed.push(`${hashDir}: 缺少projectPath`);
            continue;
          }

          const newDirName = meta.projectPath.replace(/\//g, '-');
          const newProjectDir = path.join(homedir(), '.gemini', 'projects', newDirName);
          const newTodoDir = path.join(homedir(), '.gemini', 'todos', newDirName);

          if (!dryRun) {
            // 创建新目录结构
            await fs.mkdir(newProjectDir, { recursive: true });
            await fs.mkdir(newTodoDir, { recursive: true });

            // 复制任务数据
            const oldTodoFile = path.join(oldTasksDir, hashDir, 'todo_context.json');
            const oldCurrentFile = path.join(oldTasksDir, hashDir, 'current_task.txt');
            
            try {
              await fs.copyFile(oldTodoFile, path.join(newTodoDir, 'todo_context.json'));
            } catch {
              // 文件不存在，跳过
            }

            try {
              await fs.copyFile(oldCurrentFile, path.join(newTodoDir, 'current_task.txt'));
            } catch {
              // 文件不存在，跳过
            }

            // 更新并保存项目元数据到新位置
            const newMeta = {
              ...meta,
              directoryName: newDirName,
              migratedFrom: hashDir,
              migratedAt: new Date().toISOString(),
              taskStorageDir: newTodoDir,
              contextStorageDir: newProjectDir,
            };

            await fs.writeFile(
              path.join(newProjectDir, 'project_meta.json'),
              JSON.stringify(newMeta, null, 2),
              'utf-8'
            );
          }

          results.migrated.push(`${hashDir} → ${newDirName}`);

        } catch (error) {
          results.failed.push(`${hashDir}: ${error}`);
        }
      }

    } catch (error) {
      results.failed.push(`读取旧目录失败: ${error}`);
    }

    const displayMessage = `🔄 **项目数据迁移结果**${dryRunText}

## ✅ 成功迁移 (${results.migrated.length})

${results.migrated.map((item: string) => `- ${item}`).join('\n')}

## ❌ 迁移失败 (${results.failed.length})

${results.failed.map((item: string) => `- ${item}`).join('\n')}

## ⏭️ 被跳过 (${results.skipped.length})

${results.skipped.map((item: string) => `- ${item}`).join('\n')}

${dryRun ? `
🎯 **演练模式完成** - 未进行实际迁移
要执行实际迁移，请运行: \`migrate_project_data with action "migrate"\`
` : `
✅ **迁移完成**
建议运行清理: \`migrate_project_data with action "cleanup" dryRun true\`
`}`;

    return {
      llmContent: JSON.stringify({
        action: 'migrate',
        dryRun,
        results,
        migrated: results.migrated.length,
        failed: results.failed.length
      }),
      returnDisplay: displayMessage,
    };
  }

  private async cleanupOldData(dryRun: boolean): Promise<ToolResult> {
    const oldTasksDir = path.join(homedir(), '.gemini', 'tasks');
    const results = {
      removed: [],
      kept: [],
      errors: []
    } as any;

    const dryRunText = dryRun ? ' (演练模式)' : '';

    try {
      const taskDirs = await fs.readdir(oldTasksDir);
      const hashDirs = taskDirs.filter(dir => 
        dir.length === 16 && /^[a-f0-9]+$/.test(dir)
      );

      for (const hashDir of hashDirs) {
        try {
          // 检查是否已经成功迁移
          const metaFile = path.join(oldTasksDir, hashDir, 'project_meta.json');
          const metaContent = await fs.readFile(metaFile, 'utf-8');
          const meta = JSON.parse(metaContent);
          
          if (meta.projectPath) {
            const newDirName = meta.projectPath.replace(/\//g, '-');
            const newProjectDir = path.join(homedir(), '.gemini', 'projects', newDirName);
            
            // 检查新位置是否存在
            try {
              await fs.access(path.join(newProjectDir, 'project_meta.json'));
              
              // 新位置存在，可以删除旧目录
              if (!dryRun) {
                await fs.rm(path.join(oldTasksDir, hashDir), { recursive: true });
              }
              results.removed.push(hashDir);
            } catch {
              // 新位置不存在，保留旧目录
              results.kept.push(`${hashDir}: 新位置不存在`);
            }
          } else {
            results.kept.push(`${hashDir}: 无法确定新位置`);
          }

        } catch (error) {
          results.errors.push(`${hashDir}: ${error}`);
        }
      }

    } catch (error) {
      results.errors.push(`清理失败: ${error}`);
    }

    const displayMessage = `🧹 **旧数据清理结果**${dryRunText}

## 🗑️ 已删除的旧目录 (${results.removed.length})

${results.removed.map((item: string) => `- ${item}`).join('\n')}

## 📦 保留的目录 (${results.kept.length})

${results.kept.map((item: string) => `- ${item}`).join('\n')}

## ❌ 清理错误 (${results.errors.length})

${results.errors.map((item: string) => `- ${item}`).join('\n')}

${dryRun ? `
🎯 **演练模式完成** - 未进行实际删除
要执行实际清理，请运行: \`migrate_project_data with action "cleanup"\`
` : `
✅ **清理完成**
旧的MD5哈希目录已删除，新的可读目录结构已生效。
`}`;

    return {
      llmContent: JSON.stringify({
        action: 'cleanup',
        dryRun,
        results,
        removed: results.removed.length,
        kept: results.kept.length,
        errors: results.errors.length
      }),
      returnDisplay: displayMessage,
    };
  }
}
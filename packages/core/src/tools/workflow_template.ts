/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { WorkflowTemplateService, WorkflowTemplate } from '../context/workflowTemplates.js';

export interface WorkflowTemplateParams {
  action: 'list' | 'get' | 'save' | 'delete';
  templateId?: string;
  template?: WorkflowTemplate;
  global?: boolean;
}

/**
 * 工作流模板管理工具
 */
export class WorkflowTemplateTool extends BaseTool<WorkflowTemplateParams, ToolResult> {
  static readonly Name = 'workflow_template';
  private templateService: WorkflowTemplateService;
  private config: Config | null;

  constructor(config?: Config) {
    super(
      'workflow_template',
      '工作流模板管理',
      '管理工作流模板：列出、获取、保存和删除模板',
      {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: '操作类型：list(列出所有), get(获取特定), save(保存), delete(删除)',
            enum: ['list', 'get', 'save', 'delete'],
          },
          templateId: {
            type: Type.STRING,
            description: '模板ID（用于get和delete操作）',
          },
          template: {
            type: Type.OBJECT,
            description: '模板对象（用于save操作）',
          },
          global: {
            type: Type.BOOLEAN,
            description: '是否为全局模板（用于save操作，默认false）',
          }
        },
        required: ['action']
      }
    );
    
    this.templateService = new WorkflowTemplateService(process.cwd());
    this.config = config || null;
  }

  async execute(params: WorkflowTemplateParams): Promise<ToolResult> {
    const { action, templateId, template, global = false } = params;

    switch (action) {
      case 'list':
        return await this.listTemplates();
      
      case 'get':
        if (!templateId) {
          throw new Error('获取模板需要提供templateId');
        }
        return await this.getTemplate(templateId);
      
      case 'save':
        if (!template) {
          throw new Error('保存模板需要提供template对象');
        }
        return await this.saveTemplate(template, global);
      
      case 'delete':
        if (!templateId) {
          throw new Error('删除模板需要提供templateId');
        }
        return await this.deleteTemplate(templateId);
      
      default:
        throw new Error(`未支持的操作: ${action}`);
    }
  }

  private async listTemplates(): Promise<ToolResult> {
    const templates = await this.templateService.listTemplates();
    
    const categories = templates.reduce((acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = [];
      }
      acc[template.category].push(template);
      return acc;
    }, {} as Record<string, WorkflowTemplate[]>);

    let displayMessage = `📋 **可用工作流模板** (共 ${templates.length} 个)\n\n`;
    
    Object.entries(categories).forEach(([category, templateList]) => {
      const categoryEmoji = {
        'development': '💻',
        'analysis': '📊',
        'research': '🔬',
        'maintenance': '🔧',
        'custom': '⚙️'
      }[category] || '📁';
      
      displayMessage += `## ${categoryEmoji} ${category.toUpperCase()}\n`;
      templateList.forEach(template => {
        const isBuiltin = template.id in {'explore-plan-code-test': true, 'project-analysis': true, 'bug-fix': true};
        const source = isBuiltin ? '(内置)' : '(自定义)';
        displayMessage += `- **${template.id}** ${source}: ${template.description}\n`;
      });
      displayMessage += '\n';
    });

    displayMessage += `💡 **使用方法**:\n`;
    displayMessage += `- 使用模板: \`create_tasks with template "模板ID"\`\n`;
    displayMessage += `- 查看详情: \`workflow_template with action "get" templateId "模板ID"\``;

    return {
      llmContent: JSON.stringify({
        action: 'list',
        templates: templates.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          steps: t.steps.length
        })),
        categorized: categories
      }),
      returnDisplay: displayMessage,
    };
  }

  private async getTemplate(templateId: string): Promise<ToolResult> {
    const template = await this.templateService.getTemplate(templateId);
    
    if (!template) {
      const displayMessage = `❌ 未找到模板: ${templateId}`;
      return {
        llmContent: JSON.stringify({ action: 'get', templateId, found: false }),
        returnDisplay: displayMessage,
      };
    }

    const displayMessage = `📋 **工作流模板详情**

**ID**: ${template.id}
**名称**: ${template.name}
**描述**: ${template.description}
**类别**: ${template.category}
**版本**: ${template.version}
**创建时间**: ${template.createdAt}

## 🔄 工作流步骤 (${template.steps.length}个)

${template.steps.map((step, index) => {
  const toolInfo = step.tools ? ` (工具: ${step.tools.join(', ')})` : '';
  const autoInfo = step.autoExecute ? ' 🤖自动执行' : '';
  return `${index + 1}. **${step.name}**${autoInfo}
   ${step.description}${toolInfo}`;
}).join('\n\n')}

## 📊 上下文发现配置

- 📁 项目结构: ${template.contextDiscovery.projectStructure ? '✅' : '❌'}
- 📦 依赖分析: ${template.contextDiscovery.dependencies ? '✅' : '❌'}  
- 📖 文档扫描: ${template.contextDiscovery.documentation ? '✅' : '❌'}
- 🔗 Git状态: ${template.contextDiscovery.gitStatus ? '✅' : '❌'}

💡 **使用方法**: \`create_tasks with template "${template.id}"\``;

    return {
      llmContent: JSON.stringify({
        action: 'get',
        templateId,
        template,
        found: true
      }),
      returnDisplay: displayMessage,
    };
  }

  private async saveTemplate(template: WorkflowTemplate, global: boolean): Promise<ToolResult> {
    try {
      await this.templateService.saveTemplate(template, global);
      
      const scope = global ? '全局' : '项目';
      const displayMessage = `✅ 模板已保存为${scope}模板

**模板ID**: ${template.id}
**名称**: ${template.name}
**描述**: ${template.description}
**类别**: ${template.category}
**步骤数量**: ${template.steps.length}
**存储范围**: ${scope}

💡 **使用方法**: \`create_tasks with template "${template.id}"\``;

      return {
        llmContent: JSON.stringify({
          action: 'save',
          templateId: template.id,
          global,
          success: true
        }),
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const displayMessage = `❌ 保存模板失败: ${error}`;
      return {
        llmContent: JSON.stringify({
          action: 'save',
          templateId: template.id,
          global,
          success: false,
          error: String(error)
        }),
        returnDisplay: displayMessage,
      };
    }
  }

  private async deleteTemplate(templateId: string): Promise<ToolResult> {
    try {
      const deleted = await this.templateService.deleteTemplate(templateId);
      
      if (deleted) {
        const displayMessage = `✅ 模板已删除: ${templateId}`;
        return {
          llmContent: JSON.stringify({
            action: 'delete',
            templateId,
            success: true
          }),
          returnDisplay: displayMessage,
        };
      } else {
        const displayMessage = `❌ 无法删除模板: ${templateId}
可能原因:
- 模板不存在
- 尝试删除内置模板（内置模板无法删除）
- 权限不足`;
        
        return {
          llmContent: JSON.stringify({
            action: 'delete',
            templateId,
            success: false,
            reason: 'template_not_found_or_builtin'
          }),
          returnDisplay: displayMessage,
        };
      }
    } catch (error) {
      const displayMessage = `❌ 删除模板失败: ${error}`;
      return {
        llmContent: JSON.stringify({
          action: 'delete',
          templateId,
          success: false,
          error: String(error)
        }),
        returnDisplay: displayMessage,
      };
    }
  }
}
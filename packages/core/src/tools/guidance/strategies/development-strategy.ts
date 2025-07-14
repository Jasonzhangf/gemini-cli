/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptBuilder } from '../prompt-builder.js';

/**
 * 细菌式编程：开发策略操纵子
 * 小巧：仅负责开发工作流引导
 * 模块化：独立的开发策略单元
 * 自包含：完整的开发引导功能
 */
export class DevelopmentStrategy {
  static buildPrompt(): string {
    return PromptBuilder.create()
      .addToolCallFormat()
      .addCoreMandates()
      .addTaskManagement()
      .addCustomSection('Development Guidelines', this.getDevelopmentGuidelines())
      .addCustomSection('Code Quality Standards', this.getCodeQualityStandards())
      .build();
  }

  private static getDevelopmentGuidelines(): string {
    return `
**Exploration Phase:**
- Use \`[tool_call: read_file for 'path/to/file']\` to understand existing code
- Use \`[tool_call: glob for pattern '**/*.{ts,js,py}']\` to discover project structure
- Use \`[tool_call: grep for pattern 'search_term' include '*.ts']\` to find relevant code

**Planning Phase:**
- Break down complex tasks into smaller, manageable steps
- Identify dependencies and integration points
- Consider existing patterns and conventions

**Implementation Phase:**
- Follow established coding patterns in the project
- Write clean, readable, and maintainable code
- Add appropriate error handling and validation

**Testing Phase:**
- Run existing tests to ensure no regressions
- Add new tests for new functionality
- Verify the implementation meets requirements
`;
  }

  private static getCodeQualityStandards(): string {
    return `
**Code Style:**
- Follow the project's existing formatting and naming conventions
- Use meaningful variable and function names
- Keep functions small and focused on a single responsibility

**Error Handling:**
- Add appropriate try-catch blocks for error-prone operations
- Provide meaningful error messages
- Handle edge cases gracefully

**Documentation:**
- Add JSDoc comments for public APIs
- Include inline comments for complex logic
- Update README files when adding new features

**Performance:**
- Avoid unnecessary computations in loops
- Use efficient algorithms and data structures
- Consider memory usage for large datasets
`;
  }

  static getWorkflowTemplates(): Record<string, string[]> {
    return {
      'explore-plan-code-test': [
        'Explore project structure and existing code',
        'Plan implementation approach',
        'Write clean, maintainable code',
        'Add tests and verify functionality'
      ],
      'bug-fix': [
        'Reproduce and understand the bug',
        'Locate the root cause',
        'Implement the fix',
        'Test the fix and ensure no regressions'
      ],
      'feature-addition': [
        'Analyze requirements and scope',
        'Design the feature architecture',
        'Implement core functionality',
        'Add tests and documentation',
        'Integrate with existing codebase'
      ]
    };
  }

  static formatWorkflowTemplate(templateName: string): string {
    const templates = this.getWorkflowTemplates();
    const steps = templates[templateName];
    
    if (!steps) {
      return `Unknown template: ${templateName}`;
    }

    return `
**${templateName} Workflow:**
${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

**Usage:** \`[tool_call: create_tasks with template "${templateName}" autoContext true]\`
`;
  }
}
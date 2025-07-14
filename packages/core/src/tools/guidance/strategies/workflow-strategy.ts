/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptBuilder } from '../prompt-builder.js';

/**
 * 细菌式编程：工作流策略操纵子
 * 小巧：仅负责工作流程引导
 * 模块化：独立的工作流策略单元
 * 自包含：完整的工作流引导功能
 */
export class WorkflowStrategy {
  static buildPrompt(): string {
    return PromptBuilder.create()
      .addToolCallFormat()
      .addTaskManagement()
      .addCustomSection('Workflow Principles', this.getWorkflowPrinciples())
      .addCustomSection('Task Orchestration', this.getTaskOrchestration())
      .build();
  }

  private static getWorkflowPrinciples(): string {
    return `
**Efficiency Principles:**
- Break complex tasks into manageable chunks
- Execute tasks in logical dependency order
- Minimize context switching between different types of work
- Batch similar operations together

**Quality Assurance:**
- Validate each step before proceeding to the next
- Maintain clear audit trail of all actions
- Test intermediate results to catch issues early
- Document decisions and rationale

**Error Recovery:**
- Design workflows to be resumable after interruption
- Implement checkpoints for long-running processes
- Provide clear error messages and recovery guidance
- Maintain rollback capabilities where possible

**Progress Tracking:**
- Use task lists to track progress
- Update status regularly throughout execution
- Provide clear milestones and completion criteria
- Communicate progress to stakeholders
`;
  }

  private static getTaskOrchestration(): string {
    return `
**Task Creation Strategies:**

**For Development Work:**
\`[tool_call: create_tasks with template "explore-plan-code-test" autoContext true]\`

**For Analysis Work:**
\`[tool_call: create_tasks with template "project-analysis" autoContext true]\`

**For Custom Workflows:**
\`[tool_call: create_tasks for tasks ["step1", "step2", "step3"]]\`

**Task Management Commands:**
- \`[tool_call: get_current_task]\` - Show current active task
- \`[tool_call: get_next_task]\` - Preview upcoming task
- \`[tool_call: finish_current_task for result "completed successfully"]\`
- \`[tool_call: modify_task for taskId 1 updates {"status": "completed"}]\`

**Workflow Templates:**
- List available: \`[tool_call: workflow_template with action "list"]\`
- Get details: \`[tool_call: workflow_template with action "get" templateId "name"]\`
- Create custom: \`[tool_call: workflow_template with action "create" template {...}]\`

**Context Integration:**
Templates with \`autoContext true\` automatically generate:
- System context (environment, tools, capabilities)
- Static context (project structure, dependencies)
- Dynamic context (current state, recent changes)
- Task context (current objectives, constraints)
`;
  }

  static getWorkflowPatterns(): Record<string, WorkflowPattern> {
    return {
      'sequential': {
        name: 'Sequential',
        description: 'Execute tasks one after another in order',
        useCase: 'When tasks have dependencies or build on each other',
        example: 'Setup → Configure → Build → Test → Deploy'
      },
      'parallel': {
        name: 'Parallel',
        description: 'Execute independent tasks simultaneously',
        useCase: 'When tasks are independent and can run concurrently',
        example: 'Run tests + Build docs + Update dependencies'
      },
      'conditional': {
        name: 'Conditional',
        description: 'Execute different paths based on conditions',
        useCase: 'When workflow depends on results of previous steps',
        example: 'If tests pass → Deploy, else → Fix issues'
      },
      'iterative': {
        name: 'Iterative',
        description: 'Repeat a set of tasks until completion criteria met',
        useCase: 'When refinement or multiple attempts are needed',
        example: 'Code → Test → Review → Refine (repeat until approved)'
      }
    };
  }

  static formatWorkflowPattern(patternName: string): string {
    const patterns = this.getWorkflowPatterns();
    const pattern = patterns[patternName];
    
    if (!pattern) {
      return `Unknown workflow pattern: ${patternName}`;
    }

    return `
**${pattern.name} Workflow Pattern:**
- **Description:** ${pattern.description}
- **Use Case:** ${pattern.useCase}
- **Example:** ${pattern.example}
`;
  }
}

interface WorkflowPattern {
  name: string;
  description: string;
  useCase: string;
  example: string;
}
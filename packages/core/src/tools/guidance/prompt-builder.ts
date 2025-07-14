/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 细菌式编程：提示构建操纵子
 * 小巧：仅负责系统提示的构建
 * 模块化：独立的提示生成单元
 * 自包含：完整的提示构建功能
 */
export class PromptBuilder {
  private sections: string[] = [];

  static create(): PromptBuilder {
    return new PromptBuilder();
  }

  addSection(title: string, content: string): this {
    this.sections.push(`# ${title}\n\n${content}\n`);
    return this;
  }

  addToolCallFormat(): this {
    const format = `
**MANDATORY TOOL CALL SYNTAX**: All tool calls MUST use this exact format:
\`[tool_call: tool_name for parameters]\`

**EXAMPLES**:
- \`[tool_call: glob for pattern '**/*.py']\`
- \`[tool_call: read_file for '/path/to/file.py']\`
- \`[tool_call: run_shell_command for 'ls -la']\`
- \`[tool_call: todo for action 'create_list' tasks ["task1", "task2"]]\`

**✅ ALWAYS USE**: The exact [tool_call: ...] format above for ALL tool calls.
**TEMPLATE**: \`[tool_call: TOOL_NAME for PARAMETERS]\`
`;
    return this.addSection('🔧 CRITICAL: Tool Call Format', format);
  }

  addCoreMandates(): this {
    const mandates = `
- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code.
- **Libraries/Frameworks:** NEVER assume a library/framework is available. Verify its usage within the project first.
- **Style & Structure:** Mimic existing code style, structure, and architectural patterns.
- **Comments:** Add code comments sparingly. Focus on *why* something is done.
- **Proactiveness:** Fulfill the user's request thoroughly, including reasonable follow-up actions.
- **Path Construction:** Always use full absolute paths for file system operations.
`;
    return this.addSection('Core Mandates', mandates);
  }

  addTaskManagement(): this {
    const taskMgmt = `
**🚨 MANDATORY**: For ANY request involving multiple distinct steps (3+ steps), you MUST create a task list using the 'todo' tool BEFORE starting work.

**PREFERRED SYNTAX FOR COMPLEX DEVELOPMENT TASKS**: 
\`[tool_call: create_tasks with template "explore-plan-code-test" autoContext true]\`

**WORKFLOW TEMPLATES AVAILABLE:**
- **explore-plan-code-test**: 完整开发工作流 (探索→规划→编码→测试)
- **project-analysis**: 项目分析工作流 (结构分析→依赖分析→文档分析→代码模式)
- **bug-fix**: Bug修复工作流 (重现问题→定位原因→实现修复→验证修复)
`;
    return this.addSection('🎯 UNIVERSAL TASK MANAGEMENT RULE', taskMgmt);
  }

  addToolInstructions(tools: string[]): this {
    if (tools.length === 0) {
      return this;
    }

    const instructions = `
**Available Tools:**
${tools.map(tool => `- ${tool}`).join('\n')}

**Tool Usage Guidelines:**
- Use tools only when necessary to complete the user's request
- Follow the exact syntax format for all tool calls
- Provide clear, actionable parameters for each tool
`;
    return this.addSection('Available Tools', instructions);
  }

  addCustomSection(title: string, content: string): this {
    return this.addSection(title, content);
  }

  build(): string {
    return this.sections.join('\n');
  }

  clear(): this {
    this.sections = [];
    return this;
  }

  clone(): PromptBuilder {
    const newBuilder = new PromptBuilder();
    newBuilder.sections = [...this.sections];
    return newBuilder;
  }
}
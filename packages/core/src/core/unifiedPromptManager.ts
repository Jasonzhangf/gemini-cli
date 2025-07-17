/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { FunctionDeclaration } from '@google/genai';

/**
 * 统一的系统提示词管理器
 * 负责生成一致的、无重复的系统提示词
 */
export class UnifiedPromptManager {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * 生成完整的系统提示词
   */
  generateSystemPrompt(
    tools: FunctionDeclaration[] = [],
    includeContext: boolean = true,
    includeTaskManagement: boolean = false
  ): string {
    const sections: string[] = [];

    // 1. 核心身份和角色
    sections.push(this.generateIdentitySection());

    // 2. 工具调用格式（统一格式，避免重复）
    sections.push(this.generateToolCallSection(tools));

    // 3. 核心准则（统一，避免重复）
    sections.push(this.generateCoreMandatesSection());

    // 4. 任务管理（可选，避免重复）
    if (includeTaskManagement) {
      sections.push(this.generateTaskManagementSection());
    }

    // 5. 内容隔离格式（统一）
    sections.push(this.generateContentIsolationSection());

    // 6. 安全和执行规则
    sections.push(this.generateSafetySection());

    // 7. 上下文相关（可选）
    if (includeContext) {
      sections.push(this.generateContextSection());
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * 生成身份和角色部分
   */
  private generateIdentitySection(): string {
    return `# 🤖 AI Assistant Identity

You are an interactive CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.

**Core Purpose**: Assist with software development, debugging, code analysis, file operations, and project management through direct tool execution.`;
  }

  /**
   * 生成工具调用格式部分（统一，避免重复）
   */
  private generateToolCallSection(tools: FunctionDeclaration[]): string {
    const toolList = tools.length > 0 
      ? tools.map(tool => `- **${tool.name}**: ${tool.description ?? 'No description available'}`).join('\n')
      : '- (No tools available in current context)';

    return `# 🔧 CRITICAL: Tool Call Format

**MANDATORY TOOL CALL SYNTAX**: All tool calls MUST use this exact format:
\`[tool_call: tool_name for parameters]\`

**EXAMPLES**:
- \`[tool_call: glob for pattern '**/*.py']\`
- \`[tool_call: read_file for '/path/to/file.py']\`
- \`[tool_call: run_shell_command for 'ls -la']\`
- \`[tool_call: todo for action 'create_list' tasks ["task1", "task2"]]\`

**✅ ALWAYS USE**: The exact [tool_call: ...] format above for ALL tool calls.
**TEMPLATE**: \`[tool_call: TOOL_NAME for PARAMETERS]\`

## 📋 Available Tools:
${toolList}`;
  }

  /**
   * 生成核心准则部分（统一，避免重复）
   */
  private generateCoreMandatesSection(): string {
    return `# 📜 Core Mandates

- **Conventions**: Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks**: NEVER assume a library/framework is available. Verify its established usage within the project before employing it.
- **Style & Structure**: Mimic existing code style, structure, and architectural patterns.
- **Comments**: Add code comments sparingly. Focus on *why* something is done, not *what* is being done.
- **Proactiveness**: Fulfill the user's request thoroughly, including reasonable follow-up actions.
- **Path Construction**: Always use full absolute paths for file system operations.
- **Execution First**: Use tools to actually perform actions rather than just describing what you would do.
- **Safety**: Always ask for permission before using potentially dangerous tools that modify files or execute system commands.`;
  }

  /**
   * 生成任务管理部分（可选，避免重复）
   */
  private generateTaskManagementSection(): string {
    return `# 🎯 Task Management

For ANY request involving 2+ distinct operations, you MUST create a task list BEFORE starting work:
\`[tool_call: todo for action 'create_list' tasks ["task1", "task2", "task3"]]\`

**Examples requiring task creation**:
- File organization + cleanup workflows
- Analysis + action requests (analyze code + fix issues)
- Multi-step implementations or system changes
- Any request with "and", "then", "after", multiple verbs

**Task Completion**: When a task is finished, mark it as completed:
\`[tool_call: todo for action 'update' taskId 'task_id' status 'completed']\``;
  }

  /**
   * 生成内容隔离格式部分（保留用于大文件操作）
   */
  private generateContentIsolationSection(): string {
    return `# 📄 Content Isolation Format (Large Files)

For tools with large content (write_file, replace), you can use Content Isolation format:

**🆕 CONTENT ISOLATION FORMAT**:
- ✦ write_file ./path/to/file.md <*#*#CONTENT#*#*>
Your actual file content here...
Can span multiple lines
And contain any characters including { } " ' 
</*#*#CONTENT#*#*>

- ✦ replace ./path/to/file.js <*#*#CONTENT#*#*>
old code here|||new code here
</*#*#CONTENT#*#*>

**Note**: For replace tool, use "|||" to separate old_string from new_string`;
  }

  /**
   * 生成安全和执行规则部分
   */
  private generateSafetySection(): string {
    return `# 🛡️ Safety & Execution Rules

## 🚨 ABSOLUTE RULES - NO EXCEPTIONS:
1. NEVER claim to have created, written, or modified files without using the actual tools
2. NEVER say "已保存到", "已写入", "saved to", "written to" unless you used the write_file tool
3. NEVER describe what you would do - ALWAYS use tools to actually do it
4. WITHOUT TOOL CALLS, YOUR RESPONSE IS JUST PLANNING - NOT EXECUTION

## ⚠️ DANGEROUS TOOLS:
Tools marked with ⚠️ [DANGEROUS] can modify the system or files and require explicit user approval before execution. These include:
- run_shell_command: Execute system commands
- write_file: Create or overwrite files  
- replace: Modify file contents

Always ask for permission before using these tools and explain what you plan to do.

## ✅ EXECUTION PATTERN:
- **CORRECT**: "I will create the file now:" followed by [tool_call: write_file for ...]
- **WRONG**: "I have created the file at ./docs/example.md" (without tool call)`;
  }

  /**
   * 生成上下文相关部分
   */
  private generateContextSection(): string {
    const analysisMode = this.config.getAnalysisSettings()?.mode || 'vector';
    const isDebugMode = this.config.getDebugMode();

    return `# 🧠 Context & Analysis

**Analysis Mode**: ${analysisMode}
**Debug Mode**: ${isDebugMode ? 'Enabled' : 'Disabled'}

This system uses advanced context analysis with RAG (Retrieval-Augmented Generation) to provide relevant code context and semantic understanding of your project.

**Context Layers (L0-L4)**:
- **L0**: Project structure discovery
- **L1**: Code entity mapping  
- **L2**: Semantic relationships
- **L3**: Contextual patterns
- **L4**: Intelligent inference

The context system will automatically provide relevant information based on your queries and the current project state.`;
  }

  /**
   * 生成工具特定的引导（根据工具列表动态生成）
   */
  generateToolSpecificGuidance(tools: FunctionDeclaration[]): string {
    if (tools.length === 0) return '';

    const sections: string[] = [];
    
    // 根据工具类型生成特定指导
    const hasFileTools = tools.some(t => t.name && ['read_file', 'write_file', 'replace'].includes(t.name));
    const hasShellTools = tools.some(t => t.name === 'run_shell_command');
    const hasTodoTools = tools.some(t => t.name === 'todo');

    if (hasFileTools) {
      sections.push(this.generateFileToolGuidance());
    }

    if (hasShellTools) {
      sections.push(this.generateShellToolGuidance());
    }

    if (hasTodoTools) {
      sections.push(this.generateTodoToolGuidance());
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  }

  /**
   * 生成文件工具特定指导
   */
  private generateFileToolGuidance(): string {
    return `## 📁 File Operations

- Always read files before modifying them to understand the current content
- Use absolute paths for all file operations
- For large files, consider using Content Isolation format
- Verify file existence before attempting operations`;
  }

  /**
   * 生成Shell工具特定指导
   */
  private generateShellToolGuidance(): string {
    return `## 💻 Shell Commands

- Always explain what a command will do before executing it
- Use safe commands that don't modify system state without permission
- Prefer built-in tools over shell commands when possible
- Be cautious with commands that can affect system stability`;
  }

  /**
   * 生成Todo工具特定指导
   */
  private generateTodoToolGuidance(): string {
    return `## 📋 Task Management

- Create task lists for multi-step operations
- Update task status as work progresses
- Break down complex requests into manageable tasks
- Use descriptive task names that clearly indicate the work to be done`;
  }
}
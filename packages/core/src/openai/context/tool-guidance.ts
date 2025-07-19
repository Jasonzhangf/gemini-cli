/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 工具指导生成器
 * 实现细菌式编程：小巧、模块化、自包含
 */
export class ToolGuidanceGenerator {
  private readonly toolDeclarations: any[];
  private readonly dangerousTools: Set<string>;
  private readonly complexTools: Set<string>;
  private readonly contextManager: any;

  constructor(
    toolDeclarations: any[],
    dangerousTools: Set<string>,
    complexTools: Set<string>,
    contextManager: any
  ) {
    this.toolDeclarations = toolDeclarations;
    this.dangerousTools = dangerousTools;
    this.complexTools = complexTools;
    this.contextManager = contextManager;
  }

  /**
   * 生成工具指导
   */
  generate(): string {
    if (this.toolDeclarations.length === 0) {
      return '';
    }

    const availableTools = this.getAvailableTools();
    const toolDescriptions = this.generateToolDescriptions(availableTools);

    return `\n\n# 🔧 CRITICAL: Tool Call Format
**MANDATORY TOOL CALL SYNTAX**: All tool calls MUST use this exact format:
\`[tool_call: tool_name for parameters]\`

**EXAMPLES**:
- \`[tool_call: glob for pattern '**/*.py']\`
- \`[tool_call: read_file for '/path/to/file.py']\`
- \`[tool_call: run_shell_command for 'ls -la']\`
- \`[tool_call: create_tasks for {"tasks": ["任务1", "任务2", "任务3"]}]\`

**✅ ALWAYS USE**: The exact [tool_call: ...] format above for ALL tool calls.
**TEMPLATE**: \`[tool_call: TOOL_NAME for PARAMETERS]\`

**🆕 CONTENT ISOLATION FORMAT (for write_file, replace with large content):**
- ✦ write_file ./path/to/file.md <*#*#CONTENT#*#*>
Your actual file content here...
Can span multiple lines
And contain any characters including { } " ' 
</*#*#CONTENT#*#*>

- ✦ replace ./path/to/file.js <*#*#CONTENT#*#*>
old code here|||new code here
</*#*#CONTENT#*#*>

**Note:** For replace tool, use "|||" to separate old_string from new_string

🚨🚨🚨 ABSOLUTE RULES - NO EXCEPTIONS 🚨🚨🚨:
1. NEVER claim to have created, written, or modified files without using the actual tools
2. NEVER say "已保存到", "已写入", "saved to", "written to" unless you used the write_file tool
3. NEVER describe what you would do - ALWAYS use tools to actually do it
4. If you need to write a file, you MUST use: [tool_call: write_file for file_path './path' content '...']
5. If you need to modify a file, you MUST use: [tool_call: replace for file_path './path' old_string '...' new_string '...']
6. WITHOUT TOOL CALLS, YOUR RESPONSE IS JUST PLANNING - NOT EXECUTION
7. FOR COMPLEX TOOLS (write_file, replace, create_tasks): ONLY use JSON format - descriptive format will FAIL

🎯 🚨 TASK MANAGEMENT RULES 🚨:
**NON-MAINTENANCE MODE** (can create tasks):
- For complex requests with 2+ operations, create task list: [tool_call: create_tasks for {"tasks": ["任务1", "任务2", "任务3"]}]

**MAINTENANCE MODE** (cannot create tasks):
- Use get_current_task to check current work
- Use finish_current_task when completed
- Use insert_task to add sub-tasks if needed
- NEVER use create_tasks in maintenance mode

📋 AVAILABLE TOOLS:
${toolDescriptions}

⚠️ MANDATORY EXECUTION PATTERN:
✅ CORRECT: "I will create the file now:" followed by [tool_call: write_file for ...]
❌ WRONG: "I have created the file at ./docs/example.md" (without tool call)

🚨 DANGEROUS TOOLS:
Tools marked with ⚠️ [DANGEROUS] can modify the system or files and require explicit user approval before execution. These include:
- run_shell_command: Execute system commands
- write_file: Create or overwrite files  
- replace: Modify file contents
Always ask for permission before using these tools and explain what you plan to do.

⚡ LARGE CONTENT TOOLS:
For tools with large content (write_file, replace), you can use Content Isolation format:
- write_file: [tool_call: write_file for file_path './path'] OR ✦ write_file ./path <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
- replace: [tool_call: replace for file_path './path' old_string '...' new_string '...'] OR ✦ replace ./path <*#*#CONTENT#*#*>old|||new</*#*#CONTENT#*#*>

The user will execute the tools and provide you with the results. Use the results to provide comprehensive analysis and insights.`;
  }

  /**
   * 获取可用工具 - 实现维护模式互斥逻辑
   * 维护模式：禁止create_tasks，允许其他任务工具
   * 非维护模式：允许create_tasks，禁止维护专用工具
   */
  private getAvailableTools(): any[] {
    let availableTools = this.toolDeclarations;
    
    if (this.contextManager?.isInMaintenanceMode()) {
      // 维护模式：移除create_tasks，保留其他任务管理工具
      availableTools = this.toolDeclarations.filter(tool => 
        tool.name !== 'create_tasks'
      );
    } else {
      // 非维护模式：移除维护专用工具，保留create_tasks
      availableTools = this.toolDeclarations.filter(tool => 
        !['finish_current_task', 'insert_task', 'modify_task'].includes(tool.name)
      );
    }
    
    return availableTools;
  }

  /**
   * 生成工具描述
   */
  private generateToolDescriptions(tools: any[]): string {
    return tools.map(tool => {
      const params = tool.parameters?.properties || {};
      const required = tool.parameters?.required || [];
      const isDangerous = this.dangerousTools.has(tool.name);
      const isComplex = this.complexTools.has(tool.name);
      
      const paramDescriptions = this.generateParameterDescriptions(params, required);
      const example = this.generateToolExample(tool.name, params);
      
      const dangerousWarning = isDangerous ? ' ⚠️ [DANGEROUS - Requires user approval]' : '';
      const complexWarning = isComplex ? ' ⚡ [JSON OR CONTENT ISOLATION - No simple descriptive format]' : '';

      return `• ${tool.name}${dangerousWarning}${complexWarning}: ${tool.description || 'No description'}
${paramDescriptions}
  Example: ${example}`;
    }).join('\n\n');
  }

  /**
   * 生成参数描述
   */
  private generateParameterDescriptions(params: any, required: string[]): string {
    return Object.entries(params).map(([name, prop]: [string, any]) => {
      const isRequired = required.includes(name);
      const typeInfo = prop.type ? `(${prop.type})` : '';
      const requiredMark = isRequired ? '*' : '';
      return `  ${name}${requiredMark}${typeInfo}: ${prop.description || 'No description'}`;
    }).join('\n');
  }

  /**
   * 生成工具示例
   */
  private generateToolExample(toolName: string, params: any): string {
    const examples: Record<string, string> = {
      'read_file': '[tool_call: read_file for {"file_path": "./src/main.js"}]',
      'list_directory': '[tool_call: list_directory for {"path": "."}]',
      'search_file_content': '[tool_call: search_file_content for {"query": "function", "file_paths": ["./src/**/*.js"]}]',
      'write_file': '[tool_call: write_file for {"file_path": "./output.txt", "content": "Hello World"}]',
      'run_shell_command': '[tool_call: run_shell_command for {"command": "ls -la", "description": "List files"}]',
      'replace': '[tool_call: replace for {"file_path": "./file.txt", "old_string": "old", "new_string": "new"}]',
      'glob': '[tool_call: glob for {"patterns": ["**/*.js", "**/*.ts"]}]',
      'web_fetch': '[tool_call: web_fetch for {"url": "https://example.com"}]',
      'read_many_files': '[tool_call: read_many_files for {"paths": ["./src/*.js"]}]',
      'save_memory': '[tool_call: save_memory for {"key": "project_info", "value": "Important findings"}]',
      'google_web_search': '[tool_call: google_web_search for {"query": "search terms"}]',
      'create_tasks': '[tool_call: create_tasks for {"tasks": ["分析需求", "设计方案", "实现功能", "编写测试", "部署上线"]}]',
      'get_current_task': '[tool_call: get_current_task for {}]',
      'finish_current_task': '[tool_call: finish_current_task for {}]',
      'insert_task': '[tool_call: insert_task for {"description": "新任务描述", "position": "after_current"}]',
      'modify_task': '[tool_call: modify_task for {"taskId": "task-id", "description": "修改后的任务描述"}]'
    };

    if (examples[toolName]) {
      return examples[toolName];
    }

    // 通用示例生成
    const firstParam = Object.keys(params)[0];
    if (firstParam) {
      return `[tool_call: ${toolName} for {"${firstParam}": "value"}]`;
    }

    return `[tool_call: ${toolName} for {}]`;
  }
}
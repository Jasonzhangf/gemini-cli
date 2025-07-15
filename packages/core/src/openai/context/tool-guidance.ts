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

    return `\n\n🔧 TOOL CALLING INSTRUCTIONS:
You have access to powerful tools to help analyze and work with files and data. When you need to use a tool, format your response EXACTLY like this:

✦ {"name": "tool_name", "arguments": {"param": "value"}}

📝 ALTERNATIVE FORMATS:

**JSON Formats:**
- \`\`\`json\n{"name": "tool_name", "arguments": {"param": "value"}}\n\`\`\`
- tool_call: {"name": "tool_name", "arguments": {"param": "value"}}
- \`\`\`\n{"name": "tool_name", "arguments": {"param": "value"}}\n\`\`\`

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
4. If you need to write a file, you MUST use: ✦ {"name": "write_file", "arguments": {"file_path": "./path", "content": "..."}}
5. If you need to modify a file, you MUST use: ✦ {"name": "replace", "arguments": {"file_path": "./path", "old_string": "...", "new_string": "..."}}
6. WITHOUT TOOL CALLS, YOUR RESPONSE IS JUST PLANNING - NOT EXECUTION
7. FOR COMPLEX TOOLS (write_file, replace, create_tasks): ONLY use JSON format - descriptive format will FAIL

🎯 🚨 CRITICAL TASK MANAGEMENT RULE 🚨:
For ANY request involving 2+ distinct operations (like "清理空文件夹" + "合并目录"), you MUST IMMEDIATELY create a task list BEFORE starting work:
✦ {"name": "todo", "arguments": {"action": "create_list", "tasks": ["清理空文件夹", "识别相似目录", "合并目录", "分类整理"]}}

Examples requiring IMMEDIATE task creation:
- File organization + cleanup workflows  
- Analysis + action requests (analyze code + fix issues)
- Multi-step implementations or system changes
- Any request with "and", "then", "after", multiple verbs

📋 AVAILABLE TOOLS:
${toolDescriptions}

⚠️ MANDATORY EXECUTION PATTERN:
✅ CORRECT: "I will create the file now:" followed by ✦ {"name": "write_file", ...}
❌ WRONG: "I have created the file at ./docs/example.md" (without tool call)

🚨 DANGEROUS TOOLS:
Tools marked with ⚠️ [DANGEROUS] can modify the system or files and require explicit user approval before execution. These include:
- run_shell_command: Execute system commands
- write_file: Create or overwrite files  
- replace: Modify file contents
Always ask for permission before using these tools and explain what you plan to do.

⚡ COMPLEX TOOLS REQUIRING SPECIAL FORMAT:
These tools MUST use JSON format OR Content Isolation format and CANNOT use simple descriptive format:
- write_file: Use JSON or ✦ write_file ./path <*#*#CONTENT#*#*>content</*#*#CONTENT#*#*>
- replace: Use JSON or ✦ replace ./path <*#*#CONTENT#*#*>old|||new</*#*#CONTENT#*#*>  
- create_tasks: Use JSON format for structured task arrays

The user will execute the tools and provide you with the results. Use the results to provide comprehensive analysis and insights.`;
  }

  /**
   * 获取可用工具
   */
  private getAvailableTools(): any[] {
    let availableTools = this.toolDeclarations;
    
    // 在维护模式下过滤工具
    if (this.contextManager?.isInMaintenanceMode()) {
      availableTools = this.toolDeclarations.filter(tool => tool.name !== 'create_tasks');
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
      'read_file': '✦ {"name": "read_file", "arguments": {"file_path": "./src/main.js"}}',
      'list_directory': '✦ {"name": "list_directory", "arguments": {"path": "."}}',
      'search_file_content': '✦ {"name": "search_file_content", "arguments": {"query": "function", "file_paths": ["./src/**/*.js"]}}',
      'write_file': '✦ {"name": "write_file", "arguments": {"file_path": "./output.txt", "content": "Hello World"}}',
      'run_shell_command': '✦ {"name": "run_shell_command", "arguments": {"command": "echo \'import os; print(\"Hello from Python\")\' > temp.py && python temp.py", "description": "Create and execute Python script for complex tasks"}}',
      'replace': '✦ {"name": "replace", "arguments": {"file_path": "./file.txt", "old_string": "old", "new_string": "new"}}',
      'glob': '✦ {"name": "glob", "arguments": {"patterns": ["**/*.js", "**/*.ts"]}}',
      'web_fetch': '✦ {"name": "web_fetch", "arguments": {"url": "https://example.com"}}',
      'read_many_files': '✦ {"name": "read_many_files", "arguments": {"paths": ["./src/*.js"]}}',
      'save_memory': '✦ {"name": "save_memory", "arguments": {"key": "project_info", "value": "Important findings"}}',
      'google_web_search': '✦ {"name": "google_web_search", "arguments": {"query": "search terms"}}',
      'todo': '✦ {"name": "todo", "arguments": {"action": "create_list", "tasks": ["实现功能A", "测试功能B", "修复bug C"]}}'
    };

    if (examples[toolName]) {
      return examples[toolName];
    }

    // 通用示例生成
    const firstParam = Object.keys(params)[0];
    if (firstParam) {
      return `✦ {"name": "${toolName}", "arguments": {"${firstParam}": "value"}}`;
    }

    return `✦ {"name": "${toolName}", "arguments": {}}`;
  }
}
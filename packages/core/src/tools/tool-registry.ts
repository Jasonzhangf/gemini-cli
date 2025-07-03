/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { Tool, ToolResult, BaseTool } from './tools.js';
import { Config } from '../config/config.js';
import { spawn, execSync } from 'node:child_process';
import { discoverMcpTools } from './mcp-client.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ModelCapabilityAdapter, ModelCapability, ModelCapabilityDetector } from './model-capability-adapter.js';

type ToolParams = Record<string, unknown>;

export class DiscoveredTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    description += `

This tool was discovered from the project by executing the command \`${discoveryCmd}\` on project root.
When called, this tool will execute the command \`${callCommand} ${name}\` on project root.
Tool discovery and call commands can be configured in project or user settings.

When called, the tool call command is executed as a subprocess.
On success, tool output is returned as a json string.
Otherwise, the following information is returned:

Stdout: Output on stdout stream. Can be \`(empty)\` or partial.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
`;
    super(
      name,
      name,
      description,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.name]);
    child.stdin.write(JSON.stringify(params));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let error: Error | null = null;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;

    await new Promise<void>((resolve) => {
      const onStdout = (data: Buffer) => {
        stdout += data?.toString();
      };

      const onStderr = (data: Buffer) => {
        stderr += data?.toString();
      };

      const onError = (err: Error) => {
        error = err;
      };

      const onClose = (
        _code: number | null,
        _signal: NodeJS.Signals | null,
      ) => {
        code = _code;
        signal = _signal;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
        child.removeListener('error', onError);
        child.removeListener('close', onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('close', onClose);
    });

    // if there is any error, non-zero exit code, signal, or stderr, return error details instead of stdout
    if (error || code !== 0 || signal || stderr) {
      const llmContent = [
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
      ].join('\n');
      return {
        llmContent,
        returnDisplay: llmContent,
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private discovery: Promise<void> | null = null;
  private config: Config;
  private modelCapabilityAdapter: ModelCapabilityAdapter | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Registers a tool definition.
   * @param tool - The tool object containing schema and execution logic.
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      // Decide on behavior: throw error, log warning, or allow overwrite
      console.warn(
        `Tool with name "${tool.name}" is already registered. Overwriting.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Registers multiple tool definitions.
   * @param tools - An array of tool objects.
   */
  registerTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Discovers tools from project (if available and configured).
   * Can be called multiple times to update discovered tools.
   */
  async discoverTools(): Promise<void> {
    // remove any previously discovered tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool || tool instanceof DiscoveredMCPTool) {
        this.tools.delete(tool.name);
      } else {
        // Keep manually registered tools
      }
    }
    // discover tools using discovery command, if configured
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (discoveryCmd) {
      // execute discovery command and extract function declarations (w/ or w/o "tool" wrappers)
      const functions: FunctionDeclaration[] = [];
      for (const tool of JSON.parse(execSync(discoveryCmd).toString().trim())) {
        if (tool['function_declarations']) {
          functions.push(...tool['function_declarations']);
        } else if (tool['functionDeclarations']) {
          functions.push(...tool['functionDeclarations']);
        } else if (tool['name']) {
          functions.push(tool);
        }
      }
      // register each function as a tool
      for (const func of functions) {
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name!,
            func.description!,
            func.parameters! as Record<string, unknown>,
          ),
        );
      }
    }
    // discover tools using MCP servers, if configured
    await discoverMcpTools(
      this.config.getMcpServers() ?? {},
      this.config.getMcpServerCommand(),
      this,
    );
  }

  /**
   * 设置模型能力适配器
   * @param modelName 模型名称
   * @param isOpenAICompatible 是否使用 OpenAI 兼容接口
   */
  setModelCapability(modelName: string, isOpenAICompatible: boolean): void {
    let capability = ModelCapabilityDetector.detectCapability(modelName, isOpenAICompatible);
    
    // 如果强制使用JSON工具调用模式，覆盖检测到的能力
    if (process.env.FORCE_JSON_TOOL_CALLS === 'true') {
      capability = ModelCapability.JSON_TOOL_CALLS;
      console.log(`🔧 FORCE_JSON_TOOL_CALLS override: forcing ${capability} for model: ${modelName}`);
    } else {
      console.log(`🔧 Model capability detected: ${capability} for model: ${modelName}`);
    }
    
    this.modelCapabilityAdapter = new ModelCapabilityAdapter(capability, this.getAllTools());
  }

  /**
   * Retrieves the list of tool schemas (FunctionDeclaration array).
   * Extracts the declarations from the ToolListUnion structure.
   * Includes discovered (vs registered) tools if configured.
   * @returns An array of FunctionDeclarations.
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    // 如果有模型能力适配器，使用适配器提供的声明
    if (this.modelCapabilityAdapter) {
      return this.modelCapabilityAdapter.getToolDeclarations();
    }
    
    // 否则返回原始声明
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * Returns an array of all registered and discovered tool instances.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns an array of tools registered from a specific MCP server.
   */
  getToolsByServer(serverName: string): Tool[] {
    const serverTools: Tool[] = [];
    for (const tool of this.tools.values()) {
      if ((tool as DiscoveredMCPTool)?.serverName === serverName) {
        serverTools.push(tool);
      }
    }
    return serverTools;
  }

  /**
   * Get the definition of a specific tool.
   * 支持通过适配器进行工具调用转换
   */
  getTool(name: string): Tool | undefined {
    // 如果有适配器，先尝试转换工具调用
    if (this.modelCapabilityAdapter) {
      const { realToolName } = this.modelCapabilityAdapter.convertToolCall(name, {});
      return this.tools.get(realToolName);
    }
    
    return this.tools.get(name);
  }

  /**
   * 执行工具调用，支持适配器转换
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   */
  async executeToolCall(toolName: string, args: any): Promise<ToolResult | null> {
    let realToolName = toolName;
    let realArgs = args;

    // 使用适配器转换工具调用
    if (this.modelCapabilityAdapter) {
      const converted = this.modelCapabilityAdapter.convertToolCall(toolName, args);
      realToolName = converted.realToolName;
      realArgs = converted.realArgs;
      
      console.log(`🔄 Tool call converted: "${toolName}" → "${realToolName}"`);
    }

    const tool = this.tools.get(realToolName);
    if (!tool) {
      console.error(`❌ Tool "${realToolName}" not found in registry`);
      return null;
    }

    try {
      return await tool.execute(realArgs, new AbortController().signal);
    } catch (error) {
      console.error(`❌ Error executing tool "${realToolName}":`, error);
      return null;
    }
  }

  /**
   * 获取模型能力适配器
   */
  getModelCapabilityAdapter(): ModelCapabilityAdapter | null {
    return this.modelCapabilityAdapter;
  }
}

export function isComplexTool(toolName: string): boolean {
  return toolName === 'knowledge_graph' || toolName === 'sequentialthinking';
}

export function isSequentialThinkingTool(toolName: string): boolean {
  return toolName === 'sequentialthinking';
}

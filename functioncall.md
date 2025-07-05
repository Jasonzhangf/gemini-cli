# Gemini CLI Function Call 官方实现流程

本文档详细描述了Gemini CLI中官方Function Call的完整实现流程，包括工具注册、模型对接、执行流程和多轮对话处理。

## 1. 工具注册机制

### 1.1 工具定义结构

#### 核心接口 (`tools.ts`)
```typescript
interface Tool<TParams, TResult> {
  name: string;
  displayName?: string;
  description: string;
  schema: FunctionDeclaration;
  validateToolParams(params: Record<string, unknown>): TParams;
  execute(params: TParams, signal?: AbortSignal): Promise<ToolResult<TResult>>;
  shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
}
```

#### 工具结果格式
```typescript
interface ToolResult<TResult = unknown> {
  llmContent: PartListUnion;
  resultDisplay?: ToolResultDisplay;
  result?: TResult;
}
```

### 1.2 工具注册表管理

#### ToolRegistry类 (`tool-registry.ts`)
```typescript
class ToolRegistry {
  private tools: Map<string, Tool<unknown, unknown>> = new Map();
  
  // 手动注册工具
  registerTool(tool: Tool<unknown, unknown>): void {
    this.tools.set(tool.name, tool);
  }
  
  // 自动发现项目工具
  async discoverTools(discoveryCmd: string): Promise<void> {
    const functions: FunctionDeclaration[] = [];
    const result = execSync(discoveryCmd).toString().trim();
    
    for (const tool of JSON.parse(result)) {
      if (tool['function_declarations']) {
        functions.push(...tool['function_declarations']);
      } else if (tool['functionDeclarations']) {
        functions.push(...tool['functionDeclarations']);
      } else if (tool['name']) {
        functions.push(tool);
      }
    }
    
    // 创建动态工具包装器
    this.registerDiscoveredTools(functions);
  }
}
```

### 1.3 工具发现流程

1. **配置发现命令**: 通过GEMINI.md或配置文件设置`discoveryCmd`
2. **执行发现**: 运行命令并解析JSON输出
3. **格式解析**: 支持多种格式的函数声明
4. **自动注册**: 创建动态工具包装器并注册到注册表

## 2. 模型对接流程

### 2.1 工具定义传递

#### 客户端初始化 (`client.ts`)
```typescript
async startChat(history?: Content[]): Promise<GeminiChat> {
  // 获取工具定义
  const toolRegistry = await this.config.getToolRegistry();
  const toolDeclarations = toolRegistry.getFunctionDeclarations();
  const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
  
  // 创建聊天实例
  return new GeminiChat(
    this.config,
    this.getContentGenerator(),
    {
      systemInstruction,
      ...generateContentConfigWithThinking,
      tools, // 工具定义传递给模型
    },
    history,
  );
}
```

### 2.2 GenerateContentParameters结构

```typescript
interface GenerateContentParameters {
  model: string;
  contents: Content[];
  config?: GenerateContentConfig;
}

interface GenerateContentConfig {
  tools?: Tool[];
  systemInstruction?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  toolConfig?: ToolConfig;
}
```

### 2.3 不同模式的工具传递

#### 标准Gemini API
- 直接通过`config.tools`传递工具定义
- 使用原生Function Call格式

#### OpenAI兼容模式
```typescript
// 转换为OpenAI格式
for (const tool of requestTools) {
  if (tool.functionDeclarations) {
    for (const func of tool.functionDeclarations) {
      tools.push({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      });
    }
  }
}
```

#### 文本劫持模式
```typescript
// 转换为系统消息格式
const systemGuidance = `You are an AI assistant with access to the following tools...

Available tools:
${toolDescriptions.join('\n\n')}`;

messages.unshift({
  role: 'system',
  content: systemGuidance
});
```

## 3. 工具查找和执行流程

### 3.1 Function Call解析

#### Turn类处理 (`turn.ts`)
```typescript
async *run(req: PartListUnion, signal: AbortSignal): AsyncGenerator<ServerGeminiStreamEvent> {
  for await (const resp of responseStream) {
    // 处理函数调用
    const functionCalls = resp.functionCalls ?? [];
    for (const fnCall of functionCalls) {
      const event = this.handlePendingFunctionCall(fnCall);
      if (event) {
        yield event;
      }
    }
  }
}

private handlePendingFunctionCall(fnCall: FunctionCall): ServerGeminiStreamEvent | null {
  const toolCallRequest: ToolCallRequestInfo = {
    callId: fnCall.id ?? `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: fnCall.name || 'undefined_tool_name',
    args: (fnCall.args || {}) as Record<string, unknown>,
    isClientInitiated: false,
  };
  
  this.pendingToolCalls.push(toolCallRequest);
  return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
}
```

### 3.2 工具调度和执行

#### CoreToolScheduler (`coreToolScheduler.ts`)
```typescript
class CoreToolScheduler {
  async scheduleToolCall(request: ToolCallRequestInfo): Promise<void> {
    // 1. 查找工具
    const tool = this.toolRegistry.getTool(request.name);
    if (!tool) {
      this.handleToolNotFound(request);
      return;
    }
    
    // 2. 验证参数
    let validatedParams;
    try {
      validatedParams = tool.validateToolParams(request.args);
    } catch (error) {
      this.handleValidationError(request, error);
      return;
    }
    
    // 3. 检查是否需要确认
    const confirmationDetails = await tool.shouldConfirmExecute(validatedParams, signal);
    if (confirmationDetails) {
      await this.handleConfirmation(request, confirmationDetails);
    }
    
    // 4. 执行工具
    this.executeToolCall(request, tool, validatedParams);
  }
  
  private async executeToolCall(request: ToolCallRequestInfo, tool: Tool, params: any): Promise<void> {
    try {
      const toolResult = await tool.execute(params, signal, liveOutputCallback);
      
      // 转换为Function Response格式
      const response = convertToFunctionResponse(
        request.name,
        request.callId,
        toolResult.llmContent,
      );
      
      this.handleSuccessfulExecution(request, response, toolResult);
    } catch (error) {
      this.handleExecutionError(request, error);
    }
  }
}
```

### 3.3 错误处理机制

1. **工具未找到**: 返回错误信息的`functionResponse`
2. **参数验证失败**: 提供详细的验证错误信息  
3. **执行异常**: 捕获并转换为结构化错误响应
4. **用户取消**: 通过`AbortSignal`支持取消操作

## 4. 多轮对话处理

### 4.1 对话历史管理

#### GeminiChat类 (`geminiChat.ts`)
```typescript
private recordHistory(
  userInput: Content,
  modelOutput: Content[],
  automaticFunctionCallingHistory?: Content[],
) {
  // 处理自动函数调用历史
  if (automaticFunctionCallingHistory && automaticFunctionCallingHistory.length > 0) {
    this.history.push(
      ...extractCuratedHistory(automaticFunctionCallingHistory),
    );
  } else {
    this.history.push(userInput);
  }
  
  // 合并相邻的模型响应
  const consolidatedOutputContents = this.consolidateModelResponses(modelOutput);
  this.history.push(...consolidatedOutputContents);
}
```

### 4.2 automaticFunctionCallingHistory的作用

```typescript
// 去重处理，避免重复记录历史
const fullAutomaticFunctionCallingHistory = response.automaticFunctionCallingHistory;
const index = this.getHistory(true).length;
let automaticFunctionCallingHistory: Content[] = [];

if (fullAutomaticFunctionCallingHistory != null) {
  automaticFunctionCallingHistory = fullAutomaticFunctionCallingHistory.slice(index) ?? [];
}
```

**作用**:
- 包含模型发起的工具调用和响应的完整对话链
- 确保工具调用上下文的完整性
- 支持复杂的多步骤工具调用场景

### 4.3 上下文传递机制

#### 每次请求的上下文构建
```typescript
async sendMessage(params: SendMessageParameters): Promise<GenerateContentResponse> {
  // 构建完整请求上下文
  const requestContents = this.getHistory(true).concat(userContent);
  
  const response = await this.contentGenerator.generateContent({
    model: this.config.getModel(),
    contents: requestContents, // 完整对话历史
    config: { ...this.generationConfig, ...params.config },
  });
}
```

#### 历史类型管理
- **完整历史** (`getHistory(false)`): 包含所有交互记录，用于调试
- **策展历史** (`getHistory(true)`): 只包含有效交互，用于API请求

## 5. 高级功能

### 5.1 上下文压缩

```typescript
async tryCompressChat(force: boolean = false): Promise<ChatCompressionInfo | null> {
  const model = this.config.getModel();
  const originalTokenCount = await this.countTokens();
  
  // 检查是否需要压缩
  if (!force && originalTokenCount < this.TOKEN_THRESHOLD_FOR_SUMMARIZATION * tokenLimit(model)) {
    return null;
  }
  
  // 执行压缩逻辑
  const summaryResponse = await this.generateCompressionSummary();
  this.applyCompression(summaryResponse);
  
  return {
    originalTokenCount,
    newTokenCount: await this.countTokens(),
  };
}
```

### 5.2 工具确认机制

```typescript
async shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
  // 检查是否需要用户确认
  if (this.requiresConfirmation(params)) {
    return {
      message: "This action will modify files. Continue?",
      allowEditingArguments: true,
      defaultApproval: false,
    };
  }
  return false;
}
```

### 5.3 流式处理

- **实时输出**: 工具执行过程中的实时反馈
- **状态同步**: 通过事件机制同步执行状态
- **性能优化**: 大消息分割和静态渲染

## 6. 架构总结

Gemini CLI的Function Call实现具有以下特点：

1. **模块化设计**: 工具注册、调度、执行分离
2. **多模式支持**: 原生API、OpenAI兼容、文本劫持
3. **完整生命周期**: 从发现到执行的全流程管理
4. **企业级特性**: 确认机制、错误处理、上下文管理
5. **性能优化**: 历史压缩、流式处理、参数映射

这种设计使得系统既能支持简单的工具调用，也能处理复杂的多步骤、多轮对话场景，同时保持良好的扩展性和维护性。
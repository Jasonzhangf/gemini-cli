# Gemini CLI 上下文传递机制详解

本文档详细描述了Gemini CLI中每次对话系统如何发送上下文的机制，包括不同模式下的上下文构建、传递和管理。

## 1. 上下文构建过程

### 1.1 基础上下文构建

#### 核心流程 (`geminiChat.ts:sendMessage`)
```typescript
async sendMessage(params: SendMessageParameters): Promise<GenerateContentResponse> {
  // 1. 创建用户内容
  const userContent = createUserContent(params.message);
  
  // 2. 构建完整请求上下文
  const requestContents = this.getHistory(true).concat(userContent);
  
  // 3. 发送到API
  const response = await this.contentGenerator.generateContent({
    model: this.config.getModel(),
    contents: requestContents, // 完整对话历史 + 当前输入
    config: { ...this.generationConfig, ...params.config },
  });
}
```

#### 上下文组成结构
```
requestContents = [策展历史] + [当前用户输入]
                = getHistory(true) + createUserContent(message)
```

### 1.2 Content数据结构

```typescript
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

interface Part {
  text?: string;                    // 文本内容
  functionCall?: FunctionCall;      // 函数调用
  functionResponse?: FunctionResponse; // 函数响应
  thought?: ThoughtContent;         // 思考过程
}
```

### 1.3 Parts类型处理

#### 文本内容提取
```typescript
private _getRequestTextFromContents(contents: Content[]): string {
  return contents
    .flatMap((content) => content.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
}
```

#### 多模态内容处理
- **文本**: 直接存储在`part.text`
- **函数调用**: 存储在`part.functionCall`
- **函数响应**: 存储在`part.functionResponse`
- **思考过程**: 存储在`part.thought`（用于调试）

## 2. 不同模式的上下文传递

### 2.1 标准Gemini API模式

#### 发送格式
```json
{
  "model": "gemini-2.0-flash",
  "contents": [
    {
      "role": "user",
      "parts": [{"text": "历史用户消息1"}]
    },
    {
      "role": "model", 
      "parts": [{"text": "历史模型响应1"}]
    },
    {
      "role": "user",
      "parts": [
        {"functionResponse": {"name": "tool_name", "response": "工具结果"}}
      ]
    },
    {
      "role": "model",
      "parts": [{"text": "基于工具结果的响应"}]
    },
    {
      "role": "user",
      "parts": [{"text": "当前用户输入"}]
    }
  ],
  "config": {
    "tools": [/* 原生工具定义 */],
    "systemInstruction": "系统指令"
  }
}
```

#### 特点
- 直接传递完整Gemini格式的对话历史
- 工具定义通过`config.tools`传递
- 支持原生函数调用和响应格式

### 2.2 OpenAI兼容模式

#### 转换机制 (`openaiCompatibleContentGenerator.ts`)
```typescript
private convertGeminiToOpenAI(request: GenerateContentParameters): OpenAIRequest {
  const messages: OpenAIMessage[] = [];
  
  if (request.contents) {
    const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
    
    for (const content of contents) {
      if (content.role === 'user') {
        const processedText = this.processQwenThinkMode(text);
        messages.push({ role: 'user', content: processedText });
      } else if (content.role === 'model') {
        messages.push({ role: 'assistant', content: text });
      }
      
      // 处理函数响应
      if (content.parts) {
        for (const part of content.parts) {
          if ('functionResponse' in part && part.functionResponse) {
            messages.push({
              role: 'tool',
              content: JSON.stringify(part.functionResponse.response),
              tool_call_id: part.functionResponse.name || 'unknown'
            });
          }
        }
      }
    }
  }
  
  return { model: this.model, messages: messages };
}
```

#### 发送格式
```json
{
  "model": "qwen2.5-coder-32b-instruct",
  "messages": [
    {"role": "system", "content": "工具指导系统消息"},
    {"role": "user", "content": "历史用户消息1"},
    {"role": "assistant", "content": "历史助手响应1"},
    {"role": "tool", "content": "{\"result\": \"工具执行结果\"}", "tool_call_id": "tool_123"},
    {"role": "assistant", "content": "基于工具结果的响应"},
    {"role": "user", "content": "当前用户输入"}
  ],
  "tools": [/* OpenAI格式工具定义 */]
}
```

#### 角色映射
- `Gemini user` → `OpenAI user`
- `Gemini model` → `OpenAI assistant` 
- `Gemini functionResponse` → `OpenAI tool`

### 2.3 文本劫持模式

#### 系统工具指导注入
```typescript
// 在对话开始添加系统工具指导
const systemToolGuidance = this.textHijackParser.createSystemToolGuidance(tools);

// 方式1: Gemini强制文本劫持
allContents.push({
  role: 'user',
  parts: [{ text: systemToolGuidance }]
});

// 方式2: OpenAI兼容模式
messages.unshift({
  role: 'system',
  content: systemToolGuidance
});
```

#### 系统工具指导内容示例
```
You are an AI assistant with access to the following tools. When you need to use a tool, respond with JSON in this exact format:

```json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": {"param": "value"}
  }
}
```

Available tools:
**list_directory**: List files and directories in a specified path
  Parameters:
    "path": string (required) - The directory path to list

IMPORTANT:
- Only use tools when necessary to complete the user's request
- Always use the exact JSON format shown above
- Include all required parameters
- You can provide explanatory text along with tool calls when helpful
```

#### 发送格式 (Gemini劫持)
```json
{
  "model": "gemini-2.0-flash",
  "contents": [
    {
      "role": "user",
      "parts": [{"text": "系统工具指导消息"}]
    },
    {
      "role": "user", 
      "parts": [{"text": "历史用户消息1"}]
    },
    {
      "role": "model",
      "parts": [{"text": "历史模型响应1（可能包含JSON工具调用）"}]
    },
    {
      "role": "user",
      "parts": [{"text": "当前用户输入"}]
    }
  ]
}
```

## 3. 历史记录管理机制

### 3.1 双层历史结构

#### 完整历史 (Comprehensive History)
```typescript
// 存储所有对话回合，包括无效响应
this.history: Content[] = [
  /* 所有用户输入和模型输出，包括空白/无效内容 */
];

getHistory(curated: false): Content[] {
  return structuredClone(this.history); // 返回完整历史
}
```

#### 策展历史 (Curated History)
```typescript
// 只包含有效的用户-模型交互对
getHistory(curated: true): Content[] {
  const history = extractCuratedHistory(this.history);
  return structuredClone(history);
}

function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  const curatedHistory: Content[] = [];
  
  // 过滤逻辑：移除无效的模型响应及其对应的用户输入
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      const userInput = comprehensiveHistory[i];
      const modelOutputs = [];
      
      // 收集后续的模型输出
      while (i + 1 < length && comprehensiveHistory[i + 1].role === 'model') {
        modelOutputs.push(comprehensiveHistory[++i]);
      }
      
      // 检查模型输出是否有效
      if (modelOutputs.every(isValidContent)) {
        curatedHistory.push(userInput, ...modelOutputs);
      }
      // 无效则跳过整个用户-模型对
    }
    i++;
  }
  
  return curatedHistory;
}
```

### 3.2 历史记录存储

#### recordHistory方法
```typescript
private recordHistory(
  userInput: Content,
  modelOutput: Content[],
  automaticFunctionCallingHistory?: Content[]
) {
  // 1. 处理automaticFunctionCallingHistory（工具调用历史）
  if (automaticFunctionCallingHistory && automaticFunctionCallingHistory.length > 0) {
    this.history.push(
      ...extractCuratedHistory(automaticFunctionCallingHistory)
    );
  } else {
    this.history.push(userInput);
  }
  
  // 2. 合并相邻的模型角色内容
  const consolidatedOutputContents = this.consolidateModelResponses(modelOutput);
  
  // 3. 智能合并逻辑
  const lastHistoryEntry = this.history[this.history.length - 1];
  if (this.canMergeTextContent(lastHistoryEntry, consolidatedOutputContents[0])) {
    // 合并文本内容
    lastHistoryEntry.parts[0].text += consolidatedOutputContents[0].parts[0].text || '';
    consolidatedOutputContents.shift();
  }
  
  this.history.push(...consolidatedOutputContents);
}
```

### 3.3 内容合并机制

#### 文本内容合并
```typescript
private consolidateModelResponses(outputContents: Content[]): Content[] {
  const consolidated: Content[] = [];
  
  for (const content of outputContents) {
    const lastContent = consolidated[consolidated.length - 1];
    
    if (this.isTextContent(lastContent) && this.isTextContent(content)) {
      // 合并相邻的文本内容
      lastContent.parts[0].text += content.parts[0].text || '';
      if (content.parts.length > 1) {
        lastContent.parts.push(...content.parts.slice(1));
      }
    } else {
      consolidated.push(content);
    }
  }
  
  return consolidated;
}
```

## 4. 特殊情况的上下文处理

### 4.1 automaticFunctionCallingHistory处理

#### 去重机制
```typescript
// 处理API返回的完整函数调用历史，避免重复
const fullAutomaticFunctionCallingHistory = response.automaticFunctionCallingHistory;
const index = this.getHistory(true).length; // 当前历史长度
let automaticFunctionCallingHistory: Content[] = [];

if (fullAutomaticFunctionCallingHistory != null) {
  // 只取新增的部分，避免重复记录
  automaticFunctionCallingHistory = 
    fullAutomaticFunctionCallingHistory.slice(index) ?? [];
}

this.recordHistory(userContent, modelOutput, automaticFunctionCallingHistory);
```

#### AFC历史的作用
- 包含模型发起的工具调用和响应的完整链
- 确保多步骤工具调用的上下文完整性
- 支持复杂的工具调用序列

### 4.2 文本劫持模式的工具调用解析

#### JSON工具调用提取
```typescript
parseTextForToolCalls(content: string, preserveContext: boolean = false): TextParseResult {
  // 1. 过滤Qwen思考块
  let cleanText = this.filterQwenThinkBlocks(content);
  const originalCleanText = cleanText;
  
  // 2. 查找JSON模式
  const jsonPatterns = [
    /```json\s*(\{[\s\S]*?\})\s*```/g,  // JSON代码块
    /(\{\s*"tool_call"\s*:\s*\{[\s\S]*?\}\s*\})/g, // 内联JSON
  ];
  
  // 3. 解析工具调用
  for (const pattern of jsonPatterns) {
    let match;
    while ((match = pattern.exec(cleanText)) !== null) {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool_call && parsed.tool_call.name) {
        const toolCall: ParsedToolCall = {
          name: parsed.tool_call.name,
          args: parsed.tool_call.arguments,
          id: `text-hijack-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        };
        
        // 应用参数映射
        const mappingResult = parameterMappingManager.applyMapping(...);
        if (mappingResult.mapped) {
          toolCall.args = mappingResult.mappedArgs;
        }
        
        toolCalls.push(toolCall);
        cleanText = cleanText.replace(match[0], '').trim();
      }
    }
  }
  
  // 4. 根据preserveContext决定内容处理
  if (toolCalls.length > 0) {
    if (preserveContext) {
      // 保留解释性文本以维持对话连续性
      console.log(`📝 Preserving context text with ${toolCalls.length} tool calls`);
    } else {
      // 移除所有文本内容以匹配原生函数调用行为
      cleanText = '';
    }
  }
  
  return { 
    toolCalls, 
    cleanText,
    originalText: originalCleanText 
  };
}
```

### 4.3 Qwen模型特殊处理

#### 思考块过滤
```typescript
filterQwenThinkBlocks(content: string): string {
  const isQwenModel = this.model.toLowerCase().includes('qwen') || 
                     this.model.toLowerCase().includes('qwq');
  
  if (!isQwenModel) {
    return content;
  }

  // 移除<think>...</think>块
  const filteredContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  if (filteredContent !== content) {
    console.log('🧠 Filtered out <think> blocks from Qwen model response');
  }

  return filteredContent;
}
```

#### Think模式处理
```typescript
private processQwenThinkMode(userMessage: string): string {
  const isQwenModel = this.model.toLowerCase().includes('qwen');
  
  if (!isQwenModel) {
    return userMessage;
  }

  if (!this.thinkMode) {
    // 添加<no_think>指令禁用推理输出
    const noThinkInstruction = `<no_think>\n\n${userMessage}`;
    console.log(`🚫 [Qwen Think Mode] Added <no_think> tag`);
    return noThinkInstruction;
  } else {
    console.log(`💭 [Qwen Think Mode] Think mode enabled`);
    return userMessage;
  }
}
```

## 5. 上下文发送时序图

```
用户输入 → createUserContent → getHistory(true) → concat → generateContent
    ↓              ↓                    ↓           ↓            ↓
当前消息 →      用户内容对象  →     策展历史    →  完整上下文  →  API调用
                                     ↓
                          [历史用户消息1, 历史模型响应1, 
                           历史用户消息2, 历史模型响应2, 
                           ..., 当前用户消息]
```

## 6. 不同模式对比表

| 项目 | 标准Gemini | OpenAI兼容 | 文本劫持(Gemini) | 文本劫持(OpenAI) |
|------|------------|------------|------------------|------------------|
| **上下文格式** | Gemini Contents | OpenAI Messages | Gemini Contents + 系统指导 | OpenAI Messages + 系统指导 |
| **工具定义** | config.tools | tools array | 系统消息文本 | 系统消息文本 |
| **历史传递** | 完整Contents数组 | 转换后Messages数组 | Contents + 系统指导 | Messages + 系统指导 |
| **角色映射** | 直接传递 | user/model→user/assistant | 直接传递 | user/model→user/assistant |
| **工具调用** | 原生functionCall | 原生tool_calls | JSON文本解析 | JSON文本解析 |
| **上下文保持** | 原生支持 | 原生支持 | 可选preserve | 可选preserve |

## 7. 上下文优化机制

### 7.1 历史压缩
```typescript
async tryCompressChat(force: boolean = false): Promise<ChatCompressionInfo | null> {
  const originalTokenCount = await this.countTokens();
  const model = this.config.getModel();
  
  // 检查是否超过压缩阈值
  if (!force && originalTokenCount < this.TOKEN_THRESHOLD_FOR_SUMMARIZATION * tokenLimit(model)) {
    return null;
  }
  
  // 执行压缩
  const summaryResponse = await this.generateCompressionSummary();
  this.applyCompression(summaryResponse);
  
  return {
    originalTokenCount,
    newTokenCount: await this.countTokens(),
  };
}
```

### 7.2 内容验证
```typescript
private isValidContent(content: Content): boolean {
  return !!(
    content &&
    content.parts &&
    content.parts.length > 0 &&
    content.parts.some(part => 
      part.text?.trim() || 
      part.functionCall || 
      part.functionResponse
    )
  );
}
```

## 总结

Gemini CLI的上下文传递机制具有以下特点：

1. **完整性**: 每次API调用都包含完整的对话历史
2. **灵活性**: 支持多种API格式和劫持模式
3. **智能性**: 自动合并内容、过滤无效历史
4. **兼容性**: 处理不同模型的特殊需求
5. **优化性**: 支持历史压缩和内容验证
6. **一致性**: 确保不同模式下的上下文连续性

这种设计确保了无论使用哪种API模式，都能保持完整、一致的对话上下文，为复杂的多轮对话和工具调用提供了坚实的基础。
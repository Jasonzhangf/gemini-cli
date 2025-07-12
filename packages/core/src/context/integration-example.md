# 上下文管理系统集成指南

## 概述

这个上下文管理系统使用包装器模式设计，不修改现有的内存工具，而是在其基础上增强功能。主要特性包括：

- ✅ **静态上下文加载**: 从 `./gemini/rules` 和 `~/.gemini/rules` 自动加载规则文件
- ✅ **任务管理系统**: 支持创建、跟踪和更新任务状态
- ✅ **任务维护模式**: 自动提醒当前任务并指导完成
- ✅ **工具调用拦截**: 在工具调用前后自动注入任务相关信息
- ✅ **包装器模式**: 不破坏现有代码，便于移植

## 核心组件

### 1. ContextManager
- 管理历史记录、静态上下文、动态上下文和任务列表
- 提供统一的上下文数据访问接口

### 2. ContextWrapper  
- 包装现有的内存系统，添加上下文管理功能
- 提供增强的用户内存和历史记录管理

### 3. PromptEnhancer
- 包装现有的提示生成系统
- 在任务维护模式下自动添加任务相关提示

### 4. ToolCallInterceptor
- 拦截工具调用，在前后添加任务相关处理
- 自动调用 `todoCurrent` 获取当前任务状态

### 5. TodoTool (重新设计)
- 支持创建任务列表、更新状态、查看进度
- 任务描述限制在20个字符以内
- 支持任务维护模式的生命周期管理

## 使用方法

### 在现有代码中集成

```typescript
import { getEnhancedSystemPromptIfAvailable, getToolCallInterceptorIfAvailable } from '../context/index.js';

// 1. 使用增强的系统提示（如果可用）
const enhancedPrompt = getEnhancedSystemPromptIfAvailable(config);

// 2. 使用工具调用拦截器（如果可用）
const interceptor = getToolCallInterceptorIfAvailable(config);
if (interceptor && interceptor.shouldIntercept(toolName)) {
  const preContext = await interceptor.preprocessToolCall(toolRequest);
  // ... 执行工具调用 ...
  const postContext = await interceptor.postprocessToolCall(toolRequest, toolResponse);
}
```

### 控制是否启用增强功能

通过环境变量控制：
```bash
# 启用上下文增强（默认）
export GEMINI_CONTEXT_ENHANCEMENT=true

# 禁用上下文增强，回退到原始行为
export GEMINI_CONTEXT_ENHANCEMENT=false
```

## 任务管理工作流

### 1. 创建任务列表并进入维护模式

```json
{
  "action": "create_list",
  "tasks": [
    "分析代码结构",
    "编写单元测试", 
    "修复类型错误",
    "优化性能"
  ]
}
```

### 2. 查看当前任务

```json
{
  "action": "current"
}
```

### 3. 更新任务状态

```json
{
  "action": "update",
  "taskId": "task_xxx",
  "status": "completed"
}
```

### 4. 结束维护模式

```json
{
  "action": "end_maintenance"
}
```

## 静态上下文配置

### 项目级规则 (./gemini/rules/)
```
project_root/
  .gemini/
    rules/
      coding-standards.md
      project-specific.md
      deployment-guide.md
```

### 全局规则 (~/.gemini/rules/)
```
~/.gemini/
  rules/
    general-guidelines.md
    company-policies.md
    security-rules.md
```

## 任务维护模式的工作原理

1. **后台处理**: 
   - 每次工具引导时鼓励模型调用任务工具拆解当前任务
   - 将任务列表放入上下文中
   - 上下文单独发送（用户提示词不在里面）

2. **前台处理**:
   - 当任务被创建后，进入任务维护模式
   - 上下文包含任务列表，提示模型认为完成后修改列表
   - 每次工具调用时，自动调用 `todoCurrent` 获取当前任务
   - 将任务信息作为工具调用时的提示重点

3. **状态同步**:
   - 工具调用结果包含任务完成信息
   - 提示模型使用相应工具修改任务状态
   - 直到任务列表完成，任务维护模式结束

## 最佳实践

1. **任务描述要求**:
   - 每个任务不超过20个字
   - 使用简洁明确的动词开头
   - 专注于具体的可执行动作

2. **规则文件组织**:
   - 按功能分类组织规则文件
   - 使用清晰的文件名
   - 保持规则内容简洁明了

3. **渐进式集成**:
   - 可以通过环境变量控制是否启用
   - 不影响现有功能的正常运行
   - 便于调试和问题排查

## 移植和维护

这个设计的主要优势是使用包装器模式：

- **无侵入性**: 不修改现有的内存工具和提示生成代码
- **可选启用**: 通过环境变量控制，可以随时回退
- **独立模块**: 所有新功能都在 `context/` 目录下
- **易于移植**: 只需要复制 `context/` 目录和相关配置

这样的设计确保了系统的稳定性和可维护性，同时提供了强大的任务管理和上下文增强功能。
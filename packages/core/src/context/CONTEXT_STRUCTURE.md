# 标准化上下文集成结构

## 概览

按照标准结构 `{系统上下文},{静态上下文},{动态上下文},{任务上下文}` 组织所有上下文信息。

## 结构定义

```typescript
interface StandardContext {
  system: SystemContext;    // 系统上下文
  static: StaticContext;    // 静态上下文  
  dynamic: DynamicContext;  // 动态上下文
  task: TaskContext;        // 任务上下文
}
```

## 1. 系统上下文 (System Context)
*来源: 当前运行环境和系统状态*

```typescript
interface SystemContext {
  workingDirectory: string;  // 当前工作目录
  timestamp: string;         // 会话时间戳
  sessionId: string;         // 会话ID
  tools: string[];          // 可用工具列表
  capabilities: string[];    // 系统能力
}
```

**输出格式:**
```
# 🖥️ 系统上下文 (System Context)
*来源: 当前运行环境和系统状态*

**工作目录**: /Users/user/project
**会话时间**: 2025-01-13T09:30:00.000Z
**会话ID**: session_123
**可用工具**: list_directory, read_file, write_file, run_shell_command...
**系统能力**: file_operations, shell_execution, web_search...
```

## 2. 静态上下文 (Static Context)
*来源: 项目文件、配置和规则*

```typescript
interface StaticContext {
  projectStructure?: string;   // 项目目录结构
  dependencies?: string[];     // 依赖配置文件内容
  documentation?: string[];    // 项目文档内容
  gitStatus?: string;         // Git状态信息
  globalRules?: string[];     // 全局规则(~/.gemini/globalrules)
  projectRules?: string[];    // 项目规则(./gemini/localrules)
}
```

**输出格式:**
```
# 📋 静态上下文 (Static Context)
*来源: 项目文件、配置和规则*

## 🌍 全局规则 (2个)
*适用于所有项目的通用规则*

--- 全局规则: coding-standards.md ---
# 编码标准
...

--- 全局规则: security-rules.md ---
# 安全规则
...

## 🏠 项目规则 (1个)
*当前项目特定规则*

--- 项目规则: project-guidelines.md ---
# 项目指导原则
...

## 📁 项目结构
```
project/
├── src/
│   ├── components/
│   └── utils/
├── package.json
└── README.md
```

## 📦 依赖配置
=== package.json ===
{
  "name": "project",
  "dependencies": {...}
}

## 📖 项目文档
=== README.md ===
# Project Name
Description...

## 🔗 Git状态
```
Git分支: main
Git状态:
M package.json
A src/new-file.ts
```

## 3. 动态上下文 (Dynamic Context)
*来源: 运行时状态和操作历史*

```typescript
interface DynamicContext {
  recentOperations: string[];   // 最近执行的操作
  errorHistory: string[];       // 错误历史
  runtimeInfo: string[];        // 运行时信息
  userInstructions: string[];   // 用户指令
}
```

**输出格式:**
```
# 🔄 动态上下文 (Dynamic Context)
*来源: 运行时状态和操作历史*

## ⚡ 运行时信息
[动态添加的运行时信息]

## 📝 最近操作
- 执行了文件读取操作
- 运行了构建命令

## ❌ 错误历史
- 构建失败: TypeScript错误
- 文件未找到: config.json

## 👤 用户指令
- 请分析项目结构
- 修复构建错误
```

## 4. 任务上下文 (Task Context)
*来源: 当前任务管理状态*

```typescript
interface TaskContext {
  workflow?: WorkflowTemplate;  // 工作流模板
  currentTask?: string;         // 当前任务
  taskList?: Array<{           // 任务列表
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  progress?: string;           // 进度信息
  maintenanceMode: boolean;    // 是否在任务维护模式
}
```

**输出格式:**
```
# 🎯 任务上下文 (Task Context)
*来源: 当前任务管理状态*

**状态**: 任务维护模式已激活

## 📋 工作流模板
**名称**: Explore, Plan, Code, Test
**描述**: 综合开发工作流
**类别**: development

## 🔄 当前任务
**任务**: 📊 探索项目结构
**进度**: 1/4

## 📝 任务列表
1. 🔄 📊 探索项目结构 (in_progress)
2. ⏳ 📋 制定详细计划 (pending)
3. ⏳ 💻 编写代码实现 (pending)
4. ⏳ 🧪 运行测试验证 (pending)

## 🚨 重要提示
- 当前专注于: "📊 探索项目结构"
- 完成后请使用任务工具更新状态
- 使用 finish_current_task 工具完成当前任务
```

## 使用示例

### 1. 基础任务创建（无模板）
```bash
# 创建简单任务列表
[tool_call: create_tasks]
[*#*#text_tool_call]
分析代码
修复bug
测试验证
[#*#*text_tool_call*#*#]
```

### 2. 使用工作流模板
```bash
# 使用预定义模板创建任务
create_tasks with template "explore-plan-code-test" autoContext true
```

### 3. 项目分析模板
```bash
# 使用项目分析模板
create_tasks with template "project-analysis" 
```

## 模板系统

### 内置模板

1. **explore-plan-code-test**: 完整开发工作流
   - 📊 探索项目结构
   - 📋 制定详细计划  
   - 💻 编写代码实现
   - 🧪 运行测试验证

2. **project-analysis**: 项目分析工作流
   - 📁 分析目录结构
   - 📦 分析依赖配置
   - 📖 分析文档和README
   - 🔍 分析核心代码模式

3. **bug-fix**: Bug修复工作流
   - 🐛 重现和分析问题
   - 🔍 查找根本原因
   - 🛠️ 实现修复方案
   - ✅ 验证修复效果

### 自动上下文发现

当启用 `autoContext: true` 时，系统会自动：

1. **分析项目结构** - 生成目录树
2. **读取依赖文件** - package.json, requirements.txt等
3. **扫描文档** - README, docs目录
4. **获取Git状态** - 分支、变更状态
5. **应用项目规则** - .gemini/rules配置

## 上下文优先级

1. **任务上下文** - 最高优先级，指导当前操作
2. **静态上下文** - 项目基础信息，稳定不变
3. **动态上下文** - 运行时状态，实时更新
4. **系统上下文** - 环境信息，提供基础能力

## 错误处理

- 如果某个上下文收集失败，不影响其他上下文
- 每个上下文部分都有默认的空状态处理
- 错误信息会记录到动态上下文的错误历史中
- 上下文收集失败时，系统仍能正常工作

## 性能优化

- 上下文收集采用并行处理
- 大文件内容会被截断以避免上下文过大
- 缓存静态上下文避免重复计算
- 提供选择性上下文收集选项
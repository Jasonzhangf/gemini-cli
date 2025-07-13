# 新的项目数据存储结构

## 概览

参考 `~/.claude` 目录的设计模式，重新设计了 `~/.gemini` 的目录结构，使用可读的项目路径名称替代MD5哈希。

## 新目录结构

```
~/.gemini/
├── globalrules/                 # 全局规则 (每轮都会读取，每个项目都会读取)
│   ├── coding-standards.md      # 编码标准
│   ├── security-rules.md        # 安全规则
│   └── team-guidelines.md       # 团队指导原则
├── projects/                    # 项目工作目录上下文
│   ├── -Users-fanzhang-Documents-github-gemini-cli/
│   │   ├── project_meta.json    # 项目元数据
│   │   ├── context.json         # 项目上下文缓存 (24小时有效)
│   │   └── templates/           # 项目特定的工作流模板
│   │       ├── custom-flow.json
│   │       └── debug-workflow.json
│   └── -Users-fanzhang-Documents-work-myproject/
│       ├── project_meta.json
│       └── context.json
├── todos/                       # 任务安排
│   ├── -Users-fanzhang-Documents-github-gemini-cli/
│   │   ├── todo_context.json    # 任务列表
│   │   ├── current_task.txt     # 当前任务ID
│   │   └── history/             # 任务历史 (未来功能)
│   └── -Users-fanzhang-Documents-work-myproject/
│       ├── todo_context.json
│       └── current_task.txt
└── templates/                   # 全局工作流模板
    ├── company-standard.json
    └── team-workflow.json
```

## 项目级目录结构

每个项目根目录下的 `.gemini/localrules/` 存储项目特定规则：

```
project-root/
├── .gemini/
│   └── localrules/              # 项目规则 (当前项目特定规则)
│       ├── api-conventions.md   # API约定
│       ├── deployment.md        # 部署规则
│       └── testing-strategy.md  # 测试策略
├── src/
└── package.json
```

## 目录命名规则

### 路径转换规则
绝对路径通过替换所有斜杠为破折号来生成目录名:

```bash
/Users/fanzhang/Documents/github/gemini-cli
↓
-Users-fanzhang-Documents-github-gemini-cli
```

### 示例转换
- `/Users/user/projects/webapp` → `-Users-user-projects-webapp`
- `/home/dev/code/api-server` → `-home-dev-code-api-server`
- `/workspace/team/frontend` → `-workspace-team-frontend`

## 文件结构详解

### 1. projects/[project-name]/project_meta.json
```json
{
  "projectPath": "/Users/fanzhang/Documents/github/gemini-cli",
  "directoryName": "-Users-fanzhang-Documents-github-gemini-cli",
  "createdAt": "2025-01-13T10:30:00.000Z",
  "lastAccessAt": "2025-01-13T15:45:00.000Z",
  "taskStorageDir": "/Users/fanzhang/.gemini/todos/-Users-fanzhang-Documents-github-gemini-cli",
  "contextStorageDir": "/Users/fanzhang/.gemini/projects/-Users-fanzhang-Documents-github-gemini-cli"
}
```

### 2. projects/[project-name]/context.json
```json
{
  "projectStructure": "项目目录树结构...",
  "dependencies": ["package.json内容", "requirements.txt内容"],
  "documentation": ["README.md内容"],
  "gitStatus": "git状态信息",
  "cachedAt": "2025-01-13T15:45:00.000Z",
  "projectPath": "/Users/fanzhang/Documents/github/gemini-cli"
}
```

### 3. todos/[project-name]/todo_context.json
```json
[
  {
    "id": "task_1705234567890_abc123def",
    "description": "分析项目结构",
    "status": "completed",
    "createdAt": "2025-01-13T10:30:00.000Z",
    "completedAt": "2025-01-13T11:00:00.000Z"
  },
  {
    "id": "task_1705234567891_def456ghi",
    "description": "实现功能模块",
    "status": "in_progress",
    "createdAt": "2025-01-13T11:00:00.000Z"
  }
]
```

### 4. todos/[project-name]/current_task.txt
```
task_1705234567891_def456ghi
```

## 优势

### 1. **可读性**
- 目录名直接反映项目路径
- 便于手动浏览和管理
- 支持多项目同时工作

### 2. **兼容性**
- 与Claude CLI的设计一致
- 便于工具间数据共享
- 符合Unix文件系统最佳实践

### 3. **可维护性**
- 清晰的目录层次结构
- 明确的数据分离（项目上下文 vs 任务数据）
- 支持缓存和性能优化

### 4. **扩展性**
- 项目特定的模板存储
- 历史记录支持
- 多环境配置支持

### 5. **双层规则系统**
- 全局规则：适用于所有项目的通用规则
- 项目规则：当前项目特定的规则和约定
- 自动加载和优先级管理

## 迁移工具

使用 `migrate_project_data` 工具来迁移现有数据：

### 1. 分析现有数据
```bash
migrate_project_data with action "analyze"
```

### 2. 演练迁移
```bash
migrate_project_data with action "migrate" dryRun true
```

### 3. 执行迁移
```bash
migrate_project_data with action "migrate"
```

### 4. 清理旧数据
```bash
migrate_project_data with action "cleanup" dryRun true
migrate_project_data with action "cleanup"
```

## API 更新

### TodoService 新方法
```typescript
// 获取项目目录名
getProjectDirectoryName(): string

// 获取各种存储路径
getProjectTaskDir(): string
getProjectContextDir(): string

// 上下文缓存管理
saveProjectContext(context: any): Promise<void>
loadProjectContext(): Promise<any | null>

// 全局项目管理
static listAllProjects(): Promise<ProjectInfo[]>
```

### WorkflowTemplateService 更新
- 项目特定模板存储在 `projects/[project-name]/templates/`
- 全局模板存储在 `templates/`
- 支持项目级和全局级模板管理

## 向后兼容

- 迁移工具确保现有数据不丢失
- 新旧格式并存直到用户主动迁移
- 提供详细的迁移状态报告

## 未来规划

1. **历史记录**: `todos/[project-name]/history/` 存储任务执行历史
2. **分析缓存**: `projects/[project-name]/analysis/` 存储代码分析结果  
3. **配置管理**: `projects/[project-name]/config/` 存储项目特定配置
4. **团队协作**: 支持团队级模板和配置共享
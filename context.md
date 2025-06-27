# 任务上下文：实现 gemini-2.5-pro 模型调用劫持（重新实现）

## 需求分析
用户希望在系统调用 gemini-2.5-pro 模型时，自动劫持并转换为用户配置的 OpenAI 兼容 API 调用，对上层应用透明。

## 劫持配置（环境变量）
改为使用 `~/.gemini/.env` 文件配置：
```bash
# Gemini CLI 劫持配置
# 当调用 gemini-2.5-pro 时自动劫持到以下配置
HIJACK_ENABLED=true
HIJACK_TARGET_MODEL=gemini-2.5-pro
HIJACK_PROVIDER=OPENAI_COMPATIBLE
HIJACK_ACTUAL_MODEL=blacktooth-ab-test
HIJACK_API_KEY=1234567890
HIJACK_API_ENDPOINT=http://127.0.0.1:2048/v1
```

## 实现要点

### 1. AuthType 扩展
在 `packages/core/src/core/contentGenerator.ts` 中添加了：
- `OPENAI_COMPATIBLE = 'openai-compatible'` 认证类型

### 2. ContentGeneratorConfig 扩展  
添加了新字段：
- `actualModel?: string` - 实际要调用的模型名称
- `apiEndpoint?: string` - API 端点地址

### 3. 劫持逻辑实现
在 `createContentGeneratorConfig()` 函数中：
- 添加 `loadHijackConfigFromEnv()` 函数从环境变量读取配置
- 检测目标模型并应用劫持规则
- 自动切换认证类型和API配置
- 显示详细的劫持成功提示信息

### 4. OpenAI 兼容生成器
创建了 `packages/core/src/core/openaiCompatibleContentGenerator.ts`：
- 实现 `ContentGenerator` 接口
- 支持普通和流式内容生成
- 处理 OpenAI 格式的请求和响应转换

### 5. 生成器工厂更新
在 `createContentGenerator()` 中添加对 `OPENAI_COMPATIBLE` 类型的支持

### 6. 启动界面提示
在 `packages/cli/src/ui/components/Tips.tsx` 中添加劫持配置提示：
- 导入 `getHijackInfo()` 函数检查劫持状态
- 在启动界面显示劫持配置框
- 显示目标模型、实际模型和端点信息
- 提示配置文件位置

## 已完成的修改
1. ✅ 扩展 AuthType 枚举添加 OPENAI_COMPATIBLE
2. ✅ 扩展 ContentGeneratorConfig 类型定义
3. ✅ 实现 loadHijackConfigFromEnv() 函数从环境变量读取
4. ✅ 在 createContentGeneratorConfig() 中添加劫持逻辑和成功提示
5. ✅ 创建 OpenAICompatibleContentGenerator 类
6. ✅ 更新 createContentGenerator() 工厂函数
7. ✅ 创建环境变量配置文件 (.env)
8. ✅ 添加 getHijackInfo() 函数用于启动提示
9. ✅ 修改 Tips 组件显示劫持配置状态
10. ✅ 创建测试和演示脚本

## 工作流程
1. 用户调用 `gemini-cli -m gemini-2.5-pro`
2. 系统加载 `~/.gemini/.env` 环境变量
3. 检测到 `gemini-2.5-pro` 匹配劫持规则
4. 在启动界面显示劫持配置提示框
5. 显示详细的劫持成功提示信息
6. 自动切换到 `OPENAI_COMPATIBLE` 认证类型
7. 使用 `blacktooth-ab-test` 模型和本地端点 `http://127.0.0.1:2048/v1`
8. 对上层应用完全透明

## 关键文件
- `/Users/fanzhang/Documents/github/gemini-cli/packages/core/src/core/contentGenerator.ts`
- `/Users/fanzhang/Documents/github/gemini-cli/packages/core/src/core/openaiCompatibleContentGenerator.ts`
- `/Users/fanzhang/.gemini/.env`
- `/Users/fanzhang/Documents/github/gemini-cli/test-env-hijack.js`
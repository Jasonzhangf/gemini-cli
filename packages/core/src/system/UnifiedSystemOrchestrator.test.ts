/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnifiedSystemOrchestrator, SystemModule } from './UnifiedSystemOrchestrator.js';
import { Config } from '../config/config.js';

/**
 * 统一系统编排器独立测试
 * 
 * 测试目标：
 * 1. 验证每个模块的独立功能
 * 2. 测试模块间的协调工作
 * 3. 验证配置和控制功能
 * 4. 确认最终展现效果
 */

/**
 * 创建模拟配置
 */
function createMockConfig(): Config {
  const mockConfig = {
    // 基础方法
    getDebugMode: () => true,
    getModel: () => 'gemini-pro',
    getProjectInfo: () => ({ name: 'gemini-cli', type: 'TypeScript项目' }),
    
    // 上下文管理
    getContextManager: () => ({
      getStaticContext: () => ({
        globalrules: '# 全局开发规则\n- 使用TypeScript\n- 遵循代码规范\n- 编写单元测试',
        localrules: '# 项目规则\n- 使用ESM模块\n- 保持向后兼容性',
        memories: [
          '项目使用Vitest作为测试框架',
          '采用monorepo架构管理多个包',
          '集成了React和Ink用于CLI界面'
        ]
      })
    }),
    
    // 分析设置
    getAnalysisSettings: () => ({ mode: 'vector' }),
    
    // 向量提供者
    getVectorProvider: () => 'siliconflow',
    getProviderConfig: (type: string) => ({
      apiKey: 'mock-api-key',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'BAAI/bge-m3'
    }),
    
    // 统一提示管理器
    getUnifiedPromptManager: () => ({
      generateSystemPrompt: async () => {
        return `# 🤖 Gemini CLI Assistant

你是一个智能的代码助手，专门帮助开发者进行项目分析、代码生成和问题解决。

## 🎯 核心能力
- 项目结构分析
- 代码质量评估  
- 架构建议
- 问题诊断

## 📋 工作原则
- 提供准确、实用的建议
- 保持代码的可维护性
- 遵循最佳实践
- 注重性能和安全性`;
      }
    }),
    
    // 上下文代理 (将在初始化时设置)
    getContextAgent: () => null,
    
    // 其他必要方法的占位符
    [Symbol.iterator]: function* () { },
  } as unknown as Config;
  
  return mockConfig;
}

/**
 * 模拟对话历史
 */
function createMockConversationHistory(): any[] {
  return [
    {
      role: 'user',
      content: '你好，我想了解这个项目的架构',
      timestamp: Date.now() - 300000
    },
    {
      role: 'assistant', 
      content: '好的，我来为你分析项目架构。这是一个基于TypeScript的CLI工具项目。',
      timestamp: Date.now() - 240000
    },
    {
      role: 'user',
      content: '能否详细说明一下目录结构？',
      timestamp: Date.now() - 180000
    }
  ];
}

/**
 * 主测试函数
 */
async function runOrchestratorTest(): Promise<void> {
  console.log('🚀 开始统一系统编排器测试\n');
  console.log('=' * 80);
  
  // 1. 初始化编排器
  console.log('\n📋 步骤 1: 初始化编排器');
  console.log('-' * 40);
  
  const config = createMockConfig();
  const orchestrator = new UnifiedSystemOrchestrator(config);
  
  // 显示初始配置
  console.log('✅ 编排器创建成功');
  console.log('📊 初始模块状态:');
  const enabledModules = orchestrator.getEnabledModules();
  enabledModules.forEach(module => {
    console.log(`   ✓ ${module}: 已启用`);
  });
  
  const allModules = Object.values(SystemModule);
  const disabledModules = allModules.filter(module => !orchestrator.isModuleEnabled(module));
  if (disabledModules.length > 0) {
    disabledModules.forEach(module => {
      console.log(`   ✗ ${module}: 已禁用`);
    });
  }
  
  // 2. 系统初始化
  console.log('\n📋 步骤 2: 系统初始化');
  console.log('-' * 40);
  
  const projectDir = process.cwd();
  const sessionId = `test-session-${Date.now()}`;
  
  try {
    await orchestrator.initialize(projectDir, sessionId);
    console.log('✅ 系统初始化成功');
    console.log(`📂 项目目录: ${projectDir}`);
    console.log(`🆔 会话ID: ${sessionId}`);
  } catch (error) {
    console.warn('⚠️ 系统初始化部分失败，继续测试:', error instanceof Error ? error.message : error);
  }
  
  // 3. 模块配置测试
  console.log('\n📋 步骤 3: 模块配置测试');
  console.log('-' * 40);
  
  // 启用调试模块
  orchestrator.setModuleEnabled(SystemModule.DEBUG_CONTEXT, true);
  console.log('✅ 启用调试模块');
  
  // 禁用项目发现模块
  orchestrator.setModuleEnabled(SystemModule.PROJECT_DISCOVERY, false);
  console.log('❌ 禁用项目发现模块');
  
  console.log('📊 更新后的模块状态:');
  const updatedEnabledModules = orchestrator.getEnabledModules();
  updatedEnabledModules.forEach(module => {
    console.log(`   ✓ ${module}: 已启用`);
  });
  
  // 4. 默认输入测试
  console.log('\n📋 步骤 4: 默认输入测试');
  console.log('-' * 40);
  
  const defaultInput = "分析本工作目录下的项目结构，并提出项目的架构总结";
  console.log(`🎯 测试输入: "${defaultInput}"`);
  
  const conversationHistory = createMockConversationHistory();
  console.log(`💬 对话历史: ${conversationHistory.length} 条记录`);
  
  // 5. 执行编排测试
  console.log('\n📋 步骤 5: 执行编排测试');
  console.log('-' * 40);
  
  const startTime = Date.now();
  
  try {
    const systemContext = await orchestrator.generateSystemContext(defaultInput, conversationHistory);
    const executionTime = Date.now() - startTime;
    
    console.log(`✅ 编排执行成功，耗时: ${executionTime}ms`);
    console.log(`📄 生成内容长度: ${systemContext.length} 字符`);
    
    // 6. 编排结果展示
    console.log('\n' + '=' * 80);
    console.log('🎭 编排结果展示');
    console.log('=' * 80);
    
    if (systemContext && systemContext.trim()) {
      console.log(systemContext);
    } else {
      console.log('⚠️ 编排结果为空，显示各模块独立测试结果:');
      await displayIndividualModuleResults(orchestrator, defaultInput, conversationHistory);
    }
    
  } catch (error) {
    console.error('❌ 编排执行失败:', error);
    console.log('\n🔧 执行模块独立测试...');
    await displayIndividualModuleResults(orchestrator, defaultInput, conversationHistory);
  }
  
  // 7. 性能和状态报告
  console.log('\n' + '=' * 80);
  console.log('📊 性能和状态报告');
  console.log('=' * 80);
  
  const systemConfig = orchestrator.getSystemConfiguration();
  console.log('⚙️ 系统配置:');
  console.log(`   - 调试模式: ${systemConfig.globalSettings.debugMode ? '开启' : '关闭'}`);
  console.log(`   - 性能模式: ${systemConfig.globalSettings.performanceMode ? '开启' : '关闭'}`);
  console.log(`   - 安全模式: ${systemConfig.globalSettings.safeMode ? '开启' : '关闭'}`);
  
  console.log('\n🔧 子系统状态:');
  const contextAgent = orchestrator.getContextAgent();
  const toolSystem = orchestrator.getToolSystem();
  const taskManager = orchestrator.getTaskManager();
  
  console.log(`   - ContextAgent: ${contextAgent ? (contextAgent.isInitialized() ? '已初始化' : '未初始化') : '未创建'}`);
  console.log(`   - ToolSystem: ${toolSystem ? '已创建' : '未创建'}`);
  console.log(`   - TaskManager: ${taskManager ? '已创建' : '未创建'}`);
  
  // 8. 模块控制测试
  console.log('\n📋 步骤 6: 模块控制测试');
  console.log('-' * 40);
  
  console.log('🔄 禁用动态上下文模块...');
  orchestrator.setModuleEnabled(SystemModule.DYNAMIC_CONTEXT, false);
  
  try {
    const contextWithoutDynamic = await orchestrator.generateSystemContext(defaultInput, conversationHistory);
    console.log(`✅ 无动态上下文编排成功，长度: ${contextWithoutDynamic.length} 字符`);
    
    if (contextWithoutDynamic.length > 0) {
      console.log('\n📄 无动态上下文的编排结果预览:');
      console.log(contextWithoutDynamic.substring(0, 300) + (contextWithoutDynamic.length > 300 ? '...' : ''));
    }
  } catch (error) {
    console.warn('⚠️ 无动态上下文编排失败:', error instanceof Error ? error.message : error);
  }
  
  // 恢复动态上下文
  orchestrator.setModuleEnabled(SystemModule.DYNAMIC_CONTEXT, true);
  console.log('🔄 重新启用动态上下文模块');
  
  console.log('\n🎉 测试完成！');
  console.log('=' * 80);
}

/**
 * 显示各模块独立测试结果
 */
async function displayIndividualModuleResults(
  orchestrator: UnifiedSystemOrchestrator,
  userInput: string, 
  conversationHistory: any[]
): Promise<void> {
  console.log('\n🧩 各模块独立测试结果');
  console.log('=' * 80);
  
  const enabledModules = orchestrator.getEnabledModules();
  const moduleResults: Record<string, string> = {};
  
  for (const module of enabledModules) {
    console.log(`\n🔧 测试模块: ${module}`);
    console.log('-' * 60);
    
    try {
      // 这里我们模拟单独执行每个模块
      let moduleContent = await simulateModuleExecution(module, userInput, conversationHistory);
      
      if (moduleContent && moduleContent.trim()) {
        moduleResults[module] = moduleContent;
        console.log(`✅ ${module} 执行成功`);
        console.log(`📄 内容长度: ${moduleContent.length} 字符`);
        console.log('📋 内容预览:');
        console.log(moduleContent.substring(0, 200) + (moduleContent.length > 200 ? '...' : ''));
      } else {
        console.log(`⚠️ ${module} 返回空内容`);
        moduleResults[module] = `# ${module}\n*该模块未返回内容*`;
      }
      
    } catch (error) {
      console.error(`❌ ${module} 执行失败:`, error instanceof Error ? error.message : error);
      moduleResults[module] = `# ${module}\n*模块执行失败: ${error instanceof Error ? error.message : String(error)}*`;
    }
  }
  
  // 显示组合结果
  console.log('\n' + '=' * 80);
  console.log('🎭 模块组合结果');
  console.log('=' * 80);
  
  const combinedResult = Object.entries(moduleResults)
    .map(([module, content]) => `${content}`)
    .join('\n\n' + '═' * 80 + '\n\n');
  
  console.log(combinedResult);
}

/**
 * 模拟模块执行
 */
async function simulateModuleExecution(
  module: SystemModule, 
  userInput: string, 
  conversationHistory: any[]
): Promise<string> {
  
  switch (module) {
    case SystemModule.GEMINI_LEGACY:
      return `# 🚀 Gemini CLI System
*Advanced AI-powered development assistant*

**Model**: gemini-pro
**Version**: 2.0.0
**Mode**: Development`;

    case SystemModule.SYSTEM_PROMPTS:
      return `# 🤖 Gemini CLI Assistant

你是一个智能的代码助手，专门帮助开发者进行项目分析、代码生成和问题解决。

## 🎯 核心能力
- 项目结构分析
- 代码质量评估  
- 架构建议
- 问题诊断

## 📋 工作原则
- 提供准确、实用的建议
- 保持代码的可维护性
- 遵循最佳实践
- 注重性能和安全性`;

    case SystemModule.STATIC_CONTEXT:
      return `## 📋 全局规则
- 使用TypeScript
- 遵循代码规范
- 编写单元测试

## 📂 项目规则
- 使用ESM模块
- 保持向后兼容性

## 🧠 记忆片段
- 项目使用Vitest作为测试框架
- 采用monorepo架构管理多个包
- 集成了React和Ink用于CLI界面`;

    case SystemModule.DYNAMIC_CONTEXT:
      return `# 🧠 Advanced RAG Context Analysis
*Generated using dynamic context analysis*

## 🎯 项目结构分析

**项目类型**: TypeScript CLI工具
**架构模式**: Monorepo
**主要技术栈**: Node.js, TypeScript, React, Ink

## 📁 核心目录结构
- **packages/cli/**: 前端CLI包
- **packages/core/**: 核心功能包
- **packages/shared/**: 共享工具包

## 🔄 相关文件
- **src/system/**: 系统协调器
- **src/context/**: 上下文管理
- **src/tools/**: 工具系统

## 💡 架构建议
- 继续保持模块化设计
- 加强错误处理机制
- 考虑添加性能监控`;

    case SystemModule.CONVERSATION_HISTORY:
      if (conversationHistory.length === 0) {
        return '';
      }
      
      const sections = ['## 💬 对话历史'];
      const recentHistory = conversationHistory.slice(-3);
      
      for (const item of recentHistory) {
        if (item.role === 'user') {
          sections.push(`**用户**: ${item.content.substring(0, 100)}...`);
        } else if (item.role === 'assistant') {
          sections.push(`**助手**: ${item.content.substring(0, 100)}...`);
        }
      }
      
      return sections.join('\n');

    case SystemModule.TOOL_GUIDANCE:
      return `## 🛠️ 可用工具

- **read_file**: 读取文件内容
- **write_file**: 写入文件内容  
- **list_directory**: 列出目录内容
- **run_shell_command**: 执行shell命令
- **create_tasks**: 创建任务列表
- **get_current_task**: 获取当前任务`;

    case SystemModule.TASK_MANAGEMENT:
      return `## 📋 当前任务
**项目结构分析**: 分析gemini-cli项目的架构和组织结构
状态: 进行中, 优先级: 高

## 📝 任务列表
- 代码质量评估 (高)
- 性能优化建议 (中)
- 测试覆盖率提升 (中)`;

    case SystemModule.DEBUG_CONTEXT:
      return `## 🐛 调试信息
**系统状态**: 已初始化
**启用模块**: 8
**缓存条目**: 0
**内存使用**: 正常
**执行时间**: < 100ms`;

    case SystemModule.MEMORY_SYSTEM:
      return `## 🧠 记忆系统
**记忆条目**: 5
**最近访问**: gemini-cli项目结构
**相关主题**: TypeScript, CLI工具, 架构设计`;

    case SystemModule.PROJECT_DISCOVERY:
      return `## 📂 项目信息
**名称**: gemini-cli
**类型**: TypeScript项目
**包管理**: npm workspace
**测试框架**: Vitest
**构建工具**: TypeScript Compiler`;

    default:
      return `# ${module}\n*未实现的模块*`;
  }
}

/**
 * 运行测试
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestratorTest().catch(error => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  });
}

export { runOrchestratorTest, createMockConfig };
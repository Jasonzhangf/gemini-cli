#!/usr/bin/env node

/**
 * Neo4j 默认RAG供应商设置脚本
 * 
 * 此脚本配置Neo4j作为默认的RAG供应商
 * 
 * 用法：
 * node setup-neo4j-default.js
 * node setup-neo4j-default.js --password your_password
 * node setup-neo4j-default.js --test-mode
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析命令行参数
function parseArguments() {
  const args = process.argv.slice(2);
  const config = {
    password: 'gemini_neo4j_2025',
    testMode: false,
    skipNeo4jCheck: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--password' && i + 1 < args.length) {
      config.password = args[i + 1];
      i++;
    } else if (arg === '--test-mode') {
      config.testMode = true;
    } else if (arg === '--skip-neo4j-check') {
      config.skipNeo4jCheck = true;
    }
  }

  return config;
}

/**
 * 创建或更新 .env 文件
 */
function setupEnvironmentVariables(password, testMode = false) {
  console.log('🔧 配置环境变量...');
  
  const envPath = path.join(__dirname, '.env');
  const envNeo4jPath = path.join(__dirname, '.env.neo4j');
  
  let envContent = '';
  
  // 读取现有的 .env 文件
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ 找到现有 .env 文件');
  } else {
    console.log('📝 创建新的 .env 文件');
  }
  
  // 读取Neo4j配置模板
  if (fs.existsSync(envNeo4jPath)) {
    const neo4jTemplate = fs.readFileSync(envNeo4jPath, 'utf8');
    console.log('✅ 使用 .env.neo4j 模板');
    
    // 替换密码
    const neo4jConfig = neo4jTemplate.replace('your_secure_password', password);
    
    // 如果是测试模式，添加测试标志
    let finalConfig = neo4jConfig;
    if (testMode) {
      finalConfig += '\\n# 测试模式\\nNEO4J_TEST_MODE=true\\n';
    }
    
    // 移除现有的Neo4j配置
    envContent = envContent.replace(/# Neo4j.*?(?=\\n[A-Z]|$)/gs, '');
    
    // 添加新的Neo4j配置
    envContent += '\\n' + finalConfig;
    
    // 写入 .env 文件
    fs.writeFileSync(envPath, envContent);
    console.log('✅ 环境变量配置完成');
    
    return true;
  } else {
    console.error('❌ 找不到 .env.neo4j 模板文件');
    return false;
  }
}

/**
 * 检查Neo4j服务状态
 */
async function checkNeo4jStatus() {
  console.log('🔍 检查Neo4j服务状态...');
  
  try {
    // 检查是否有brew安装的neo4j
    const { execSync } = await import('child_process');
    
    try {
      const result = execSync('brew services list | grep neo4j', { encoding: 'utf8' });
      if (result.includes('neo4j')) {
        console.log('✅ 发现Homebrew安装的Neo4j');
        
        if (result.includes('started')) {
          console.log('✅ Neo4j服务已启动');
          return 'running';
        } else {
          console.log('⚠️ Neo4j服务未启动');
          return 'installed';
        }
      }
    } catch (error) {
      // Homebrew neo4j未安装，检查其他方式
    }
    
    // 检查端口7687是否开放
    try {
      const net = await import('net');
      const client = new net.Socket();
      
      return new Promise((resolve) => {
        client.setTimeout(2000);
        
        client.on('connect', () => {
          console.log('✅ Neo4j端口7687可访问');
          client.destroy();
          resolve('running');
        });
        
        client.on('timeout', () => {
          console.log('⚠️ Neo4j端口7687无响应');
          client.destroy();
          resolve('not_accessible');
        });
        
        client.on('error', () => {
          console.log('⚠️ Neo4j端口7687不可访问');
          client.destroy();
          resolve('not_accessible');
        });
        
        client.connect(7687, 'localhost');
      });
    } catch (error) {
      console.log('⚠️ 无法检查Neo4j端口状态');
      return 'unknown';
    }
  } catch (error) {
    console.log('⚠️ 检查Neo4j状态时出错:', error.message);
    return 'unknown';
  }
}

/**
 * 启动Neo4j服务
 */
async function startNeo4jService() {
  console.log('🚀 尝试启动Neo4j服务...');
  
  try {
    const { execSync } = await import('child_process');
    
    // 尝试使用brew启动
    try {
      execSync('brew services start neo4j', { stdio: 'inherit' });
      console.log('✅ Neo4j服务启动成功');
      return true;
    } catch (error) {
      console.log('⚠️ Homebrew启动失败，尝试其他方法...');
    }
    
    // 尝试直接启动（如果安装在标准位置）
    const possiblePaths = [
      '/opt/homebrew/bin/neo4j',
      '/usr/local/bin/neo4j',
      '/usr/local/neo4j/bin/neo4j'
    ];
    
    for (const neo4jPath of possiblePaths) {
      if (fs.existsSync(neo4jPath)) {
        try {
          execSync(`${neo4jPath} start`, { stdio: 'inherit' });
          console.log('✅ Neo4j服务启动成功');
          return true;
        } catch (error) {
          console.log(`⚠️ 从 ${neo4jPath} 启动失败`);
        }
      }
    }
    
    console.log('❌ 无法启动Neo4j服务');
    return false;
  } catch (error) {
    console.log('❌ 启动Neo4j时出错:', error.message);
    return false;
  }
}

/**
 * 测试Neo4j连接
 */
async function testNeo4jConnection(password) {
  console.log('🧪 测试Neo4j连接...');
  
  try {
    // 动态导入neo4j-driver（如果可用）
    const neo4j = await import('neo4j-driver');
    
    const driver = neo4j.default.driver(
      'bolt://localhost:7687',
      neo4j.default.auth.basic('neo4j', password)
    );
    
    try {
      await driver.verifyConnectivity();
      console.log('✅ Neo4j连接测试成功');
      
      // 测试基本查询
      const session = driver.session();
      try {
        const result = await session.run('RETURN "Hello Neo4j!" as message');
        const message = result.records[0].get('message');
        console.log('✅ Neo4j查询测试成功:', message);
        return true;
      } finally {
        await session.close();
      }
    } finally {
      await driver.close();
    }
  } catch (error) {
    console.log('❌ Neo4j连接测试失败:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('💡 提示: 请检查Neo4j用户名和密码是否正确');
      console.log('💡 默认用户名: neo4j');
      console.log('💡 如需重置密码，请运行: neo4j-admin dbms set-initial-password <new_password>');
    }
    
    return false;
  }
}

/**
 * 验证Gemini CLI配置
 */
function validateGeminiConfig() {
  console.log('🔧 验证Gemini CLI配置...');
  
  const configFiles = [
    'packages/core/src/context/providers/contextProviderFactory.ts',
    'packages/core/src/context/providers/graph/Neo4jKnowledgeGraphProvider.ts',
    'packages/core/src/context/providers/extractor/Neo4jGraphRAGExtractor.ts',
    'packages/core/src/context/providers/backup/Neo4jBackupManager.ts'
  ];
  
  let allValid = true;
  
  for (const file of configFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file}`);
      allValid = false;
    }
  }
  
  if (allValid) {
    console.log('✅ 所有Gemini CLI Neo4j组件已就绪');
  } else {
    console.log('⚠️ 部分Gemini CLI组件缺失');
  }
  
  return allValid;
}

/**
 * 显示使用说明
 */
function showUsageInstructions() {
  console.log('\\n🎯 使用说明');
  console.log('=' .repeat(50));
  console.log('Neo4j Graph RAG现已配置为默认RAG供应商！');
  console.log('');
  console.log('📝 配置文件:');
  console.log('   - .env - 主要环境配置');
  console.log('   - .env.neo4j - Neo4j配置模板');
  console.log('');
  console.log('🔧 环境变量:');
  console.log('   - DEFAULT_RAG_PROVIDER=neo4j-graph-rag');
  console.log('   - ENABLE_NEO4J_GRAPH_RAG=true');
  console.log('   - NEO4J_URI=bolt://localhost:7687');
  console.log('');
  console.log('🚀 下一步:');
  console.log('   1. 确保Neo4j服务正在运行');
  console.log('   2. 运行: npm start (启动Gemini CLI)');
  console.log('   3. 测试: "分析这个项目的架构" (测试Graph RAG功能)');
  console.log('');
  console.log('🔍 故障排除:');
  console.log('   - 检查Neo4j状态: brew services list | grep neo4j');
  console.log('   - 启动Neo4j: brew services start neo4j');
  console.log('   - 查看日志: tail -f /opt/homebrew/var/log/neo4j/neo4j.log');
  console.log('');
  console.log('=' .repeat(50));
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 设置Neo4j作为默认RAG供应商');
  console.log('=' .repeat(50));
  
  const config = parseArguments();
  console.log('📋 配置:', config);
  
  // 1. 验证Gemini CLI组件
  console.log('\\n📦 步骤1: 验证Gemini CLI组件');
  const geminiValid = validateGeminiConfig();
  
  if (!geminiValid) {
    console.log('❌ Gemini CLI组件不完整，请确保所有Neo4j组件已正确安装');
    process.exit(1);
  }
  
  // 2. 配置环境变量
  console.log('\\n⚙️ 步骤2: 配置环境变量');
  const envSetup = setupEnvironmentVariables(config.password, config.testMode);
  
  if (!envSetup) {
    console.log('❌ 环境变量配置失败');
    process.exit(1);
  }
  
  // 3. 检查Neo4j状态
  if (!config.skipNeo4jCheck) {
    console.log('\\n🔍 步骤3: 检查Neo4j状态');
    const neo4jStatus = await checkNeo4jStatus();
    
    if (neo4jStatus === 'not_accessible' || neo4jStatus === 'unknown') {
      console.log('⚠️ Neo4j似乎未运行，尝试启动...');
      const started = await startNeo4jService();
      
      if (!started) {
        console.log('❌ 无法启动Neo4j服务');
        console.log('💡 请手动安装和启动Neo4j:');
        console.log('   brew install neo4j');
        console.log('   brew services start neo4j');
        console.log('\\n继续设置默认配置...');
      }
    }
    
    // 4. 测试连接
    if (!config.testMode) {
      console.log('\\n🧪 步骤4: 测试Neo4j连接');
      const connectionOk = await testNeo4jConnection(config.password);
      
      if (!connectionOk) {
        console.log('⚠️ Neo4j连接测试失败，但配置已完成');
        console.log('💡 请检查Neo4j服务状态并确保密码正确');
      }
    } else {
      console.log('\\n🧪 步骤4: 跳过连接测试（测试模式）');
    }
  } else {
    console.log('\\n🔍 步骤3-4: 跳过Neo4j检查');
  }
  
  // 5. 显示使用说明
  console.log('\\n✅ 设置完成!');
  showUsageInstructions();
  
  console.log('\\n🎉 Neo4j Graph RAG现已设置为默认RAG供应商！');
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 设置过程中发生错误:', error);
    process.exit(1);
  });
}

export { main };
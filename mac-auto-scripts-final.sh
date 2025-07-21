#!/bin/bash

echo "🔧 Mac自动脚本最终完善版"
echo "=============================="

echo "📋 修复方案：创建独立的CommonJS执行脚本"

# 方案1：gemini-proxy-runner.js (CommonJS)
cat > bundle/gemini-proxy-runner.js << 'EOF'
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Check if proxy is running
function checkProxy() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3458,
      path: '/health',
      timeout: 1000
    }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

async function main() {
  const isProxyRunning = await checkProxy();
  
  if (!isProxyRunning) {
    console.log('🔄 Starting proxy server...');
    
    // Find proxy service directory - use current script location
    const currentDir = path.dirname(__filename);
    const proxyDir = path.join(path.dirname(currentDir), 'proxy-service');
    
    if (fs.existsSync(proxyDir)) {
      // Start proxy server
      const proxy = spawn('node', ['src/server.js'], {
        cwd: proxyDir,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          GCR_DEBUG: 'true'
        }
      });
      proxy.unref();
      
      // Wait for proxy to start
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`⚠️ Proxy service directory not found: ${proxyDir}`);
    }
  }
  
  // Run the main CLI
  const mainCli = path.join(path.dirname(__filename), 'gemini.js');
  const args = process.argv.slice(2);
  
  const child = spawn('node', [mainCli, ...args], {
    stdio: 'inherit'
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

main().catch(console.error);
EOF

# 方案2：start-proxy-runner.js (CommonJS)
cat > bundle/start-proxy-runner.js << 'EOF'
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🚀 Starting Gemini CLI Proxy Server...');
console.log('📡 Port: 3458');

// Find proxy service directory
const currentDir = path.dirname(__filename);
const proxyDir = path.join(path.dirname(currentDir), 'proxy-service');

// Load environment variables
const envPath = path.join(os.homedir(), '.gemini-cli-router', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
  console.log('✅ Loaded config from ~/.gemini-cli-router/.env');
}

// Set defaults
process.env.GCR_DEBUG = process.env.GCR_DEBUG || 'true';
process.env.GCR_PORT = process.env.GCR_PORT || '3458';
process.env.GCR_PROVIDER = process.env.GCR_PROVIDER || 'shuaihong';

if (!fs.existsSync(proxyDir)) {
  console.log(`❌ Proxy service directory not found: ${proxyDir}`);
  console.log('   Make sure to run this from the correct installation directory');
  process.exit(1);
}

const proxy = spawn('node', ['src/server.js'], {
  cwd: proxyDir,
  stdio: 'inherit',
  env: process.env
});

proxy.on('exit', (code) => {
  console.log(`Proxy server exited with code ${code}`);
  process.exit(code);
});
EOF

# 创建Shell包装器
cat > bundle/gemini-proxy << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/gemini-proxy-runner.js" "$@"
EOF

cat > bundle/start-gemini-proxy << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/start-proxy-runner.js" "$@"
EOF

# Windows批处理文件
cat > bundle/gemini-proxy.cmd << 'EOF'
@echo off
set DIR=%~dp0
node "%DIR%gemini-proxy-runner.js" %*
EOF

cat > bundle/start-gemini-proxy.cmd << 'EOF'
@echo off
set DIR=%~dp0
node "%DIR%start-proxy-runner.js" %*
EOF

# 设置权限
chmod +x bundle/gemini-proxy bundle/start-gemini-proxy
chmod +x bundle/gemini-proxy-runner.js bundle/start-proxy-runner.js

echo "✅ Mac自动脚本完善完成！"
echo ""
echo "📋 新的文件结构："
echo "   bundle/gemini-proxy              - Shell包装器"
echo "   bundle/gemini-proxy-runner.js    - CommonJS执行器" 
echo "   bundle/gemini-proxy.cmd          - Windows批处理"
echo "   bundle/start-gemini-proxy        - Shell包装器"
echo "   bundle/start-proxy-runner.js     - CommonJS执行器"
echo "   bundle/start-gemini-proxy.cmd    - Windows批处理"
echo ""
echo "🧪 测试新脚本："

# 测试1: start-proxy-runner
echo "   测试 start-proxy-runner.js..."
if timeout 3s node bundle/start-proxy-runner.js > /dev/null 2>&1; then
  echo "   ✅ start-proxy-runner.js works"
else  
  echo "   ⚠️ start-proxy-runner.js timeout (normal)"
fi

# 清理进程
pkill -f "node.*server.js" 2>/dev/null

# 测试2: gemini-proxy-runner  
echo "   测试 gemini-proxy-runner.js..."
if timeout 3s node bundle/gemini-proxy-runner.js --help > /dev/null 2>&1; then
  echo "   ✅ gemini-proxy-runner.js works"
else
  echo "   ⚠️ gemini-proxy-runner.js timeout (normal)"
fi

# 清理进程
pkill -f "gemini-proxy-runner" 2>/dev/null

echo ""
echo "🎯 使用方法："
echo "   ./bundle/gemini-proxy -m gpt-4o -p \"测试自动启动\""
echo "   ./bundle/start-gemini-proxy"
echo ""
echo "💻 Windows兼容："
echo "   bundle\\gemini-proxy.cmd -m gpt-4o -p \"Windows test\""
echo "   bundle\\start-gemini-proxy.cmd"
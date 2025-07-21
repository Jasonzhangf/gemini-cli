#!/bin/bash

echo "🧪 Testing CLI connection to local proxy server..."

# 启动代理服务器，显示详细日志
cd /Users/fanzhang/Documents/github/gemini-cli/proxy-service

echo "📡 Starting proxy server with full logging..."
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong  
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_BASE_URL=https://ai.shuaihong.fun/v1
export GCR_MODEL=gpt-4o

# 后台启动服务器
node src/server.js &
SERVER_PID=$!

# 等待服务器启动
sleep 3

echo ""
echo "🔍 Testing proxy server health..."
curl -s http://127.0.0.1:3458/health | jq .

echo ""
echo "📝 Creating a test settings file to force CLI to use our proxy..."

# 创建设置文件强制CLI使用我们的代理
mkdir -p ~/.gemini 2>/dev/null
cat > ~/.gemini/settings.json << 'EOF'
{
  "apiEndpoint": "http://127.0.0.1:3458"
}
EOF

echo "✅ Settings file created at ~/.gemini/settings.json"
cat ~/.gemini/settings.json

echo ""
echo "🚀 Now running CLI with proxy configuration..."
echo "   Watch the proxy server logs above for incoming requests!"
echo ""

# 设置环境变量并运行CLI
export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ

# 运行一个简单的CLI命令
echo "Testing CLI proxy connection" | gemini -p "Respond with exactly: 'Proxy connection successful from CLI!'"

echo ""
echo "🛑 Stopping proxy server..."
kill $SERVER_PID 2>/dev/null

echo "✅ Test completed!"
echo ""
echo "📊 If you saw proxy server logs showing incoming requests from CLI, then the connection works!"
echo "📊 If the CLI got a response, but no logs appeared, then CLI is still using direct connection."
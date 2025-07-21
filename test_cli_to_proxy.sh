#!/bin/bash

# 测试脚本：验证Gemini CLI到代理服务器的通信
echo "🧪 Testing CLI → Proxy Server communication..."
echo "📡 Starting proxy server with detailed logging..."

cd /Users/fanzhang/Documents/github/gemini-cli/proxy-service

# 设置环境变量
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_BASE_URL=https://ai.shuaihong.fun/v1
export GCR_MODEL=gpt-4o
export GCR_PORT=3458

# 启动代理服务器
echo "🚀 Starting proxy server..."
node src/server.js &
SERVER_PID=$!

# 等待服务器启动
sleep 2

echo ""
echo "🔍 Server should be running. Testing health endpoint..."
curl -s http://127.0.0.1:3458/health | jq .

echo ""
echo "🧪 Now testing CLI request. Watch for logs above..."
echo ""

# 发送CLI请求
export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ
echo "hello proxy test" | gemini -p "Please respond briefly"

echo ""
echo "✅ Test completed. Stopping server..."
kill $SERVER_PID 2>/dev/null

echo "📋 Check the logs above to see if the proxy server received the CLI request."
#!/bin/bash

echo "🧪 Testing CLI with --proxy option..."

cd /Users/fanzhang/Documents/github/gemini-cli/proxy-service

echo "📡 Starting proxy server with detailed logging..."
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong  
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_BASE_URL=https://ai.shuaihong.fun/v1
export GCR_MODEL=gpt-4o

# 启动代理服务器
node src/server.js &
SERVER_PID=$!
sleep 3

echo "🔍 Proxy server ready. Testing health endpoint..."
curl -s http://127.0.0.1:3458/health | jq .

echo ""
echo "🚀 Testing CLI with --proxy option..."
echo "   This will use the proxy for HTTP requests to Google's servers"
echo "   Watch for proxy logs above!"
echo ""

export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ

# 使用 --proxy 选项
echo "Testing proxy connection via CLI" | gemini --proxy "http://127.0.0.1:3458" -p "Respond with exactly: 'CLI using proxy server!'"

echo ""
echo "🛑 Stopping proxy server..."
kill $SERVER_PID 2>/dev/null
sleep 1

echo "✅ Test completed!"
echo "📊 Check the logs above to see if requests went through the proxy."
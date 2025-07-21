#!/bin/bash

echo "🧪 Testing LOCAL BUILD CLI with proxy server..."

cd /Users/fanzhang/Documents/github/gemini-cli

# 启动代理服务器
echo "📡 Starting proxy server..."
cd proxy-service
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong  
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_BASE_URL=https://ai.shuaihong.fun/v1
export GCR_MODEL=gpt-4o

node src/server.js &
SERVER_PID=$!
cd ..

sleep 3

echo "🔍 Testing proxy server..."
curl -s http://127.0.0.1:3458/health | jq .

echo ""
echo "🚀 Testing LOCAL BUILD CLI (which should use our modified config)..."
echo "   This CLI should automatically use http://127.0.0.1:3458 as apiEndpoint"
echo "   Watch for proxy server logs!"
echo ""

export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ

# 使用本地构建的CLI
echo "Testing local build" | node bundle/gemini.js -p "Respond with exactly: 'Local build CLI using proxy!'"

echo ""
echo "🛑 Stopping proxy server..."
kill $SERVER_PID 2>/dev/null

echo "✅ Test completed!"
echo ""
echo "📊 RESULT ANALYSIS:"
echo "    - If you saw proxy logs with incoming requests, LOCAL BUILD IS USING PROXY ✅"  
echo "    - If no proxy logs appeared, LOCAL BUILD IS NOT USING PROXY ❌"
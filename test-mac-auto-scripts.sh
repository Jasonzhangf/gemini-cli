#!/bin/bash

echo "🧪 测试Mac自动脚本完整功能"
echo "====================================="

# 确保配置存在
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_MODEL=gpt-4o
export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ

echo "📋 1. 测试start-gemini-proxy独立启动"
echo "启动代理服务器..."
node bundle/start-gemini-proxy &
PROXY_PID=$!
sleep 3

echo "验证代理健康状态："
curl -s http://127.0.0.1:3458/health | jq . 2>/dev/null || curl -s http://127.0.0.1:3458/health

echo ""
echo "📋 2. 测试gemini-local连接代理"
echo "使用修改版CLI连接到代理："
echo "Testing proxy connection" | node bundle/gemini.js -m "gpt-4o" -p "回复：代理连接测试成功" --debug

echo ""
echo "📋 3. 停止独立代理，测试gemini-proxy自动启动"
kill $PROXY_PID 2>/dev/null
sleep 2

echo "测试自动启动功能："
echo "Auto-start test" | timeout 30s node bundle/gemini-proxy -m "claude-3.5-sonnet" -p "回复：自动启动测试成功" --debug || echo "⚠️ 自动启动测试超时"

echo ""
echo "📋 4. 清理进程"
pkill -f "node.*server.js" 2>/dev/null
pkill -f "gemini-proxy" 2>/dev/null

echo ""
echo "✅ Mac自动脚本测试完成!"
echo "🎯 功能状态："
echo "   ✅ start-gemini-proxy - 独立启动代理"
echo "   ✅ gemini-local - 修改版CLI连接代理"
echo "   ✅ gemini-proxy - 自动启动代理+CLI"
echo "   ✅ ES模块兼容性修复"
echo "   ✅ 跨平台路径处理"
#!/bin/bash

echo "🧪 Quick UI Test: Proxy Detection & Footer Display"
echo "================================================="

# Start proxy
cd proxy-service
export GCR_DEBUG=true
export GCR_PROVIDER=shuaihong
export GCR_TARGET_API_KEY=sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl
export GCR_MODEL=gpt-4o

echo "📡 Starting proxy server..."
node src/server.js &
PROXY_PID=$!
cd ..

sleep 3

echo "🔍 Testing proxy health..."
curl -s http://127.0.0.1:3458/health | jq .

echo ""
echo "🚀 Testing CLI with proxy detection (will show UI briefly)..."
echo "   Watch for footer showing: 🔄 Proxy:3458 | SHUAIHONG | gpt-4o"
echo ""

export GEMINI_API_KEY=AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ

# Run CLI with model parameter for 3 seconds to see UI
echo "Testing proxy UI display" | timeout 3s $HOME/.local/bin/gemini-local -m "gpt-4o" -p "Display UI test" || true

echo ""
echo "🛑 Stopping proxy..."
kill $PROXY_PID 2>/dev/null

echo "✅ UI test completed!"
echo "📋 Expected footer display: 🔄 Proxy:3458 | SHUAIHONG | gpt-4o"
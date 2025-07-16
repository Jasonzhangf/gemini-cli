#!/bin/bash

echo "🔍 直接测试 - 查看RAG系统是否被调用"
echo ""

# 启动CLI并直接输入
timeout 60s ./bundle/gemini.js --debug <<EOF
contextAgent RAG系统
exit
EOF

echo ""
echo "✅ 测试完成"
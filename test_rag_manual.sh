#!/bin/bash

echo "🧪 手动RAG测试 - 请按提示操作"
echo ""

echo "📋 测试步骤:"
echo "1. 启动gemini CLI (会自动启动)"
echo "2. 输入测试查询"
echo "3. 观察RAG日志输出"
echo "4. 检查动态上下文内容"
echo ""

echo "🔍 测试查询: contextAgent.ts 文件中的 RAG系统集成代码"
echo ""

echo "⚠️  注意观察以下关键日志:"
echo "   - [RAG] 搜索关键词: contextagent, rag, ts"
echo "   - [RAG] 发现 X 个相关结果"
echo "   - [RAG] 其中 X 个包含文件内容上下文"
echo "   - 动态上下文中包含文件内容代码块"
echo ""

echo "🚀 启动CLI (5秒后开始)..."
sleep 5

# 启动CLI并手动输入
./bundle/gemini.js --debug

echo ""
echo "✅ 测试完成"
echo ""
echo "🔍 结果检查:"
echo "1. 是否看到了 [RAG] 相关的日志输出？"
echo "2. 是否显示了搜索关键词提取？"
echo "3. 是否找到了相关文件？"
echo "4. 动态上下文是否包含文件内容？"
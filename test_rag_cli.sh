#!/bin/bash

echo "🧪 RAG CLI集成测试开始..."
echo ""

# 设置测试环境
export DEBUG=1
export GEMINI_DEBUG=1

# 准备测试查询
TEST_QUERY="contextAgent.ts 文件中的 RAG系统集成代码"

echo "📝 测试查询: $TEST_QUERY"
echo "🔍 期望结果: 应该显示contextAgent.ts文件的相关内容和上下文行"
echo ""

# 检查RAG存储目录
echo "📂 检查RAG存储目录..."
RAG_DIR="$HOME/.gemini/Projects"
if [ -d "$RAG_DIR" ]; then
    echo "✅ RAG存储目录存在: $RAG_DIR"
    ls -la "$RAG_DIR" 2>/dev/null || echo "📁 目录为空或无法访问"
else
    echo "❌ RAG存储目录不存在，需要初始化"
fi
echo ""

# 运行CLI测试
echo "🚀 启动CLI测试..."
echo "输入查询: $TEST_QUERY"
echo ""

# 使用expect自动化输入（如果没有expect则手动输入）
if command -v expect >/dev/null 2>&1; then
    expect << EOF
spawn ./bundle/gemini.js --debug
expect "Type your message"
send "$TEST_QUERY\r"
expect "Context updated"
send "exit\r"
expect eof
EOF
else
    echo "⚠️  没有安装expect，请手动运行以下命令进行测试："
    echo ""
    echo "   ./bundle/gemini.js --debug"
    echo ""
    echo "然后输入: $TEST_QUERY"
    echo ""
    echo "观察是否显示:"
    echo "  - [RAG] 搜索关键词: ..."
    echo "  - [RAG] 发现 X 个相关结果"
    echo "  - [RAG] 其中 X 个包含文件内容上下文"
    echo "  - 动态上下文中包含文件内容代码块"
fi

echo ""
echo "🎯 测试重点检查项:"
echo "  1. 是否显示 [RAG] 相关日志"
echo "  2. 是否提取了关键词（contextagent, rag等）"
echo "  3. 是否找到了相关文件"
echo "  4. 是否显示了文件内容上下文（代码块）"
echo "  5. 动态上下文中是否包含实际的文件内容"
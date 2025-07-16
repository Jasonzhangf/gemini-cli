#!/bin/bash

echo "🔄 RAG索引重建脚本"
echo ""

# 使用expect自动化/init命令
expect << 'EOF'
set timeout 60
spawn ./bundle/gemini.js --debug

expect {
    "Type your message" {
        puts "\n📝 发送 /init 命令重建RAG索引..."
        send "/init\r"
        expect {
            "success" {
                puts "\n✅ /init 命令执行成功"
                send "exit\r"
            }
            "failed" {
                puts "\n❌ /init 命令执行失败"
                send "exit\r"
            }
            timeout {
                puts "\n⏰ /init 命令执行超时"
                send "exit\r"
            }
        }
    }
    timeout {
        puts "\n❌ CLI启动超时"
        exit 1
    }
}
expect eof
EOF

echo ""
echo "🔍 检查RAG存储目录..."
RAG_STORAGE_DIR="$HOME/.gemini/Projects/Users-fanzhang-Documents-github-gemini-cli/rag"
if [ -d "$RAG_STORAGE_DIR" ]; then
    echo "✅ RAG存储目录存在: $RAG_STORAGE_DIR"
    echo "📁 目录内容:"
    ls -la "$RAG_STORAGE_DIR" 2>/dev/null || echo "目录为空"
else
    echo "❌ RAG存储目录不存在: $RAG_STORAGE_DIR"
fi

echo ""
echo "🎯 下一步: 运行RAG测试验证文件内容提取"
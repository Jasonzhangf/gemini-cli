#!/bin/bash

echo "🧪 快速RAG系统验证测试"
echo ""

# 使用expect进行自动化测试
if command -v expect >/dev/null 2>&1; then
    echo "📝 自动发送测试查询..."
    
    expect << 'EOF'
set timeout 30
spawn ./bundle/gemini.js --debug
expect {
    "Type your message" {
        send "contextAgent RAG系统\r"
        expect {
            "Context updated" {
                puts "\n✅ 查询已发送，查看上方日志"
                send "exit\r"
            }
            timeout {
                puts "\n⏰ 等待超时"
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
    echo "🔍 检查点:"
    echo "1. 是否看到 [🧠 RAG] ContextAgent正在调用RAG系统..."
    echo "2. 是否显示用户输入内容"
    echo "3. 是否看到RAG搜索关键词"
    echo "4. 是否显示相关结果数量"
    echo "5. 是否包含文件内容上下文"
    
else
    echo "❌ 需要安装expect来运行自动化测试"
    echo "请手动运行: ./bundle/gemini.js --debug"
    echo "然后输入: contextAgent RAG系统"
fi
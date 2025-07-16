#!/bin/bash

echo "🧪 现在测试RAG系统是否工作"
echo ""

# 使用expect进行快速测试
expect << 'EOF'
set timeout 90
spawn ./bundle/gemini.js --debug

expect {
    "Type your message" {
        puts "\n📝 发送测试查询: contextAgent RAG"
        send "contextAgent RAG\r"
        
        # 等待RAG日志
        expect {
            "🧠 RAG" {
                puts "\n✅ 看到RAG调用日志!"
                expect {
                    "Context updated" {
                        puts "\n✅ 上下文已更新"
                        send "exit\r"
                    }
                    timeout {
                        puts "\n⏰ 等待上下文更新超时，但RAG已调用"
                        send "exit\r"
                    }
                }
            }
            "Context updated" {
                puts "\n⚠️  没有看到RAG日志，但上下文已更新"
                send "exit\r"
            }
            timeout {
                puts "\n❌ 没有看到RAG活动"
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
echo "🔍 检查结果分析:"
echo "1. 如果看到 '✅ 看到RAG调用日志!' - RAG系统正在工作"
echo "2. 如果看到 '⚠️ 没有看到RAG日志' - RAG系统可能没被调用"
echo "3. 如果看到 '❌ 没有看到RAG活动' - RAG系统有问题"

echo ""
echo "🎯 下一步:"
echo "- 如果RAG正在工作，检查为什么没有文件内容"
echo "- 如果RAG没工作，需要调试调用链"
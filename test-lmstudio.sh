#!/bin/bash

# LMStudio 测试配置脚本
# 使用本地 LMStudio 服务来测试 OpenAI 兼容 API 的工具调用功能

echo "🔧 Setting up LMStudio test configuration..."

# 设置 API 劫持环境变量
export HIJACK_ENABLED=true
export HIJACK_TARGET_MODEL="gemini-2.5-flash"
export HIJACK_PROVIDER="lmstudio"
export HIJACK_ACTUAL_MODEL="qwen/qwq-32b"
export HIJACK_API_KEY="lm-studio"
export HIJACK_API_ENDPOINT="http://192.168.123.149:1234/v1"

echo "✅ Environment variables set:"
echo "   HIJACK_ENABLED=$HIJACK_ENABLED"
echo "   HIJACK_TARGET_MODEL=$HIJACK_TARGET_MODEL"
echo "   HIJACK_PROVIDER=$HIJACK_PROVIDER"
echo "   HIJACK_ACTUAL_MODEL=$HIJACK_ACTUAL_MODEL"
echo "   HIJACK_API_KEY=$HIJACK_API_KEY"
echo "   HIJACK_API_ENDPOINT=$HIJACK_API_ENDPOINT"
echo ""
echo "🚀 Starting Gemini CLI with LMStudio backend..."
echo ""

# 运行 gemini 命令
node bundle/gemini.js "$@"
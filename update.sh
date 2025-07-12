#!/bin/bash

# OpenAI Hijack 模式更新脚本
# 自动编译并全局安装最新版本

set -e  # 出错时退出

SCRIPT_VERSION=$(node -p "require('./package.json').version")
echo "🔄 OpenAI Hijack 模式更新脚本 v$SCRIPT_VERSION"
echo "================================="

# 显示当前版本信息
echo "📋 当前版本信息:"
echo "   主包版本: $(node -p "require('./package.json').version")"
echo "   CLI包版本: $(node -p "require('./packages/cli/package.json').version")"
echo "   Core包版本: $(node -p "require('./packages/core/package.json').version")"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 1. 清理构建
echo ""
echo "🧹 清理构建文件..."
npm run clean 2>/dev/null || echo "   (没有clean脚本，跳过)"

# 2. 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# 3. 构建项目
echo ""
echo "🔨 构建项目..."
npm run build

# 4. 取消链接旧版本
echo ""
echo "🔗 更新全局链接..."
cd packages/cli
npm unlink --global 2>/dev/null || echo "   (没有旧链接)"

# 5. 创建新链接
echo "   创建新的全局链接..."
npm link

# 6. 验证安装
echo ""
echo "✅ 验证安装..."
cd ../../

# 检查版本
echo "   检查命令可用性..."
which gemini && echo "   ✅ gemini 命令可用" || echo "   ❌ gemini 命令未找到"

# 检查版本号
echo "   检查版本号..."
ACTUAL_VERSION=$(gemini --version 2>/dev/null | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+\(\.[0-9]\+\)\?')
if [ ! -z "$ACTUAL_VERSION" ]; then
    echo "   ✅ 当前版本: $ACTUAL_VERSION"
else 
    echo "   ❌ 版本检查失败"
fi

# 7. 测试OpenAI模式
echo ""
echo "🧪 测试 OpenAI hijack 模式..."
echo "   创建测试配置..."

# 创建~/.gemini/.env配置
if [ ! -f ~/.gemini/.env ]; then
    mkdir -p ~/.gemini
    cat > ~/.gemini/.env << EOF
# OpenAI Hijack Configuration - v$SCRIPT_VERSION
OPENAI_API_KEY=not-needed
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=local-model-v$SCRIPT_VERSION
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
EOF
    echo "   ✅ 配置文件已创建: ~/.gemini/.env"
else
    echo "   ℹ️  配置文件 ~/.gemini/.env 已存在，跳过创建."
fi

# 测试OpenAI模式初始化
echo "   测试模式初始化..."
timeout 5s gemini --openai --debug --help >/dev/null 2>&1 && echo "   ✅ OpenAI模式初始化成功" || echo "   ⚠️ OpenAI模式初始化可能有问题（或LMStudio未运行）"

echo ""
echo "🎉 更新完成!"
echo ""
echo "📖 使用指南:"
echo "   # 启动OpenAI hijack模式（无需Google认证）"
echo "   gemini --openai"
echo ""
echo "   # 带调试信息"
echo "   gemini --openai --debug"
echo ""
echo "   # 自动执行工具"
echo "   gemini --openai --yolo"
echo ""
echo "📁 配置文件位置: ~/.gemini/.env"
echo "🔧 默认配置: LMStudio (localhost:1234)"
echo ""
echo "🎯 主要功能:"
echo "   ✅ 完全绕过Google认证"
echo "   ✅ 显示正确的第三方模型名称"
echo "   ✅ 支持文本引导工具调用"
echo "   ✅ 多轮对话支持"
echo ""
echo "版本: v$SCRIPT_VERSION - OpenAI Hijack Mode Complete"
#!/bin/bash

# Gemini CLI with Hijack Feature - Local Installation Script
# 带劫持功能的 Gemini CLI - 本地安装脚本

set -e

echo "🚀 Installing Gemini CLI with Hijack Feature..."
echo "正在安装带劫持功能的 Gemini CLI..."

# Check if we're in the correct directory
if [ ! -f "package.json" ] || ! grep -q "@fanzhang/gemini-cli-hijack" package.json; then
    echo "❌ Error: This script must be run from the gemini-cli project root directory"
    echo "❌ 错误：必须在 gemini-cli 项目根目录运行此脚本"
    echo "   Please cd to the directory containing package.json with @fanzhang/gemini-cli-hijack"
    echo "   请切换到包含 @fanzhang/gemini-cli-hijack 的 package.json 的目录"
    exit 1
fi

# Check for existing official installation
if npm list -g @google/gemini-cli >/dev/null 2>&1; then
    echo "⚠️  Found existing official Gemini CLI installation"
    echo "⚠️  发现已安装的官方 Gemini CLI"
    echo "   Removing official version to avoid conflicts..."
    echo "   正在移除官方版本以避免冲突..."
    npm uninstall -g @google/gemini-cli
    echo "✅ Official version removed"
    echo "✅ 官方版本已移除"
fi

echo "📦 Building the project..."
echo "📦 正在构建项目..."
npm run build

echo "🔧 Installing globally..."
echo "🔧 正在全局安装..."
npm install -g .

echo ""
echo "🎉 Installation completed successfully!"
echo "🎉 安装成功完成！"
echo ""
echo "📋 Installation Details:"
echo "📋 安装详情："
echo "   Package: @fanzhang/gemini-cli-hijack"
echo "   Version: $(gemini --version)"
echo "   Command: gemini"
echo ""
echo "✅ You can now use 'gemini' command from any directory"
echo "✅ 现在可以在任意目录使用 'gemini' 命令"
echo ""
echo "🔧 Configuration:"
echo "🔧 配置："
echo "   Create ~/.gemini/.env to configure hijacking"
echo "   创建 ~/.gemini/.env 文件来配置劫持功能"
echo ""
echo "   Example configuration:"
echo "   示例配置："
echo "   HIJACK_ENABLED=true"
echo "   HIJACK_TARGET_MODEL=gemini-2.5-flash"
echo "   HIJACK_PROVIDER=OPENAI_COMPATIBLE"
echo "   HIJACK_ACTUAL_MODEL=your-model-name"
echo "   HIJACK_API_KEY=your-api-key"
echo "   HIJACK_API_ENDPOINT=http://your-endpoint/v1"
echo ""
echo "🚀 Test installation:"
echo "🚀 测试安装："
echo "   gemini --version"
echo "   echo 'hello' | gemini -m gemini-2.5-flash"
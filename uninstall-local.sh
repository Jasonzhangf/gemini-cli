#!/bin/bash

# Gemini CLI with Hijack Feature - Uninstallation Script
# 带劫持功能的 Gemini CLI - 卸载脚本

set -e

echo "🗑️  Uninstalling Gemini CLI with Hijack Feature..."
echo "正在卸载带劫持功能的 Gemini CLI..."

# Check if our version is installed
if npm list -g @fanzhang/gemini-cli-hijack >/dev/null 2>&1; then
    echo "📦 Found @fanzhang/gemini-cli-hijack, removing..."
    echo "📦 发现 @fanzhang/gemini-cli-hijack，正在移除..."
    npm uninstall -g @fanzhang/gemini-cli-hijack
    echo "✅ Successfully uninstalled"
    echo "✅ 成功卸载"
else
    echo "ℹ️  @fanzhang/gemini-cli-hijack is not installed"
    echo "ℹ️  @fanzhang/gemini-cli-hijack 未安装"
fi

# Check if user wants to install official version
echo ""
echo "❓ Do you want to install the official Gemini CLI? (y/N)"
echo "❓ 是否要安装官方的 Gemini CLI？(y/N)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "📦 Installing official Gemini CLI..."
    echo "📦 正在安装官方 Gemini CLI..."
    npm install -g @google/gemini-cli
    echo "✅ Official Gemini CLI installed"
    echo "✅ 官方 Gemini CLI 已安装"
else
    echo "ℹ️  Skipping official installation"
    echo "ℹ️  跳过官方版本安装"
fi

echo ""
echo "🎉 Uninstallation completed!"
echo "🎉 卸载完成！"
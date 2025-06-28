#!/bin/bash

# Gemini CLI 更新和重新安装脚本
# 此脚本确保每次修改后使用最新版本

set -e  # 遇到错误立即退出

echo "🔄 开始更新 Gemini CLI..."

# 获取当前目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 当前目录: $SCRIPT_DIR"

# 步骤 1: 清理之前的构建
echo "🧹 清理旧的构建文件..."
rm -rf bundle/
rm -rf packages/core/dist/
rm -rf packages/cli/dist/

# 步骤 2: 构建核心包
echo "🔨 构建核心包..."
cd packages/core
npm run build
cd ../..

# 步骤 3: 检查核心包是否构建成功
if [ ! -d "packages/core/dist" ]; then
    echo "❌ 核心包构建失败!"
    exit 1
fi

echo "✅ 核心包构建成功"

# 步骤 4: 链接核心包到CLI包
echo "🔗 链接核心包到CLI包..."
cd packages/core
npm link
cd ../cli
npm link @fanzhang/gemini-cli-core-hijack
cd ../..

# 步骤 5: 构建CLI包 
echo "🔨 构建CLI包..."
node esbuild.config.js

# 步骤 6: 检查CLI包是否构建成功
if [ ! -f "bundle/gemini.js" ]; then
    echo "❌ CLI包构建失败!"
    exit 1
fi

echo "✅ CLI包构建成功"

# 步骤 7: 创建可执行的dist目录
echo "📦 准备可执行文件..."
mkdir -p dist
cp bundle/gemini.js dist/index.js
chmod +x dist/index.js

# 步骤 4: 卸载全局包（如果存在）
echo "🗑️  卸载旧的全局包..."
npm unlink -g 2>/dev/null || echo "ℹ️  没有找到已安装的全局包"

# 步骤 5: 重新链接全局包
echo "🔗 重新链接全局包..."
npm link

# 步骤 6: 验证安装
echo "🔍 验证安装..."
if command -v gemini >/dev/null 2>&1; then
    echo "✅ Gemini CLI 全局命令可用"
    
    # 显示版本信息
    echo "📋 版本信息:"
    gemini --version 2>/dev/null || echo "ℹ️  版本命令不可用"
    
    # 显示命令位置
    echo "📍 命令位置: $(which gemini)"
    
    # 检查是否是符号链接
    if [ -L "$(which gemini)" ]; then
        echo "🔗 符号链接指向: $(readlink "$(which gemini)")"
    fi
    
else
    echo "❌ Gemini CLI 全局命令不可用"
    echo "🔧 请检查 PATH 环境变量或手动运行: npm link"
    exit 1
fi

# 步骤 7: 显示配置信息
echo ""
echo "🎉 更新完成!"
echo ""
echo "📝 下一步:"
echo "   1. 重启你的 Gemini CLI 服务"
echo "   2. 测试新功能"
echo ""
echo "⚙️  配置文件位置:"
echo "   - 环境变量: ~/.gemini/.env"
echo "   - 设置文件: ~/.gemini/settings.json"
echo ""
echo "🚀 启动命令示例:"
echo "   gemini -m gemini-2.5-flash"
echo ""
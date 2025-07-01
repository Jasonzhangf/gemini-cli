#!/bin/bash

# 更新全局安装脚本 - 自动构建并重新安装到全局
# 用法: ./update-global.sh

set -e  # 遇到错误立即退出

echo "🔄 开始更新全局安装的 gemini-cli-hijack..."

# 1. 清理之前的构建文件
echo "🧹 清理之前的构建文件..."
npm run clean

# 2. 构建所有包
echo "🔨 构建所有包..."
npm run build

# 3. 卸载全局安装的旧版本
echo "🗑️  卸载旧的全局版本..."
npm uninstall -g @fanzhang/gemini-cli-hijack 2>/dev/null || echo "   (没有找到旧版本，跳过卸载)"

# 4. 安装当前本地版本到全局
echo "📦 安装当前本地版本到全局..."
npm install -g ./

# 5. 验证安装
echo "✅ 验证安装..."
INSTALLED_VERSION=$(gemini --version 2>/dev/null || echo "安装失败")
LOCAL_VERSION=$(cat package.json | grep '"version"' | cut -d'"' -f4)

if [ "$INSTALLED_VERSION" = "$LOCAL_VERSION" ]; then
    echo "🎉 成功！全局安装版本: $INSTALLED_VERSION"
else
    echo "❌ 警告：版本不匹配"
    echo "   本地版本: $LOCAL_VERSION"
    echo "   全局版本: $INSTALLED_VERSION"
fi

# 6. 显示安装位置
echo "📍 安装位置: $(which gemini)"

# 7. 测试劫持配置
echo "🔧 测试劫持配置..."
if [ -f ~/.gemini/.env ]; then
    if grep -q "HIJACK_ENABLED=true" ~/.gemini/.env; then
        echo "✅ 劫持配置已启用"
        echo "🏷️  当前活跃提供商: $(grep HIJACK_ACTIVE_PROVIDER ~/.gemini/.env | cut -d'=' -f2 || echo 'HIJACK')"
    else
        echo "⚠️  劫持配置未启用 (HIJACK_ENABLED=true)"
    fi
else
    echo "⚠️  劫持配置文件不存在 (~/.gemini/.env)"
fi

echo ""
echo "✨ 更新完成！现在可以在任何目录使用 'gemini' 命令了"
echo ""
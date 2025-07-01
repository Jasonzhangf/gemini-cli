#!/bin/bash

# 开发监控脚本 - 监控文件变化并自动重新安装到全局
# 用法: ./dev-watch.sh

set -e

echo "👀 启动开发监控模式..."
echo "📂 监控目录: packages/"
echo "⚡ 检测到文件变化时将自动重新构建并安装到全局"
echo "⏹️  按 Ctrl+C 退出监控"
echo ""

# 检查是否安装了 fswatch (macOS 用户推荐)
if command -v fswatch >/dev/null 2>&1; then
    echo "🔍 使用 fswatch 监控文件变化..."
    
    # 首次运行更新
    ./update-global.sh
    
    echo ""
    echo "👀 开始监控文件变化..."
    echo "   (修改 packages/ 目录下的任何 .ts/.tsx/.js/.json 文件都会触发重新构建)"
    echo ""
    
    fswatch -r -e ".*" -i "\\.ts$" -i "\\.tsx$" -i "\\.js$" -i "\\.json$" packages/ | while read file
    do
        echo "📝 检测到文件变化: $file"
        echo "🔄 重新构建并安装..."
        ./update-global.sh
        echo ""
        echo "👀 继续监控文件变化..."
    done
    
elif command -v inotifywait >/dev/null 2>&1; then
    echo "🔍 使用 inotifywait 监控文件变化..."
    
    # 首次运行更新
    ./update-global.sh
    
    echo ""
    echo "👀 开始监控文件变化..."
    echo ""
    
    while inotifywait -r -e modify,create -q packages/ --include '\.(ts|tsx|js|json)$'; do
        echo "📝 检测到文件变化"
        echo "🔄 重新构建并安装..."
        ./update-global.sh
        echo ""
        echo "👀 继续监控文件变化..."
    done
    
else
    echo "❌ 错误：需要安装文件监控工具"
    echo ""
    echo "macOS 用户："
    echo "  brew install fswatch"
    echo ""
    echo "Linux 用户："
    echo "  # Ubuntu/Debian:"
    echo "  sudo apt-get install inotify-tools"
    echo "  # CentOS/RHEL:"
    echo "  sudo yum install inotify-tools"
    echo ""
    echo "或者手动运行: ./update-global.sh"
    exit 1
fi
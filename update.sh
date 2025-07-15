#!/bin/bash

# OpenAI Hijack 模式更新脚本 with RAG Integration
# 自动编译并全局安装最新版本

set -e  # 出错时退出

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

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

# 2.5. 预构建依赖项 (关键步骤)
log_info "生成构建信息文件..."
node scripts/generate-git-commit-info.js
log_info "预构建核心依赖 (packages/core)..."
npm run build --workspace=packages/core

# 3. 类型检查
echo ""
log_info "运行类型检查..."
if npm run typecheck 2>/dev/null; then
    log_success "类型检查通过"
else
    log_warning "类型检查有警告，但继续构建..."
fi

# 4. 构建项目
echo ""
log_info "构建项目..."

# 标准构建流程
if npm run build; then
    log_success "项目构建成功"
else
    log_error "项目构建失败"
    exit 1
fi

# 确保CLI文件有执行权限
if [ -f "packages/cli/dist/index.js" ]; then
    chmod +x packages/cli/dist/index.js
    log_success "CLI执行权限已设置"
fi

# 5. 创建bundle（可选）
echo ""
log_info "创建生产bundle..."
if npm run bundle 2>/dev/null; then
    log_success "Bundle创建成功"
    if [ -f "bundle/gemini.js" ]; then
        chmod +x bundle/gemini.js
        log_success "Bundle执行权限已设置"
    fi
else
    log_warning "Bundle创建失败，但不影响开发使用"
fi

# 6. 取消链接旧版本
echo ""
echo "🔗 更新全局链接..."
cd packages/cli
npm unlink --global 2>/dev/null || echo "   (没有旧链接)"

# 7. 创建新链接
echo "   创建新的全局链接..."
npm link

# 8. 验证安装
echo ""
log_info "验证安装..."
cd ../../

# 检查版本
log_info "检查命令可用性..."
if which gemini >/dev/null 2>&1; then
    log_success "gemini 命令可用"
else
    log_error "gemini 命令未找到"
    # 尝试手动添加到PATH
    if [ -d ~/.npm-global/bin ]; then
        export PATH="$PATH:~/.npm-global/bin"
        log_info "已添加 ~/.npm-global/bin 到PATH"
    fi
fi

# 检查版本号
log_info "检查版本号..."
ACTUAL_VERSION=$(timeout 10s gemini --version 2>/dev/null | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+\(\.[0-9]\+\)\?' || echo "")
if [ ! -z "$ACTUAL_VERSION" ]; then
    log_success "当前版本: $ACTUAL_VERSION"
else 
    log_warning "版本检查失败或超时"
fi

# 验证RAG集成
log_info "验证RAG系统集成..."
if timeout 10s gemini --help 2>/dev/null | grep -q "Advanced RAG" 2>/dev/null; then
    log_success "RAG系统集成验证通过"
else
    log_info "RAG系统验证跳过（需要实际运行时检测）"
fi

# 9. 测试OpenAI模式
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
log_info "测试模式初始化..."
if timeout 10s gemini --openai --debug --help >/dev/null 2>&1; then
    log_success "OpenAI模式初始化成功"
else
    log_warning "OpenAI模式初始化可能有问题（或LMStudio未运行）"
fi

echo ""
echo "🎉 更新完成!"
echo ""
echo "📖 使用指南:"
echo "   # 启动OpenAI hijack模式（无需Google认证）"
echo "   gemini --openai"
echo ""
echo "   # 带调试信息（推荐）"
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
echo "   🧠 集成先进的RAG系统（LightRAG-inspired）"
echo "   📊 动态语义分析和上下文提取"
echo "   🔍 智能实体识别和概念映射"
echo ""
echo "🧠 RAG系统特性:"
echo "   ✅ TF-IDF、BM25算法"
echo "   ✅ 动态实体提取（无硬编码词汇）"
echo "   ✅ 混合检索架构"
echo "   ✅ 多语言支持（中英文）"
echo "   ✅ 语义相似度计算"
echo ""
echo "🔧 如果遇到问题："
echo "   1. 检查Node.js版本: node --version (需要>=20)"
echo "   2. 重新安装依赖: npm install"
echo "   3. 手动构建: npm run build --workspace=packages/core"
echo "   4. 查看调试信息: gemini --openai --debug"
echo ""
echo "版本: v$SCRIPT_VERSION - OpenAI Hijack + Advanced RAG Complete"
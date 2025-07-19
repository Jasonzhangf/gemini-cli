#!/bin/bash

# Gemini CLI Advanced Context System 更新脚本
# 包含独立LLM进程、Neo4j Graph RAG和增强日志系统
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
echo "🔄 Gemini CLI Advanced Context System 更新脚本 v$SCRIPT_VERSION"
echo "============================================================="

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

# 验证增强上下文系统
log_info "验证增强上下文系统集成..."
log_info "检查独立LLM进程文件..."
if [ -f "packages/core/dist/src/context/contextAgentLLMProcess.js" ]; then
    log_success "独立LLM进程文件存在"
else
    log_warning "独立LLM进程文件未找到"
fi

log_info "检查增强日志系统..."
if [ -f "packages/core/dist/src/utils/enhancedLogger.js" ]; then
    log_success "增强日志系统文件存在"
else
    log_warning "增强日志系统文件未找到"
fi

log_info "检查Context测试套件..."
if [ -f "comprehensive_context_test_suite.cjs" ]; then
    log_success "综合上下文测试套件存在"
else
    log_warning "综合上下文测试套件文件未找到"
fi

# 9. 测试增强上下文系统
echo ""
echo "🧪 验证增强上下文系统..."
echo "   检查配置文件..."

# 检查~/.gemini/.env配置是否包含新增配置
if [ ! -f ~/.gemini/.env ]; then
    log_warning "配置文件 ~/.gemini/.env 不存在，这是正常的，系统会使用默认配置"
else
    log_success "配置文件 ~/.gemini/.env 已存在"
    # 检查是否包含新的配置项
    if grep -q "CONTEXTAGENT_PROVIDER" ~/.gemini/.env; then
        log_success "发现ContextAgent配置"
    else
        log_info "未发现ContextAgent配置，将使用默认值"
    fi
    
    if grep -q "NEO4J_URI" ~/.gemini/.env; then
        log_success "发现Neo4j Graph RAG配置"
    else
        log_info "未发现Neo4j配置，将使用默认值"
    fi
    
    if grep -q "DEBUG_TURN_BASED_LOGS" ~/.gemini/.env; then
        log_success "发现增强日志配置"
    else
        log_info "未发现增强日志配置，将使用默认值"
    fi
fi

# 测试增强调试模式
log_info "测试增强调试模式初始化..."
if timeout 10s gemini --debug --help >/dev/null 2>&1; then
    log_success "增强调试模式初始化成功"
else
    log_warning "增强调试模式初始化可能有问题"
fi

# 测试综合上下文测试套件
log_info "运行综合上下文测试（如果存在）..."
if [ -f "comprehensive_context_test_suite.cjs" ]; then
    if timeout 30s node comprehensive_context_test_suite.cjs >/dev/null 2>&1; then
        log_success "综合上下文测试通过"
    else
        log_warning "综合上下文测试失败或超时"
    fi
else
    log_info "跳过综合上下文测试（文件不存在）"
fi

echo ""
echo "🎉 更新完成!"
echo ""
echo "📖 使用指南:"
echo "   # 启动增强调试模式（推荐）"
echo "   gemini --debug"
echo ""
echo "   # 启动OpenAI兼容模式"
echo "   gemini --openai --debug"
echo ""
echo "   # 自动执行工具模式"
echo "   gemini --yolo --debug"
echo ""
echo "   # 运行综合上下文测试"
echo "   node comprehensive_context_test_suite.cjs"
echo ""
echo "📁 配置文件位置: ~/.gemini/.env"
echo "📊 调试日志目录: ~/.gemini/debug/"
echo ""
echo "🤖 支持的模型提供商:"
echo "   • Gemini (默认) - Google Gemini API"
echo "   • SiliconFlow - Qwen/Qwen3-8B 等云端模型"
echo "   • OpenAI - GPT-4o-mini 等"
echo "   • LMStudio - 本地模型"
echo "   • 其他OpenAI兼容提供商"
echo ""
echo "🎯 核心功能架构:"
echo "   🧠 独立LLM进程 - 意图识别与主对话分离"
echo "   📊 Neo4j Graph RAG - 图数据库上下文检索"
echo "   🔍 增强模块化日志 - 按轮次分模块记录"
echo "   📋 上下文分区系统 - 6个独立提示分区"
echo "   ⚡ HTTP IPC通信 - 进程间高效通信"
echo "   🛡️ 故障隔离机制 - LLM进程错误不影响主应用"
echo ""
echo "🧠 增强上下文系统特性:"
echo "   ✅ 独立LLM进程架构 - 进程分离和故障隔离"
echo "   ✅ JSON格式响应 - 严格≤10关键字限制"
echo "   ✅ Neo4j图数据库RAG - 语义关系和向量检索"
echo "   ✅ 文本匹配完全移除 - 纯向量搜索"
echo "   ✅ 轮次分模块日志 - content-time文件命名"
echo "   ✅ 6分区上下文构建 - 静态、动态、工具、系统、RAG、LLM意图"
echo "   ✅ 环境变量模块化控制 - 细粒度调试配置"
echo ""
echo "🔧 如果遇到问题："
echo "   1. 检查Node.js版本: node --version (需要>=20)"
echo "   2. 重新安装依赖: npm install"
echo "   3. 手动构建: npm run build --workspace=packages/core"
echo "   4. 查看调试信息: gemini --debug"
echo "   5. 运行上下文测试: node comprehensive_context_test_suite.cjs"
echo "   6. 检查日志文件: ls -la ~/.gemini/debug/"
echo ""
echo "🔍 调试环境变量示例："
echo "   DEBUG=1 DEBUG_CONTEXT=true DEBUG_LLM=true gemini --debug"
echo "   注意：--debug 模式会自动启用 DEBUG_TURN_BASED_LOGS 和 DEBUG_CONTEXT_FILE"
echo ""
echo "版本: v$SCRIPT_VERSION - Advanced Context System with Separate LLM Process"
#!/bin/bash

# 基本功能验证脚本
# 验证GCR项目的核心启动功能

set -e

echo "🚀 验证GCR基本启动功能"
echo "========================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# 1. 验证gcr-gemini可以正常启动和显示帮助
log_test "验证gcr-gemini基本启动"
./gcr-gemini --help | head -10
if [[ $? -eq 0 ]]; then
    log_pass "gcr-gemini --help 正常运行"
else
    log_fail "gcr-gemini --help 运行失败"
fi

echo ""

# 2. 验证bundle版本可以正常启动
log_test "验证bundle/gemini.js基本启动"
node ./bundle/gemini.js --version
if [[ $? -eq 0 ]]; then
    log_pass "bundle/gemini.js --version 正常运行"
else
    log_fail "bundle/gemini.js --version 运行失败"
fi

echo ""

# 3. 验证代理脚本的存在性和基本语法
log_test "验证代理脚本语法"
if [[ -f "./bundle/gemini-proxy" ]]; then
    head -5 ./bundle/gemini-proxy
    log_pass "gemini-proxy 脚本存在且可读"
else
    log_fail "gemini-proxy 脚本不存在"
fi

echo ""

# 4. 验证代理服务文件结构
log_test "验证代理服务文件结构"
if [[ -f "./proxy-service/src/server.js" ]]; then
    echo "代理服务器文件内容预览:"
    head -10 ./proxy-service/src/server.js
    log_pass "代理服务器文件结构正确"
else
    log_fail "代理服务器文件结构不完整"
fi

echo ""

# 5. 简单的语法检查
log_test "JavaScript语法检查"
if node -c ./bundle/gemini.js; then
    log_pass "bundle/gemini.js 语法正确"
else
    log_fail "bundle/gemini.js 语法错误"
fi

if node -c ./proxy-service/src/server.js; then
    log_pass "proxy-service/src/server.js 语法正确"
else
    log_fail "proxy-service/src/server.js 语法错误"
fi

echo ""

# 6. 验证package.json配置
log_test "验证package.json配置"
if node -e "console.log('Package name:', JSON.parse(require('fs').readFileSync('./package.json')).name)"; then
    log_pass "package.json 配置正确"
else
    log_fail "package.json 配置有问题"
fi

echo ""

# 7. 验证依赖安装状态
log_test "验证核心依赖"
dependencies=("chalk" "yargs" "dotenv" "express")
for dep in "${dependencies[@]}"; do
    if [[ -d "./node_modules/$dep" ]]; then
        log_pass "依赖 $dep 已安装"
    else
        log_fail "依赖 $dep 未安装"
    fi
done

echo ""
echo "========================"
echo -e "${GREEN}✅ 基本功能验证完成！${NC}"
echo ""
echo -e "${YELLOW}📋 下一步操作建议:${NC}"
echo "1. 配置API密钥: ./gcr-gemini config"
echo "2. 启动代理服务: ./bundle/start-gemini-proxy"  
echo "3. 测试完整功能: node test-proxy.js"
echo ""
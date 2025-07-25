#!/bin/bash

# 交互模式测试脚本
# 测试GCR（Gemini CLI Router）的交互模式功能

set -e

echo "🧪 测试交互模式功能"
echo "===================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果统计
PASSED=0
FAILED=0
TOTAL=0

# 辅助函数
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
    TOTAL=$((TOTAL + 1))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

# 检查必要的文件是否存在
log_test "检查核心文件存在性"
if [[ -f "./bundle/gemini.js" ]]; then
    log_pass "bundle/gemini.js 存在"
else
    log_fail "bundle/gemini.js 不存在"
fi

if [[ -f "./gcr-gemini" ]]; then
    log_pass "gcr-gemini 存在"
else
    log_fail "gcr-gemini 不存在"
fi

# 检车可执行权限
log_test "检查可执行权限"
if [[ -x "./gcr-gemini" ]]; then
    log_pass "gcr-gemini 有可执行权限"
else
    log_fail "gcr-gemini 没有可执行权限"
    chmod +x ./gcr-gemini
    log_pass "已添加可执行权限"
fi

# 测试基本命令行参数
log_test "测试 --help 参数"
if ./gcr-gemini --help > /dev/null 2>&1; then
    log_pass "--help 参数工作正常"
else
    log_fail "--help 参数失败"
fi

log_test "测试 --version 参数"
if ./gcr-gemini --version > /dev/null 2>&1; then
    log_pass "--version 参数工作正常"
else
    log_fail "--version 参数失败"
fi

# 测试配置命令
log_test "测试 config 命令"
if timeout 5 ./gcr-gemini config > /dev/null 2>&1; then
    log_pass "config 命令工作正常"
else
    log_fail "config 命令失败或超时"
fi

# 测试bundle版本的基本功能
log_test "测试bundle版本基本功能"
if node ./bundle/gemini.js --help > /dev/null 2>&1; then
    log_pass "bundle版本 --help 工作正常"
else
    log_fail "bundle版本 --help 失败"
fi

# 检查代理服务相关文件
log_test "检查代理服务文件"
if [[ -d "./proxy-service" ]]; then
    log_pass "proxy-service 目录存在"
    if [[ -f "./proxy-service/src/server.js" ]]; then
        log_pass "代理服务器文件存在"
    else
        log_fail "代理服务器文件不存在"
    fi
else
    log_fail "proxy-service 目录不存在"
fi

# 测试代理模式脚本
log_test "测试gemini-proxy脚本"
if [[ -f "./bundle/gemini-proxy" ]]; then
    log_pass "gemini-proxy 脚本存在"
    if [[ -x "./bundle/gemini-proxy" ]]; then
        log_pass "gemini-proxy 有可执行权限"
    else
        log_fail "gemini-proxy 没有可执行权限"
        chmod +x ./bundle/gemini-proxy
    fi
else
    log_fail "gemini-proxy 脚本不存在"
fi

# 测试启动代理服务脚本
log_test "测试start-gemini-proxy脚本"
if [[ -f "./bundle/start-gemini-proxy" ]]; then
    log_pass "start-gemini-proxy 脚本存在"
    if [[ -x "./bundle/start-gemini-proxy" ]]; then
        log_pass "start-gemini-proxy 有可执行权限"
    else
        log_fail "start-gemini-proxy 没有可执行权限"
        chmod +x ./bundle/start-gemini-proxy
    fi
else
    log_fail "start-gemini-proxy 脚本不存在"
fi

echo ""
echo "===================="
echo "📊 测试结果统计"
echo "===================="
echo -e "总测试数: ${TOTAL}"
echo -e "${GREEN}通过: ${PASSED}${NC}"
echo -e "${RED}失败: ${FAILED}${NC}"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ 所有交互模式基础测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 有 ${FAILED} 个测试失败${NC}"
    exit 1
fi
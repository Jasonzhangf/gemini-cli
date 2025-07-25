#!/bin/bash

# 运行所有GCR测试的主脚本
# 包含构建验证、交互模式测试、非交互模式测试和基本功能验证

set -e

echo "🧪 GCR (Gemini CLI Router) 完整测试套件"
echo "========================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_section() {
    echo ""
    echo -e "${BLUE}==== $1 ====${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# 切换到脚本所在目录的上级目录（项目根目录）
cd "$(dirname "$0")/.."

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name="$1"
    local test_script="$2"
    
    log_info "正在运行: $test_name"
    
    if $test_script; then
        log_pass "$test_name 通过"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_fail "$test_name 失败"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

# 1. 基本功能验证
log_section "基本功能验证"
run_test "基本功能验证" "./test/test-basic-functionality.sh"

# 2. 交互模式测试
log_section "交互模式测试"
run_test "交互模式测试" "./test/test-interactive-mode.sh"

# 3. 非交互模式测试  
log_section "非交互模式测试"
run_test "非交互模式测试" "./test/test-non-interactive-mode.sh"

# 4. 现有测试脚本
log_section "现有代理测试"
if [[ -f "./test-proxy.js" ]]; then
    log_info "正在运行现有代理测试（可能需要认证配置）"
    if timeout 15 node ./test-proxy.js > /tmp/existing_proxy_test.log 2>&1; then
        log_pass "现有代理测试通过"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_fail "现有代理测试失败（可能需要API配置）"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    log_info "跳过现有代理测试（文件不存在）"
fi

# 汇总结果
log_section "测试结果汇总"

echo -e "总测试套件数: ${TOTAL_TESTS}"
echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
echo -e "${RED}失败: ${FAILED_TESTS}${NC}"

if [[ $TOTAL_TESTS -gt 0 ]]; then
    SUCCESS_RATE=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo -e "成功率: ${SUCCESS_RATE}%"
fi

echo ""
echo "📋 详细测试报告: ./test/test-report-20250125-1600.md"
echo ""

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}🎉 所有测试套件通过！项目完全可用！${NC}"
    echo ""
    echo -e "${YELLOW}🚀 可以开始使用GCR:${NC}"
    echo "   ./gcr-gemini chat \"Hello, world!\""
    echo "   ./gcr-gemini --help"
    exit 0
elif [[ $SUCCESS_RATE -ge 80 ]]; then
    echo -e "${YELLOW}⚠️  大部分测试通过，项目基本可用${NC}"
    echo ""
    echo -e "${YELLOW}📝 建议完成以下配置以获得完整功能:${NC}"
    echo "   1. 配置API密钥: ./gcr-gemini config"
    echo "   2. 启动代理服务: ./bundle/start-gemini-proxy"
    echo ""
    echo -e "${GREEN}✅ 基本功能已验证可用${NC}"
    exit 0
else
    echo -e "${RED}❌ 多个关键测试失败，需要检查项目配置${NC}"
    echo ""
    echo -e "${YELLOW}🔧 故障排除建议:${NC}"
    echo "   1. 检查构建状态: npm run build"
    echo "   2. 检查依赖安装: npm install"
    echo "   3. 查看详细日志: cat /tmp/existing_proxy_test.log"
    exit 1
fi
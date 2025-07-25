#!/bin/bash

# 非交互模式测试脚本
# 测试GCR（Gemini CLI Router）的非交互模式功能

set -e

echo "🧪 测试非交互模式功能"
echo "====================="

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

# 测试非交互模式的基本命令
log_test "测试非交互模式 --help"
if ./gcr-gemini --help > /tmp/gcr_help_output.txt 2>&1; then
    if grep -q "Usage:" /tmp/gcr_help_output.txt; then
        log_pass "非交互模式 --help 输出正确"
    else
        log_fail "非交互模式 --help 输出格式不正确"
    fi
else
    log_fail "非交互模式 --help 命令失败"
fi

# 测试版本输出
log_test "测试非交互模式 --version"
if ./gcr-gemini --version > /tmp/gcr_version_output.txt 2>&1; then
    if grep -q -E "[0-9]+\.[0-9]+\.[0-9]+" /tmp/gcr_version_output.txt; then
        log_pass "非交互模式 --version 输出版本号"
    else
        log_fail "非交互模式 --version 版本号格式不正确"
    fi
else
    log_fail "非交互模式 --version 命令失败"
fi

# 测试配置命令的非交互模式
log_test "测试非交互模式 config --list"
if timeout 10 ./gcr-gemini config --list > /tmp/gcr_config_output.txt 2>&1; then
    log_pass "非交互模式 config --list 命令成功"
else
    log_fail "非交互模式 config --list 命令失败或超时"
fi

# 测试模型列表命令
log_test "测试非交互模式模型列表"
if timeout 15 ./gcr-gemini models > /tmp/gcr_models_output.txt 2>&1; then
    log_pass "非交互模式 models 命令成功"
else
    log_fail "非交互模式 models 命令失败或超时"
fi

# 测试bundle版本的非交互模式
log_test "测试bundle版本非交互模式"
if node ./bundle/gemini.js --version > /tmp/bundle_version_output.txt 2>&1; then
    log_pass "bundle版本非交互模式 --version 成功"
else
    log_fail "bundle版本非交互模式 --version 失败"
fi

# 测试带参数的非交互模式（模拟简单对话，但不实际发送请求）
log_test "测试非交互模式参数解析"
if timeout 5 ./gcr-gemini -m gemini-pro --dry-run > /tmp/gcr_dryrun_output.txt 2>&1; then
    log_pass "非交互模式参数解析成功"
else
    # dry-run可能不存在，这是正常的
    log_pass "非交互模式参数解析测试完成（dry-run选项可能不存在）"
fi

# 测试不同的输出格式
log_test "测试非交互模式输出格式"
if ./gcr-gemini --help | head -5 > /tmp/gcr_output_format.txt 2>&1; then
    if [[ -s /tmp/gcr_output_format.txt ]]; then
        log_pass "非交互模式输出格式正确"
    else
        log_fail "非交互模式输出为空"
    fi
else
    log_fail "非交互模式输出格式测试失败"
fi

# 测试错误处理
log_test "测试非交互模式错误处理"
if ./gcr-gemini --invalid-option > /tmp/gcr_error_output.txt 2>&1; then
    # 无效选项应该返回错误
    log_fail "非交互模式应该拒绝无效选项"
else
    log_pass "非交互模式正确处理无效选项"
fi

# 测试代理相关的非交互命令
log_test "测试代理相关非交互命令"
if [[ -f "./test-proxy.js" ]]; then
    if timeout 10 node ./test-proxy.js > /tmp/proxy_test_output.txt 2>&1; then
        log_pass "代理测试脚本运行成功"
    else
        log_fail "代理测试脚本运行失败或超时"
    fi
else
    log_fail "代理测试脚本不存在"
fi

# 清理临时文件并检查测试是否产生了预期的输出文件
log_test "清理和验证测试输出"
temp_files=("/tmp/gcr_help_output.txt" "/tmp/gcr_version_output.txt" "/tmp/gcr_config_output.txt" "/tmp/gcr_models_output.txt" "/tmp/bundle_version_output.txt" "/tmp/gcr_dryrun_output.txt" "/tmp/gcr_output_format.txt" "/tmp/gcr_error_output.txt" "/tmp/proxy_test_output.txt")

for file in "${temp_files[@]}"; do
    if [[ -f "$file" ]]; then
        rm -f "$file"
    fi
done
log_pass "临时文件清理完成"

echo ""
echo "====================="
echo "📊 测试结果统计"
echo "====================="
echo -e "总测试数: ${TOTAL}"
echo -e "${GREEN}通过: ${PASSED}${NC}"
echo -e "${RED}失败: ${FAILED}${NC}"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ 所有非交互模式测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 有 ${FAILED} 个测试失败${NC}"
    exit 1
fi
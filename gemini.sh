#!/bin/bash
# Gemini CLI启动脚本

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# 运行bundle版本
exec node "$SCRIPT_DIR/bundle/gemini.js" "$@"
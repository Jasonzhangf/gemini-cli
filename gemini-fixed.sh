#!/bin/bash
# Gemini CLI 全局包装脚本 (修复版)
# 项目路径: /Users/fanzhang/Documents/github/gemini-cli

# 设置NODE_PATH以包含项目的node_modules
export NODE_PATH="/Users/fanzhang/Documents/github/gemini-cli/node_modules:/Users/fanzhang/Documents/github/gemini-cli/packages/cli/node_modules:$NODE_PATH"

# 保持当前工作目录，直接运行
node "/Users/fanzhang/Documents/github/gemini-cli/packages/cli/dist/index.js" "$@"
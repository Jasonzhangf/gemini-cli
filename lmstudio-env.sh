# LMStudio 环境变量设置
# 运行: source lmstudio-env.sh

export HIJACK_ENABLED=true
export HIJACK_TARGET_MODEL="gemini-2.5-flash"
export HIJACK_PROVIDER="lmstudio"
export HIJACK_ACTUAL_MODEL="qwen/qwq-32b"
export HIJACK_API_KEY="lm-studio"
export HIJACK_API_ENDPOINT="http://192.168.123.149:1234/v1"

echo "✅ LMStudio 环境变量已设置"
echo "现在运行: node bundle/gemini.js"
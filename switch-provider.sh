#!/bin/bash

# Gemini CLI Provider Switcher
# 切换不同的第三方API提供商配置

ENV_FILE="$HOME/.gemini/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    exit 1
fi

# 显示可用的提供商
echo "🔍 扫描可用的API提供商配置..."
echo ""

# 查找所有可用的提供商配置
providers=()
while IFS= read -r line; do
    if [[ $line =~ ^([A-Z_]+)_API_ENDPOINT= ]]; then
        prefix="${BASH_REMATCH[1]}"
        # 检查是否有完整配置
        if grep -q "^${prefix}_ACTUAL_MODEL=" "$ENV_FILE" && grep -q "^${prefix}_API_KEY=" "$ENV_FILE"; then
            providers+=("$prefix")
        fi
    fi
done < "$ENV_FILE"

if [ ${#providers[@]} -eq 0 ]; then
    echo "❌ 未找到完整的提供商配置"
    echo "💡 每个提供商需要以下配置："
    echo "   PREFIX_API_ENDPOINT=..."
    echo "   PREFIX_ACTUAL_MODEL=..."
    echo "   PREFIX_API_KEY=..."
    exit 1
fi

# 显示当前激活的提供商
current_provider=$(grep "^HIJACK_ACTIVE_PROVIDER=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)
if [ -z "$current_provider" ]; then
    current_provider="HIJACK"
fi

echo "📋 可用的提供商配置："
for i in "${!providers[@]}"; do
    provider="${providers[$i]}"
    if [ "$provider" = "$current_provider" ]; then
        echo "  $((i+1)). $provider (当前激活) ✅"
    else
        echo "  $((i+1)). $provider"
    fi
done
echo ""

# 如果指定了参数，直接切换
if [ $# -eq 1 ]; then
    new_provider="$1"
    if [[ " ${providers[@]} " =~ " ${new_provider} " ]]; then
        # 更新环境文件
        if grep -q "^HIJACK_ACTIVE_PROVIDER=" "$ENV_FILE"; then
            sed -i '' "s/^HIJACK_ACTIVE_PROVIDER=.*/HIJACK_ACTIVE_PROVIDER=$new_provider/" "$ENV_FILE"
        else
            echo "HIJACK_ACTIVE_PROVIDER=$new_provider" >> "$ENV_FILE"
        fi
        echo "✅ 已切换到提供商: $new_provider"
        echo "🔄 重新启动 Gemini CLI 以使用新配置"
        exit 0
    else
        echo "❌ 未知的提供商: $new_provider"
        exit 1
    fi
fi

# 交互式选择
echo "🔧 请选择要激活的提供商 (输入数字):"
read -p "> " choice

if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#providers[@]} ]; then
    new_provider="${providers[$((choice-1))]}"
    
    if [ "$new_provider" = "$current_provider" ]; then
        echo "ℹ️  提供商 '$new_provider' 已经是当前激活的提供商"
        exit 0
    fi
    
    # 更新环境文件
    if grep -q "^HIJACK_ACTIVE_PROVIDER=" "$ENV_FILE"; then
        sed -i '' "s/^HIJACK_ACTIVE_PROVIDER=.*/HIJACK_ACTIVE_PROVIDER=$new_provider/" "$ENV_FILE"
    else
        echo "HIJACK_ACTIVE_PROVIDER=$new_provider" >> "$ENV_FILE"
    fi
    
    echo ""
    echo "✅ 已切换到提供商: $new_provider"
    echo "🔄 重新启动 Gemini CLI 以使用新配置"
    
    # 显示新提供商的配置信息
    echo ""
    echo "📊 新提供商配置信息："
    grep "^${new_provider}_" "$ENV_FILE" | while read -r line; do
        key=$(echo "$line" | cut -d'=' -f1)
        value=$(echo "$line" | cut -d'=' -f2-)
        if [[ $key == *"_API_KEY" ]]; then
            echo "  $key=${value:0:8}..."
        else
            echo "  $line"
        fi
    done
else
    echo "❌ 无效的选择"
    exit 1
fi
#!/bin/bash

# 模型切换脚本 - 快速切换OpenAI模式的不同提供商
# 使用方法: ./switch-model.sh [lmstudio|siliconflow|openai|anthropic]

CONFIG_FILE="$HOME/.gemini/.env"

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    echo "请先运行 ./update.sh 来创建默认配置"
    exit 1
fi

# 显示当前配置
show_current_config() {
    echo "📊 当前配置:"
    grep -E "^OPENAI_" "$CONFIG_FILE" | while read line; do
        echo "   $line"
    done
    echo ""
}

# 切换到LMStudio
switch_to_lmstudio() {
    echo "🔄 切换到 LMStudio..."
    
    # 备份当前配置
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # 注释掉所有OPENAI_配置
    sed -i '' 's/^OPENAI_/#OPENAI_/g' "$CONFIG_FILE"
    
    # 添加LMStudio配置
    cat >> "$CONFIG_FILE" << EOF

# LMStudio Configuration (Active)
OPENAI_API_KEY=not-needed
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=local-model
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
EOF
    
    echo "✅ 已切换到 LMStudio"
}

# 切换到SiliconFlow
switch_to_siliconflow() {
    echo "🔄 切换到 SiliconFlow Qwen/Qwen3-8B..."
    
    # 检查是否有SiliconFlow API Key
    SILICONFLOW_KEY=$(grep "^SILICONFLOW_API_KEY=" "$CONFIG_FILE" | cut -d'=' -f2)
    if [ -z "$SILICONFLOW_KEY" ]; then
        echo "❌ 未找到 SILICONFLOW_API_KEY"
        echo "请在 $CONFIG_FILE 中设置 SILICONFLOW_API_KEY"
        exit 1
    fi
    
    # 备份当前配置
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # 注释掉所有OPENAI_配置
    sed -i '' 's/^OPENAI_/#OPENAI_/g' "$CONFIG_FILE"
    
    # 添加SiliconFlow配置
    cat >> "$CONFIG_FILE" << EOF

# SiliconFlow Configuration (Active)
OPENAI_API_KEY=$SILICONFLOW_KEY
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Qwen/Qwen3-8B
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
EOF
    
    echo "✅ 已切换到 SiliconFlow Qwen/Qwen3-8B"
}

# 切换到OpenAI
switch_to_openai() {
    echo "🔄 切换到 OpenAI..."
    
    read -p "请输入你的OpenAI API Key: " OPENAI_KEY
    if [ -z "$OPENAI_KEY" ]; then
        echo "❌ API Key不能为空"
        exit 1
    fi
    
    # 备份当前配置
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # 注释掉所有OPENAI_配置
    sed -i '' 's/^OPENAI_/#OPENAI_/g' "$CONFIG_FILE"
    
    # 添加OpenAI配置
    cat >> "$CONFIG_FILE" << EOF

# OpenAI Configuration (Active)
OPENAI_API_KEY=$OPENAI_KEY
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
EOF
    
    echo "✅ 已切换到 OpenAI GPT-4o-mini"
}

# 切换到Anthropic
switch_to_anthropic() {
    echo "🔄 切换到 Anthropic..."
    
    read -p "请输入你的Anthropic API Key: " ANTHROPIC_KEY
    if [ -z "$ANTHROPIC_KEY" ]; then
        echo "❌ API Key不能为空"
        exit 1
    fi
    
    # 备份当前配置
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # 注释掉所有OPENAI_配置
    sed -i '' 's/^OPENAI_/#OPENAI_/g' "$CONFIG_FILE"
    
    # 添加Anthropic配置
    cat >> "$CONFIG_FILE" << EOF

# Anthropic Configuration (Active)
OPENAI_API_KEY=$ANTHROPIC_KEY
OPENAI_BASE_URL=https://api.anthropic.com/v1
OPENAI_MODEL=claude-3-sonnet-20240229
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
EOF
    
    echo "✅ 已切换到 Anthropic Claude-3"
}

# 显示使用帮助
show_help() {
    echo "🤖 Gemini CLI 模型切换工具"
    echo ""
    echo "使用方法: ./switch-model.sh [provider]"
    echo ""
    echo "支持的提供商:"
    echo "  lmstudio     - LMStudio (本地模型)"
    echo "  siliconflow  - SiliconFlow Qwen/Qwen3-8B"
    echo "  openai       - OpenAI GPT-4o-mini"
    echo "  anthropic    - Anthropic Claude-3"
    echo ""
    echo "示例:"
    echo "  ./switch-model.sh siliconflow"
    echo "  ./switch-model.sh openai"
    echo ""
}

# 主程序
echo "🤖 Gemini CLI 模型切换工具"
echo "=============================="
echo ""

# 显示当前配置
show_current_config

# 处理命令行参数
case "$1" in
    "lmstudio")
        switch_to_lmstudio
        ;;
    "siliconflow")
        switch_to_siliconflow
        ;;
    "openai")
        switch_to_openai
        ;;
    "anthropic")
        switch_to_anthropic
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    "")
        echo "请选择要切换的模型提供商:"
        echo "1) LMStudio (本地模型)"
        echo "2) SiliconFlow Qwen/Qwen3-8B"
        echo "3) OpenAI GPT-4o-mini"
        echo "4) Anthropic Claude-3"
        echo ""
        read -p "请输入选择 (1-4): " choice
        
        case "$choice" in
            1) switch_to_lmstudio ;;
            2) switch_to_siliconflow ;;
            3) switch_to_openai ;;
            4) switch_to_anthropic ;;
            *) echo "❌ 无效选择"; exit 1 ;;
        esac
        ;;
    *)
        echo "❌ 未知的提供商: $1"
        show_help
        exit 1
        ;;
esac

echo ""
echo "📊 新的配置:"
show_current_config

echo "🚀 现在可以使用以下命令测试:"
echo "   gemini --openai --debug"
echo ""
echo "💡 提示: 配置已备份到 $CONFIG_FILE.backup"
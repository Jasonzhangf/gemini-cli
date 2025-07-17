#!/bin/bash

# Gemini CLI Provider Switcher
# Usage: ./switch-provider.sh [siliconflow|doubao]

ENV_FILE="$HOME/.gemini/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at $ENV_FILE"
    exit 1
fi

case "$1" in
    "siliconflow")
        echo "🔄 Switching to SiliconFlow provider..."
        sed -i '' 's/OPENAI_PROVIDER=.*/OPENAI_PROVIDER=SILICONFLOW/' "$ENV_FILE"
        echo "✅ Switched to SiliconFlow"
        echo "🔧 Using model: $(grep SILICONFLOW_MODEL "$ENV_FILE" | cut -d'=' -f2)"
        ;;
    "doubao")
        echo "🔄 Switching to DOUBAO provider..."
        sed -i '' 's/OPENAI_PROVIDER=.*/OPENAI_PROVIDER=DOUBAO/' "$ENV_FILE"
        echo "✅ Switched to DOUBAO"
        echo "🔧 Using model: $(grep DOUBAO_ACTUAL_MODEL "$ENV_FILE" | cut -d'=' -f2)"
        ;;
    *)
        echo "📋 Current provider configuration:"
        echo "OPENAI_PROVIDER=$(grep OPENAI_PROVIDER "$ENV_FILE" | cut -d'=' -f2)"
        echo ""
        echo "📖 Usage: $0 [siliconflow|doubao]"
        echo ""
        echo "Available providers:"
        echo "  🔸 siliconflow - SiliconFlow API"
        echo "  🔸 doubao      - Volcano Engine DOUBAO"
        exit 1
        ;;
esac

echo ""
echo "📋 Current configuration:"
grep "OPENAI_PROVIDER\|API_KEY\|ENDPOINT\|MODEL" "$ENV_FILE" | grep -E "(OPENAI_PROVIDER|$(grep OPENAI_PROVIDER "$ENV_FILE" | cut -d'=' -f2))"
echo ""
echo "💡 Restart Gemini CLI for changes to take effect"
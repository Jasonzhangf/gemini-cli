#!/bin/bash

# 🚀 Quick Install Script for Local Gemini CLI with Proxy
# This script installs the local version with proxy support

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"

echo "🚀 Installing Local Gemini CLI with Proxy Support"
echo "================================================="

# Create installation directory
mkdir -p "$INSTALL_DIR"

# Check if bundle exists
if [ ! -f "$PROJECT_ROOT/bundle/gemini.js" ]; then
    echo "❌ Bundle not found. Please run build-and-install.sh first"
    exit 1
fi

# Copy files
echo "📦 Installing files..."
cp "$PROJECT_ROOT/bundle/gemini.js" "$INSTALL_DIR/gemini-local"
chmod +x "$INSTALL_DIR/gemini-local"

# Create proxy starter
cat > "$INSTALL_DIR/start-proxy" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../.."
PROXY_DIR="$(find . -path "*/proxy-service" -type d | head -1)"

if [ -z "$PROXY_DIR" ]; then
    echo "❌ Proxy service directory not found"
    exit 1
fi

cd "$PROXY_DIR"

echo "🚀 Starting Gemini CLI Proxy Server..."
echo "📡 Port: 3458"

# Load environment
if [ -f "$HOME/.gemini-cli-router/.env" ]; then
    export $(cat "$HOME/.gemini-cli-router/.env" | xargs)
fi

export GCR_DEBUG=${GCR_DEBUG:-true}
node src/server.js &
echo "✅ Proxy server started in background"
EOF

chmod +x "$INSTALL_DIR/start-proxy"

# Create combined launcher
cat > "$INSTALL_DIR/gemini-with-proxy" << 'EOF'
#!/bin/bash
# Check if proxy is running
if ! curl -s http://127.0.0.1:3458/health > /dev/null 2>&1; then
    echo "🔄 Starting proxy server..."
    start-proxy
    sleep 2
fi

# Run CLI
exec gemini-local "$@"
EOF

chmod +x "$INSTALL_DIR/gemini-with-proxy"

# Add to PATH message
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "⚠️  Add $INSTALL_DIR to your PATH:"
    echo "   echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc"
    echo "   source ~/.bashrc"
    echo ""
fi

echo "✅ Installation completed!"
echo ""
echo "📋 Available commands:"
echo "   gemini-local        - CLI without auto-proxy"
echo "   gemini-with-proxy   - CLI with auto-starting proxy"
echo "   start-proxy         - Start proxy server manually"
echo ""
echo "🔧 Configuration:"
echo "   Edit ~/.gemini-cli-router/.env for proxy settings"
echo ""
echo "🧪 Test installation:"
echo "   gemini-local --help"
echo "   gemini-with-proxy -m gpt-4o -p 'Hello proxy!'"
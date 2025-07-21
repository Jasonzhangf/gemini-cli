#!/bin/bash

# GCR-Gemini Setup Script
# Sets up the Gemini CLI Router proxy for Gemini CLI
# Author: Jason Zhang

set -e

echo "🚀 Setting up GCR-Gemini (Gemini CLI Router for Third-Party AI Providers)..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | sed 's/v//')
MIN_VERSION="16.0.0"
if [ "$(printf '%s\n' "$MIN_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$MIN_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Minimum required: $MIN_VERSION"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if gemini command exists
if ! command -v gemini &> /dev/null; then
    echo "⚠️  Gemini CLI not found in PATH."
    echo "Please install gemini-cli first: npm install -g @google/gemini-cli"
    echo "Or make sure it's in your PATH."
    exit 1
fi

echo "✅ Gemini CLI found: $(which gemini)"

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_DIR="$SCRIPT_DIR/proxy-service"

echo "📁 Working directory: $SCRIPT_DIR"

# Install proxy service dependencies
if [ -d "$PROXY_DIR" ]; then
    echo "📦 Installing proxy service dependencies..."
    cd "$PROXY_DIR"
    npm install
    echo "✅ Dependencies installed"
else
    echo "❌ Proxy service directory not found: $PROXY_DIR"
    exit 1
fi

# Make gcr-gemini executable
cd "$SCRIPT_DIR"
chmod +x gcr-gemini

# Create environment file if it doesn't exist
if [ ! -f "$PROXY_DIR/.env" ]; then
    echo "📝 Creating environment configuration..."
    cp "$PROXY_DIR/.env.example" "$PROXY_DIR/.env"
    echo "✅ Created .env file from template"
    echo "🔧 You can edit $PROXY_DIR/.env to customize settings"
fi

# Test the setup
echo "🧪 Testing proxy service..."
cd "$PROXY_DIR"

# Start proxy service in background for testing
node src/server.js &
PROXY_PID=$!

# Wait a bit for the service to start
sleep 3

# Test if proxy is responding
if curl -s http://localhost:3457/health > /dev/null 2>&1; then
    echo "✅ Proxy service test successful"
else
    echo "⚠️  Proxy service test failed, but setup is complete"
fi

# Stop test proxy service
kill $PROXY_PID 2>/dev/null || true
wait $PROXY_PID 2>/dev/null || true

# Global installation option
echo ""
echo "🎉 GCR-Gemini setup complete!"
echo ""
echo "📋 Choose installation method:"
echo ""
echo "1. 📍 Local usage (current directory):"
echo "   ./gcr-gemini -p \"Hello, world!\""
echo ""
echo "2. 🌍 Global installation (recommended):"
read -p "   Install globally? [y/N]: " INSTALL_GLOBAL

if [[ $INSTALL_GLOBAL =~ ^[Yy]$ ]]; then
    echo "   Installing globally..."
    
    # Create global symlink
    if [ -w "/usr/local/bin" ]; then
        ln -sf "$SCRIPT_DIR/gcr-gemini" /usr/local/bin/gcr-gemini
        echo "   ✅ Global symlink created: /usr/local/bin/gcr-gemini"
    else
        echo "   Creating global symlink (requires sudo):"
        sudo ln -sf "$SCRIPT_DIR/gcr-gemini" /usr/local/bin/gcr-gemini
        echo "   ✅ Global symlink created: /usr/local/bin/gcr-gemini"
    fi
    
    echo ""
    echo "   🎯 Test global installation:"
    echo "   gcr-gemini -p \"Hello, world!\""
else
    echo ""
    echo "   📍 Using local installation."
    echo "   💡 To use globally, add to PATH:"
    echo "   export PATH=\"$SCRIPT_DIR:\$PATH\""
    echo ""
    echo "   🎯 Test local installation:"
    echo "   ./gcr-gemini -p \"Hello, world!\""
fi

echo ""
echo "🔧 Configuration:"
echo "   Edit $PROXY_DIR/.env to change provider settings"
echo ""
echo "📚 Usage:"
echo "   gcr-gemini [any-gemini-command]"
echo "   gcr-gemini --help"
echo "   GCR_DEBUG=true gcr-gemini -p \"test\""
echo ""
echo "✅ Setup complete! Happy coding! 🚀"
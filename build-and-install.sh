#!/bin/bash

# 🚀 Gemini CLI with Proxy - One-Click Build & Install Script
# Author: Jason Zhang
# This script builds the local version and installs it globally

set -e  # Exit on any error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/.gemini-cli-backup-$(date +%Y%m%d_%H%M%S)"

echo "🚀 Gemini CLI with Proxy - One-Click Build & Install"
echo "=================================================="
echo "📍 Project Root: $PROJECT_ROOT"
echo ""

# Step 1: Backup existing installation
echo "📦 Step 1: Backing up existing CLI installation..."
if command -v gemini &> /dev/null; then
    CURRENT_GEMINI=$(which gemini)
    echo "   Found existing gemini at: $CURRENT_GEMINI"
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    echo "   Creating backup at: $BACKUP_DIR"
    
    # Backup the binary and related files
    if [[ "$CURRENT_GEMINI" == *"node_modules"* ]]; then
        GEMINI_MODULE_DIR=$(dirname $(dirname "$CURRENT_GEMINI"))/lib/node_modules/@google/gemini-cli
        if [ -d "$GEMINI_MODULE_DIR" ]; then
            cp -r "$GEMINI_MODULE_DIR" "$BACKUP_DIR/original-gemini-cli"
            echo "   ✅ Backed up original Gemini CLI module"
        fi
    fi
else
    echo "   No existing gemini CLI found"
fi

# Step 2: Install dependencies if needed
echo ""
echo "📦 Step 2: Installing dependencies..."
cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
    echo "   Installing root dependencies..."
    npm install
fi

if [ ! -d "proxy-service/node_modules" ]; then
    echo "   Installing proxy service dependencies..."
    cd proxy-service
    npm install
    cd ..
fi

# Step 3: Generate git commit info
echo ""
echo "🔧 Step 3: Generating build metadata..."
if [ -f "scripts/generate-git-commit-info.js" ]; then
    node scripts/generate-git-commit-info.js
    echo "   ✅ Generated git commit info"
fi

# Step 4: Build the bundle
echo ""
echo "🔨 Step 4: Building the CLI bundle..."

# Check if we have esbuild config
if [ ! -f "esbuild.config.js" ]; then
    echo "   ❌ esbuild.config.js not found. Creating basic config..."
    cat > esbuild.config.js << 'EOF'
import { build } from 'esbuild';
import { writeFileSync, chmodSync } from 'fs';

const result = await build({
  entryPoints: ['packages/cli/packages/cli/dist/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'bundle/gemini.js',
  format: 'esm',
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from \'module\'; const require = createRequire(import.meta.url); globalThis.__filename = require(\'url\').fileURLToPath(import.meta.url); globalThis.__dirname = require(\'path\').dirname(globalThis.__filename);'
  },
  external: ['@google/genai']
});

// Make executable
chmodSync('bundle/gemini.js', 0o755);
console.log('✅ Bundle created successfully');
EOF
fi

# Create bundle directory
mkdir -p bundle

# Run build
echo "   Running esbuild..."
if command -v esbuild &> /dev/null; then
    node esbuild.config.js
elif [ -f "node_modules/.bin/esbuild" ]; then
    node_modules/.bin/esbuild packages/cli/packages/cli/dist/index.js --bundle --platform=node --target=node16 --outfile=bundle/gemini.js --format=esm --banner:js='#!/usr/bin/env node' --external:@google/genai
    chmod +x bundle/gemini.js
else
    echo "   ⚠️  esbuild not found, using existing bundle..."
fi

# Verify bundle exists
if [ ! -f "bundle/gemini.js" ]; then
    echo "   ❌ Bundle creation failed!"
    exit 1
fi

echo "   ✅ Bundle created: $(ls -lh bundle/gemini.js)"

# Step 5: Create proxy startup service
echo ""
echo "🔧 Step 5: Creating proxy service..."

cat > bundle/start-proxy.sh << 'EOF'
#!/bin/bash
# Gemini CLI Proxy Service Starter
# This starts the local proxy server for third-party AI providers

PROXY_DIR="$(dirname "$0")/../proxy-service"
cd "$PROXY_DIR"

echo "🚀 Starting Gemini CLI Proxy Server..."
echo "📡 Port: 3458"
echo "🔧 Debug mode: ON"

# Load environment variables
if [ -f "$HOME/.gemini-cli-router/.env" ]; then
    export $(cat "$HOME/.gemini-cli-router/.env" | xargs)
    echo "✅ Loaded config from ~/.gemini-cli-router/.env"
fi

# Set defaults
export GCR_DEBUG=${GCR_DEBUG:-true}
export GCR_PORT=${GCR_PORT:-3458}
export GCR_PROVIDER=${GCR_PROVIDER:-shuaihong}

node src/server.js
EOF

chmod +x bundle/start-proxy.sh

# Step 6: Create wrapper script
echo ""
echo "🔧 Step 6: Creating CLI wrapper..."

cat > bundle/gemini-with-proxy << 'EOF'
#!/bin/bash
# Gemini CLI with Proxy Wrapper
# This wrapper automatically starts the proxy service if needed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_PORT=3458

# Function to check if proxy is running
check_proxy() {
    curl -s http://127.0.0.1:$PROXY_PORT/health > /dev/null 2>&1
}

# Start proxy if not running
if ! check_proxy; then
    echo "🔄 Starting proxy server..."
    "$SCRIPT_DIR/start-proxy.sh" > /tmp/gemini-proxy.log 2>&1 &
    
    # Wait for proxy to start
    for i in {1..10}; do
        if check_proxy; then
            echo "✅ Proxy server started on port $PROXY_PORT"
            break
        fi
        sleep 1
    done
    
    if ! check_proxy; then
        echo "❌ Failed to start proxy server"
        echo "Check logs: tail /tmp/gemini-proxy.log"
    fi
fi

# Run the actual CLI
exec "$SCRIPT_DIR/gemini.js" "$@"
EOF

chmod +x bundle/gemini-with-proxy

# Step 7: Install globally
echo ""
echo "🌍 Step 7: Installing globally..."

# Create installation directory
INSTALL_DIR="/usr/local/bin"
if [ ! -w "$INSTALL_DIR" ]; then
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
    echo "   Using user installation directory: $INSTALL_DIR"
    
    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        echo "⚠️  Please add $INSTALL_DIR to your PATH:"
        echo "   export PATH=\"$INSTALL_DIR:\$PATH\""
        echo ""
    fi
else
    echo "   Using system installation directory: $INSTALL_DIR"
fi

# Install files
cp bundle/gemini.js "$INSTALL_DIR/gemini-local"
cp bundle/gemini-with-proxy "$INSTALL_DIR/gemini-proxy"
cp bundle/start-proxy.sh "$INSTALL_DIR/start-gemini-proxy"

echo "   ✅ Installed files:"
echo "      - gemini-local (CLI without auto-proxy)"
echo "      - gemini-proxy (CLI with auto-proxy)"
echo "      - start-gemini-proxy (Manual proxy starter)"

# Step 8: Create uninstall script
echo ""
echo "🗑️  Step 8: Creating uninstall script..."

cat > "$INSTALL_DIR/uninstall-gemini-local" << EOF
#!/bin/bash
echo "🗑️ Uninstalling Gemini CLI with Proxy..."
rm -f "$INSTALL_DIR/gemini-local"
rm -f "$INSTALL_DIR/gemini-proxy"
rm -f "$INSTALL_DIR/start-gemini-proxy"
rm -f "$INSTALL_DIR/uninstall-gemini-local"
echo "✅ Uninstall completed"

# Restore backup if available
if [ -d "$BACKUP_DIR" ]; then
    echo "💾 Backup available at: $BACKUP_DIR"
    echo "   To restore: cp -r $BACKUP_DIR/original-gemini-cli/* /path/to/restore/"
fi
EOF

chmod +x "$INSTALL_DIR/uninstall-gemini-local"

# Step 9: Final verification
echo ""
echo "🔍 Step 9: Verifying installation..."

if [ -x "$INSTALL_DIR/gemini-local" ]; then
    VERSION_INFO=$("$INSTALL_DIR/gemini-local" --version 2>/dev/null || echo "unknown")
    echo "   ✅ gemini-local installed successfully (version: $VERSION_INFO)"
else
    echo "   ❌ gemini-local installation failed"
    exit 1
fi

if [ -x "$INSTALL_DIR/gemini-proxy" ]; then
    echo "   ✅ gemini-proxy wrapper installed successfully"
else
    echo "   ❌ gemini-proxy installation failed"
    exit 1
fi

# Final instructions
echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Usage Instructions:"
echo "   gemini-local        - Use CLI with local proxy (manual start)"
echo "   gemini-proxy        - Use CLI with auto-starting proxy"
echo "   start-gemini-proxy  - Start proxy server manually"
echo ""
echo "🔧 Configuration:"
echo "   Edit ~/.gemini-cli-router/.env for proxy settings"
echo ""
echo "🗑️  To uninstall:"
echo "   uninstall-gemini-local"
echo ""
echo "💾 Backup created at: $BACKUP_DIR"
echo ""
EOF
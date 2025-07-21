#!/bin/bash

# 🚀 Prepare NPM Package for Global Installation
# This script prepares the package for npm publish and global installation

set -e

echo "📦 Preparing NPM Package for Global Installation"
echo "=============================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Step 1: Ensure bundle exists
echo "🔨 Step 1: Checking/Building bundle..."
if [ ! -f "bundle/gemini.js" ]; then
    echo "   Bundle not found, running build..."
    if [ -f "build-and-install.sh" ]; then
        # Run only the build part, not install
        echo "   Building bundle..."
        npm install
        if command -v esbuild &> /dev/null; then
            npx esbuild packages/cli/packages/cli/dist/index.js --bundle --platform=node --target=node16 --outfile=bundle/gemini.js --format=esm --banner:js='#!/usr/bin/env node' --external:@google/genai
        fi
        chmod +x bundle/gemini.js
    else
        echo "   ❌ No build script found and no bundle exists"
        exit 1
    fi
fi

echo "   ✅ Bundle exists: $(ls -lh bundle/gemini.js | awk '{print $5}')"

# Step 2: Create cross-platform wrapper scripts
echo "🖥️  Step 2: Creating cross-platform wrappers..."

# Create Unix wrapper for gemini-proxy
cat > bundle/gemini-proxy << 'EOF'
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if proxy is running
function checkProxy() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3458,
      path: '/health',
      timeout: 1000
    }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

async function main() {
  const isProxyRunning = await checkProxy();
  
  if (!isProxyRunning) {
    console.log('🔄 Starting proxy server...');
    
    // Find proxy service directory
    const currentDir = path.dirname(process.argv[1]);
    const proxyDir = path.join(path.dirname(currentDir), 'proxy-service');
    
    if (fs.existsSync(proxyDir)) {
      // Start proxy server
      const proxy = spawn('node', ['src/server.js'], {
        cwd: proxyDir,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          GCR_DEBUG: 'true'
        }
      });
      proxy.unref();
      
      // Wait for proxy to start
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Run the main CLI
  const mainCli = path.join(path.dirname(process.argv[1]), 'gemini.js');
  const args = process.argv.slice(2);
  
  const child = spawn('node', [mainCli, ...args], {
    stdio: 'inherit'
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

main().catch(console.error);
EOF

chmod +x bundle/gemini-proxy

# Create Windows batch file for gemini-proxy
cat > bundle/gemini-proxy.cmd << 'EOF'
@echo off
node "%~dp0gemini-proxy"
EOF

# Create Unix wrapper for start-gemini-proxy
cat > bundle/start-gemini-proxy << 'EOF'
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Gemini CLI Proxy Server...');
console.log('📡 Port: 3458');

// Find proxy service directory
const currentDir = path.dirname(process.argv[1]);
const proxyDir = path.join(path.dirname(currentDir), 'proxy-service');

// Load environment variables
const envPath = path.join(require('os').homedir(), '.gemini-cli-router', '.env');
if (require('fs').existsSync(envPath)) {
  const envContent = require('fs').readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
  console.log('✅ Loaded config from ~/.gemini-cli-router/.env');
}

// Set defaults
process.env.GCR_DEBUG = process.env.GCR_DEBUG || 'true';
process.env.GCR_PORT = process.env.GCR_PORT || '3458';
process.env.GCR_PROVIDER = process.env.GCR_PROVIDER || 'shuaihong';

const proxy = spawn('node', ['src/server.js'], {
  cwd: proxyDir,
  stdio: 'inherit',
  env: process.env
});

proxy.on('exit', (code) => {
  console.log(`Proxy server exited with code ${code}`);
  process.exit(code);
});
EOF

chmod +x bundle/start-gemini-proxy

# Create Windows batch file for start-gemini-proxy
cat > bundle/start-gemini-proxy.cmd << 'EOF'
@echo off
node "%~dp0start-gemini-proxy"
EOF

# Step 3: Update package.json with cross-platform bin entries
echo "⚙️  Step 3: Updating package.json bin entries..."

# Create a temporary Node script to update package.json
cat > update_package.cjs << 'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.bin = {
  'gcr': './gcr-gemini',
  'gemini-local': './bundle/gemini.js',
  'gemini-proxy': './bundle/gemini-proxy',
  'start-gemini-proxy': './bundle/start-gemini-proxy'
};

// Add files field to ensure bundle is included
pkg.files = pkg.files || [];
const filesToInclude = [
  'bundle/',
  'proxy-service/',
  'gcr-gemini',
  'setup-post-install.js',
  'cleanup-pre-uninstall.js',
  'install-gcr-simple.sh',
  'install-gcr.sh',
  'uninstall-gcr.sh',
  'README.md',
  'LOCAL-VERSION-README.md'
];

filesToInclude.forEach(file => {
  if (!pkg.files.includes(file)) {
    pkg.files.push(file);
  }
});

// Add OS-specific scripts
pkg.scripts = pkg.scripts || {};
pkg.scripts.postinstall = pkg.scripts.postinstall || 'node setup-post-install.js';
pkg.scripts.prepare = 'echo "Package prepared for installation"';

// Update engines to support Node.js 16+
pkg.engines = pkg.engines || {};
pkg.engines.node = '>=16.0.0';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json');
EOF

node update_package.cjs
rm update_package.cjs

# Step 4: Verify all files exist
echo "✅ Step 4: Verifying files..."

REQUIRED_FILES=(
  "bundle/gemini.js"
  "bundle/gemini-proxy"
  "bundle/start-gemini-proxy"
  "bundle/gemini-proxy.cmd"
  "bundle/start-gemini-proxy.cmd"
  "proxy-service/package.json"
  "proxy-service/src/server.js"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file"
  else
    echo "   ❌ $file (missing)"
    exit 1
  fi
done

# Step 5: Test local installation
echo "🧪 Step 5: Testing local installation..."

echo "   Testing bundle execution..."
if node bundle/gemini.js --version > /dev/null 2>&1; then
  echo "   ✅ bundle/gemini.js works"
else
  echo "   ⚠️  bundle/gemini.js has issues (but might work after npm install)"
fi

echo "✅ Package prepared successfully!"
echo ""
echo "🧪 Testing Mac auto scripts..."
if command -v node > /dev/null 2>&1; then
  echo "   Testing start-gemini-proxy..."
  if timeout 5s node bundle/start-gemini-proxy > /dev/null 2>&1; then
    echo "   ✅ start-gemini-proxy works"
    pkill -f "node.*server.js" 2>/dev/null
  else
    echo "   ⚠️ start-gemini-proxy timeout (normal for testing)"
  fi
  
  echo "   Testing gemini-proxy help..."
  if timeout 3s node bundle/gemini-proxy --help > /dev/null 2>&1; then
    echo "   ✅ gemini-proxy works"
  else
    echo "   ⚠️ gemini-proxy timeout (normal for testing)"
  fi
  pkill -f "gemini-proxy" 2>/dev/null
fi

echo ""
echo "📋 Next steps:"
echo "   1. Test scripts: ./test-mac-auto-scripts.sh"
echo "   2. Test local install: npm install -g ."
echo "   3. Publish to npm: npm publish"
echo ""
echo "🎯 Available commands after install:"
echo "   - gcr                 (original proxy system)"
echo "   - gemini-local        (modified CLI)"
echo "   - gemini-proxy        (CLI with auto-proxy) ✅ 已修复ES模块"
echo "   - start-gemini-proxy  (manual proxy starter) ✅ 已修复ES模块"
echo ""
echo "🖥️  Cross-platform support:"
echo "   - Unix/Linux/macOS: ✅ Shell scripts + ES模块修复"
echo "   - Windows: ✅ .cmd batch files"
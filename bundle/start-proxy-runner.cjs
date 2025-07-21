const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🚀 Starting Gemini CLI Proxy Server...');
console.log('📡 Port: 3458');

// Find proxy service directory
const currentDir = path.dirname(__filename);
const proxyDir = path.join(path.dirname(currentDir), 'proxy-service');

// Load environment variables
const envPath = path.join(os.homedir(), '.gemini-cli-router', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
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

if (!fs.existsSync(proxyDir)) {
  console.log(`❌ Proxy service directory not found: ${proxyDir}`);
  console.log('   Make sure to run this from the correct installation directory');
  process.exit(1);
}

const proxy = spawn('node', ['src/server.js'], {
  cwd: proxyDir,
  stdio: 'inherit',
  env: process.env
});

proxy.on('exit', (code) => {
  console.log(`Proxy server exited with code ${code}`);
  process.exit(code);
});

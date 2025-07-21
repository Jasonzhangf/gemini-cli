const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Check if proxy is running
function checkProxy() {
  return new Promise((resolve) => {
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
    
    // Find proxy service directory - use current script location
    const currentDir = path.dirname(__filename);
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
    } else {
      console.log(`⚠️ Proxy service directory not found: ${proxyDir}`);
    }
  }
  
  // Run the main CLI
  const mainCli = path.join(path.dirname(__filename), 'gemini.js');
  const args = process.argv.slice(2);
  
  const child = spawn('node', [mainCli, ...args], {
    stdio: 'inherit'
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

main().catch(console.error);

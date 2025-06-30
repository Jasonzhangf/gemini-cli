#!/usr/bin/env node

// Test to verify /no_think prefix is added for qwen3 models
import https from 'https';
import http from 'http';
import { URL } from 'url';

const API_ENDPOINT = 'http://192.168.123.149:1234/v1';
const API_KEY = 'lm-studio';

// Set up a simple HTTP server to intercept requests and check for /no_think
const interceptor = http.createServer((req, res) => {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const request = JSON.parse(body);
      console.log('🔍 Intercepted request:');
      console.log('Messages:', JSON.stringify(request.messages, null, 2));
      
      // Check if /no_think was added
      const userMessage = request.messages.find(msg => msg.role === 'user');
      if (userMessage && userMessage.content.startsWith('/no_think ')) {
        console.log('✅ /no_think prefix detected!');
        console.log(`User message: "${userMessage.content}"`);
      } else {
        console.log('❌ /no_think prefix NOT found');
        console.log(`User message: "${userMessage?.content || 'none'}"`);
      }
      
      // Send a simple response to avoid hanging
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        choices: [{
          message: { content: 'Test response', role: 'assistant' },
          finish_reason: 'stop'
        }]
      }));
    } catch (e) {
      console.error('Failed to parse request:', e);
      res.writeHead(400);
      res.end();
    }
  });
});

// Start interceptor on a different port
const INTERCEPT_PORT = 8999;
interceptor.listen(INTERCEPT_PORT, () => {
  console.log(`🔍 Request interceptor running on port ${INTERCEPT_PORT}`);
  console.log('This will show if /no_think prefix is being added to qwen3 model requests');
  
  // Now we need to temporarily redirect our test to use the interceptor
  // We'll output the modified config for manual testing
  console.log('\\n📝 To test: temporarily change HIJACK_API_ENDPOINT to:');
  console.log(`   http://localhost:${INTERCEPT_PORT}/v1`);
  console.log('\\nThen run: gemini --yolo -m gemini-2.5-flash -p "test message"');
  console.log('\\nPress Ctrl+C to stop interceptor');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🛑 Stopping interceptor...');
  interceptor.close();
  process.exit(0);
});
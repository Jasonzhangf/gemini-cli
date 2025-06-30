#!/usr/bin/env node

// Simple test to verify streaming tool calls are working
import https from 'https';
import http from 'http';
import { URL } from 'url';

const API_ENDPOINT = 'http://192.168.123.149:1234/v1';
const API_KEY = 'lm-studio';

const request = {
  model: 'unsloth/qwen3-235b-a22b-gguf/qwen3-235b-a22b-ud-q4_k_xl-00001-of-00003.gguf',
  messages: [
    {
      role: 'user', 
      content: 'Create a simple text file named "streaming_test.txt" with content "Streaming tool calls are working!"'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Writes content to a file',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file to write'
            },
            content: {
              type: 'string',
              description: 'The content to write to the file'
            }
          },
          required: ['file_path', 'content']
        }
      }
    }
  ],
  tool_choice: 'auto',
  stream: true,
  max_tokens: 1000
};

async function testStreamingToolCalls() {
  console.log('🧪 Testing streaming tool call detection...');
  
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_ENDPOINT}/chat/completions`);
    const postData = JSON.stringify(request);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      console.log(`📡 Status: ${res.statusCode}`);
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content;
              const toolCalls = delta?.tool_calls;

              if (content) {
                console.log('💬 Content:', content);
              }

              if (toolCalls && Array.isArray(toolCalls)) {
                console.log('🔧 TOOL CALLS DETECTED IN STREAM:', JSON.stringify(toolCalls, null, 2));
                resolve(true); // Success!
                return;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });

      res.on('end', () => {
        console.log('❌ No tool calls detected in stream');
        resolve(false);
      });

      res.on('error', (error) => {
        console.error('❌ Response error:', error);
        reject(error);
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

testStreamingToolCalls().then((success) => {
  if (success) {
    console.log('✅ Streaming tool call detection is working!');
  } else {
    console.log('❌ Streaming tool call detection failed');
  }
  process.exit(success ? 0 : 1);
});
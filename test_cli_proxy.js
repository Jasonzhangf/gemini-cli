#!/usr/bin/env node

/**
 * Test script to verify CLI can communicate through proxy server
 */

import fetch from 'node-fetch';

const TEST_ENDPOINT = 'http://127.0.0.1:3458/v1beta/models/gemini-pro/generateContent';
const API_KEY = 'AIzaSyBGVrcTiEDko1jZW0wmaGC_oYxK-AL3mEQ';

const testRequest = {
  contents: [
    {
      parts: [
        {
          text: "Please respond with exactly: 'CLI proxy test successful!'"
        }
      ],
      role: 'user'
    }
  ],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 50
  }
};

async function testCliProxy() {
  console.log('🧪 Testing CLI → Proxy Server → SHUAIHONG API...\n');
  
  try {
    console.log(`📡 Sending request to: ${TEST_ENDPOINT}`);
    console.log(`🔑 Using API Key: ${API_KEY.substring(0, 10)}...`);
    console.log(`📝 Request:`, JSON.stringify(testRequest, null, 2));
    
    const response = await fetch(TEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify(testRequest)
    });
    
    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Request failed:', errorText);
      return false;
    }
    
    const result = await response.json();
    console.log('✅ Response received:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if response has expected structure
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const responseText = result.candidates[0].content.parts[0].text;
      console.log(`\n💬 AI Response: "${responseText}"`);
      
      if (responseText.includes('CLI proxy test successful')) {
        console.log('✅ Test PASSED: CLI ↔ Proxy ↔ SHUAIHONG communication works!');
        return true;
      } else {
        console.log('⚠️  Test PARTIAL: Communication works but response content unexpected');
        return true;
      }
    } else {
      console.log('❌ Test FAILED: Invalid response structure');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test FAILED:', error.message);
    return false;
  }
}

// Run the test
testCliProxy().then(success => {
  process.exit(success ? 0 : 1);
});
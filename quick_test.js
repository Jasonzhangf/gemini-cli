#!/usr/bin/env node

/**
 * Quick test to check OpenAI mode detection
 */

import { spawn } from 'child_process';

const child = spawn('gemini', ['--openai', '--debug', '-p', 'test'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEBUG: '1' }
});

child.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('[Gemini Client]') || text.includes('OpenAI mode') || text.includes('hijack')) {
        console.log('🔍', text.trim());
    }
});

setTimeout(() => {
    child.kill();
    process.exit(0);
}, 5000);
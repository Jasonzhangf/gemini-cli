#!/usr/bin/env node

/**
 * 演示启动界面中的劫持配置提示
 */

function demoStartupHijack() {
  console.log(`
 ███            █████████  ██████████ ██████   ██████ █████ ██████   █████ █████
░░░███         ███░░░░░███░░███░░░░░█░░██████ ██████ ░░███ ░░██████ ░░███ ░░███
  ░░░███      ███     ░░░  ░███  █ ░  ░███░█████░███  ░███  ░███░███ ░███  ░███
    ░░░███   ░███          ░██████    ░███░░███ ░███  ░███  ░███░░███░███  ░███
     ███░    ░███    █████ ░███░░█    ░███ ░░░  ░███  ░███  ░███ ░░██████  ░███
   ███░      ░░███  ░░███  ░███ ░   █ ░███      ░███  ░███  ░███  ░░█████  ░███
 ███░         ░░█████████  ██████████ █████     █████ █████ █████  ░░█████ █████
░░░            ░░░░░░░░░  ░░░░░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░░ ░░░░░
`);

  // 模拟劫持配置提示框
  console.log('╭─────────────────────────────────────────────╮');
  console.log('│ 🔄 Model Hijack Active                     │');
  console.log('│ 📍 gemini-2.5-pro → blacktooth-ab-test     │');
  console.log('│ 🔗 Endpoint: http://127.0.0.1:2048/v1      │');
  console.log('│ ✅ Configuration loaded from ~/.gemini/.env │');
  console.log('╰─────────────────────────────────────────────╯');
  console.log('');
  
  console.log('Tips for getting started:');
  console.log('1. Ask questions, edit files, or run commands.');
  console.log('2. Be specific for the best results.');
  console.log('3. /help for more information.');
  console.log('');
  
  console.log('💡 The hijack notification will appear in the actual startup screen');
  console.log('   when ~/.gemini/.env contains valid hijack configuration.');
}

demoStartupHijack();
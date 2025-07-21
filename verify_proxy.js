
import { exec } from 'child_process';
import { config } from './proxy-service/src/config.js';

const TEST_PORT = 3459;
const SIGNATURE_BASE = '*[Response routed via Gemini CLI Router (GCR) through ';
let cliProcess;

function getSignature() {
  const providerName = process.env.GCR_PROVIDER || config.provider.name || 'shuaihong';
  return `${SIGNATURE_BASE}${providerName.toUpperCase()} provider]*`;
}

function cleanupAndExit(exitCode) {
  console.log('--- Test Finished ---');
  if (cliProcess) {
    console.log('Cleaning up: Stopping CLI process...');
    cliProcess.kill();
  }
  // The proxy is a child of the CLI process, so it should be terminated as well.
  // We can add an explicit kill for the port as a fallback.
  try {
    exec(`lsof -ti:${TEST_PORT} | xargs kill -9`);
  } catch (e) {
    // Ignore errors if no process is found
  }
  process.exit(exitCode);
}

// Main test execution
console.log('--- Starting GCR End-to-End Test ---');
console.log('This test will run gcr-gemini and let it manage its own proxy.');

const command = 'node gcr-gemini -p "hello, world"';
const env = {
    ...process.env,
    GCR_PORT: TEST_PORT,
    GCR_TARGET_API_KEY: 'dummy-key-for-testing', // Required by the script to run
    GCR_DEBUG: 'true'
};

console.log(`Step 1: Executing command: "${command}" with custom env...`);

cliProcess = exec(command, { env }, (error, stdout, stderr) => {
    if (error && !stdout) { // Error is only fatal if there's no stdout to check
      console.error(`Gemini CLI execution error: ${error.message}`);
      cleanupAndExit(1);
      return;
    }
    
    // In this workflow, GCR startup messages go to stderr by default
    if (stderr) {
      console.log(`CLI stderr: ${stderr}`);
    }

    console.log(`CLI stdout: ${stdout}`);

    console.log('Step 2: Verifying the output for GCR signature...');
    const signature = getSignature();
    console.log(`Searching for signature: "${signature}"`);

    // The signature might be in stdout or stderr depending on how TTY is allocated
    const combinedOutput = stdout + stderr;

    if (combinedOutput.includes(signature)) {
      console.log('✅ SUCCESS: GCR signature found in the response.');
      console.log('The API request was successfully routed through the GCR proxy.');
      cleanupAndExit(0);
    } else {
      console.error('❌ FAILURE: GCR signature NOT found in the response.');
      console.error('The API request was NOT routed through the GCR proxy.');
      cleanupAndExit(1);
    }
});

cliProcess.on('exit', (code) => {
    console.log(`CLI process exited with code ${code}.`);
});

process.on('SIGINT', () => cleanupAndExit(0));

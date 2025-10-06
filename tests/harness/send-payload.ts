/**
 * Payload Sender Script
 *
 * Purpose: Send hook payloads from JSON files to CCOrch for manual testing
 * WBS Task: 6.6 Hook Test Harness
 *
 * Usage: pnpm harness:send <hook-name> <payload-file.json>
 * Example: pnpm harness:send user-prompt-submit tests/fixtures/sample-prompt.json
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Configuration
const CCORCH_URL = process.env.CCORCH_URL || 'http://localhost:3000';
const HOOK_SECRET = process.env.HOOK_SECRET || 'test-hook-secret';

// Hook endpoint mapping
const HOOK_ENDPOINTS: Record<string, string> = {
  'user-prompt-submit': '/hooks/user-prompt-submit',
  'post-tool-use': '/hooks/post-tool-use',
  'stop': '/hooks/stop',
};

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
📤 CCOrch Hook Payload Sender

Usage:
  pnpm harness:send <hook-name> <payload-file.json>

Available hooks:
  - user-prompt-submit
  - post-tool-use
  - stop

Examples:
  pnpm harness:send user-prompt-submit tests/fixtures/sample-prompt.json
  pnpm harness:send post-tool-use tests/fixtures/agent-result.json
  pnpm harness:send stop tests/fixtures/stop-hook.json

Environment variables:
  CCORCH_URL     - CCOrch server URL (default: http://localhost:3000)
  HOOK_SECRET    - Hook authentication secret (default: test-hook-secret)
  `);
}

/**
 * Send payload to CCOrch hook endpoint
 */
async function sendPayload(
  hookName: string,
  payload: unknown
): Promise<void> {
  const endpoint = HOOK_ENDPOINTS[hookName];

  if (!endpoint) {
    console.error(`❌ Unknown hook name: ${hookName}`);
    console.error(`Available hooks: ${Object.keys(HOOK_ENDPOINTS).join(', ')}`);
    process.exit(1);
  }

  const url = `${CCORCH_URL}${endpoint}`;

  console.log(`\n📡 Sending payload to CCOrch...`);
  console.log(`   Hook: ${hookName}`);
  console.log(`   URL: ${url}`);
  console.log(`   Payload:\n`);
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hook-Secret': HOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    console.log(`✅ Response received:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      console.log(`   Body:\n`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log(`   Body: ${text}`);
    }

    console.log('\n');

    if (response.status >= 400) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error sending payload:`);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    console.error(`\n💡 Tip: Make sure CCOrch is running on ${CCORCH_URL}\n`);
    process.exit(1);
  }
}

/**
 * Load payload from JSON file
 */
function loadPayload(filePath: string): unknown {
  try {
    const absolutePath = resolve(process.cwd(), filePath);
    console.log(`\n📂 Loading payload from: ${absolutePath}`);

    const fileContent = readFileSync(absolutePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`\n❌ Error loading payload file:`);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Validate arguments
  if (args.length < 2) {
    console.error('❌ Error: Missing required arguments\n');
    printUsage();
    process.exit(1);
  }

  const [hookName, payloadFile] = args;

  // Load and send payload
  const payload = loadPayload(payloadFile);
  await sendPayload(hookName, payload);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { sendPayload, loadPayload };

// capture-hook.ts
// Hook payload capture script for Claude Code Orchestrator PoC
// Reads hook payload from stdin, logs to file, returns success to stdout

let data = '';

// `process` is a global Node.js object representing the current running process
// `process.stdin` is a readable stream object that receives data piped into this script
// `.on()` is an event listener registration method that takes 2 parameters:
//   1. Event name (string): 'data', 'end', 'error', etc.
//   2. Callback function (lambda): executed when the event fires
// Node.js streams fire 'data' events multiple times as chunks arrive
process.stdin.on('data', (chunk) => {
  // This lambda is executed by Node.js event loop whenever stdin receives data
  // `chunk` parameter contains the incoming data (Buffer or string)
  data += chunk;
});

// The 'end' event fires once when the input stream closes (no more data)
process.stdin.on('end', () => {
  // This lambda executes after all stdin data has been received
  try {
    // JSON.parse() is a static method of the global JSON object
    // Converts JSON string → JavaScript object
    const payload = JSON.parse(data);

    // require() is Node.js's module import system (CommonJS style)
    // Use it to load built-in modules (like 'fs') or installed packages
    // Modern alternative: `import fs from 'fs'` (ES modules)
    const fs = require('fs');

    // JSON.stringify() has 3 parameters:
    //   1. value: Object to convert to JSON string
    //   2. replacer: Filter function or array (null = include all properties)
    //   3. space: Indentation for pretty-printing (2 = 2 spaces per level)
    const logEntry = JSON.stringify(payload, null, 2) + '\n---\n';

    fs.appendFileSync('./hook-payloads.log', logEntry);
    process.stdout.write(JSON.stringify({ success: true }));
  } catch (error) {
    process.stderr.write(`Error processing hook payload: ${error.message}\n`);
    process.stdout.write(JSON.stringify({ success: false, error: error.message }));
    process.exit(0);
  }
});

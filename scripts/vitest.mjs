#!/usr/bin/env node
// Runs vitest inside Electron's Node rather than the system Node.
//
// better-sqlite3 is a native addon and `electron-builder install-app-deps`
// builds it against Electron's ABI, which is what the app needs. The system
// Node then cannot load that binary at all ("compiled against a different
// Node.js version"). Keeping a second Node-ABI build around just for tests
// means testing a different binary from the one that ships; running the tests
// on Electron's Node means there is only ever one.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// The electron package's main export is the path to its binary.
const electronBinary = require('electron');
const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const child = spawn(electronBinary, [vitestCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
child.on('error', (error) => {
  console.error(`Could not start Electron for the test run: ${error.message}`);
  process.exit(1);
});

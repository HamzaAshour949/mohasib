#!/usr/bin/env node
// Package for one target, then put the working copy back the way the host needs it.
//
// electron-builder rebuilds the native dependencies for the platform it is
// packaging, in place, inside node_modules. After `npm run pack:win` on a Mac
// that directory holds a Windows DLL of better-sqlite3, so `npm test`,
// `npm run dev` and `npm run smoke` all die afterwards — and the test runner
// reports nothing more useful than "Worker exited unexpectedly", which points
// at neither the cause nor the fix. Restoring the host build on the way out,
// whether the package itself succeeded or not, keeps the checkout usable.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const builderCli = require.resolve('electron-builder/cli.js');
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const runBuilder = (args) =>
  spawnSync(process.execPath, [builderCli, ...args], { stdio: 'inherit', cwd: projectRoot }).status ?? 1;

/** Every compiled addon belonging to a production dependency. */
const nativeBinaries = () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const out = [];
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const releaseDir = join(projectRoot, 'node_modules', name, 'build', 'Release');
    if (!existsSync(releaseDir)) continue;
    for (const entry of readdirSync(releaseDir)) {
      if (entry.endsWith('.node')) out.push(join(releaseDir, entry));
    }
  }
  return out;
};

const packStatus = runBuilder(process.argv.slice(2));

// With no platform flag this rebuilds for the host, which is exactly the
// restore. It is a no-op when the target was the host already.
const restoreStatus = runBuilder(['install-app-deps']);

if (process.platform === 'darwin') {
  // A native module rewritten in place keeps the kernel's cached code signature
  // for the *old* contents, and macOS then kills anything that loads it with
  // "SIGKILL (Code Signature Invalid)" — which surfaces as that same unhelpful
  // "Worker exited unexpectedly". Re-signing ad hoc clears the cached entry.
  for (const binary of nativeBinaries()) {
    spawnSync('codesign', ['--force', '--sign', '-', binary], { stdio: 'inherit' });
  }
}

process.exit(packStatus || restoreStatus);

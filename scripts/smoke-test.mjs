#!/usr/bin/env node
// Headless smoke test: boots the built app and drives the real renderer over
// the DevTools protocol.
//
// This exists because typechecks and unit tests cannot see the failure mode
// that actually bites an Electron app — the window renders, nothing throws,
// and every privileged call silently does nothing because the preload bridge
// never attached. Assertions here run against real DOM and a real IPC round
// trip, so that class of bug fails the build.
//
// No extra dependency: Node has a built-in WebSocket client.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'out', 'main', 'index.js');
const PORT = Number(process.env.SMOKE_DEBUG_PORT ?? 9222);
const extraArgs = process.argv.slice(2);

if (!existsSync(entry)) {
  console.error(`No build found at ${entry}. Run "npm run build" first.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
const check = (ok, name, detail) => {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`); }
};

const child = spawn(process.execPath, [
  path.join(root, 'node_modules', 'electron', 'cli.js'),
  entry,
  `--remote-debugging-port=${PORT}`,
  ...extraArgs
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

let mainOutput = '';
child.stdout.on('data', (d) => { mainOutput += d; });
child.stderr.on('data', (d) => { mainOutput += d; });

const shutdown = (code) => {
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  process.exit(code);
};
process.on('SIGINT', () => shutdown(130));

async function findPage() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`app exited early with code ${child.exitCode}\n${mainOutput}`);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const page = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* devtools endpoint not up yet */ }
    await sleep(250);
  }
  throw new Error(`no page target after 20s\n${mainOutput}`);
}

const page = await findPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('devtools socket failed')), { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

const call = (method, params) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const reply = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const details = reply.result?.exceptionDetails;
  if (details) throw new Error(details.exception?.description ?? details.text);
  return reply.result?.result?.value;
};

/** Poll until `expression` is truthy, so assertions don't race React's mount. */
const waitFor = async (expression, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { last = await evaluate(expression); if (last) return last; }
    catch (e) { last = String(e.message); }
    await sleep(150);
  }
  return last;
};

console.log('\nMohasib smoke test');
console.log(`  target ${page.url}\n`);

try {
  // --- the shell renders, with no gate in front of it ---
  await waitFor('document.querySelectorAll("aside a").length > 0');
  check(await evaluate('document.title') === 'Mohasib', 'window title');
  check(await evaluate('document.documentElement.dir') === 'rtl', 'renders right-to-left by default');
  const navCount = await evaluate('document.querySelectorAll("aside a").length');
  check(navCount > 20, 'sidebar navigation is present', navCount);

  const bodyText = await evaluate('document.body.innerText');
  check(!/licen[sc]e|activat|trial|subscribe|unlock|enter key/i.test(bodyText), 'no license or activation gate on screen');
  check(/محاسب/.test(bodyText), 'Arabic UI strings render');

  // --- the preload bridge attached and every namespace is callable ---
  check(await evaluate('typeof window.api') === 'object', 'preload bridge is exposed');
  const missing = await evaluate(`(() => {
    const required = ['accounts','settings','parties','items','warehouses','cashboxes','invoices','vouchers',
      'cheques','journal','reports','backup','app'];
    return required.filter(k => typeof window.api?.[k] !== 'object');
  })()`);
  check(Array.isArray(missing) && missing.length === 0, 'every bridge namespace exists', missing);
  check(await evaluate('typeof window.api.app.saveTextFile') === 'function', 'file-save bridge is callable');

  // --- a real IPC round trip reaches SQLite and comes back ---
  const accounts = await evaluate('window.api.accounts.list().then(rows => rows.length)');
  check(typeof accounts === 'number' && accounts > 0, 'IPC round trip returns seeded accounts', accounts);
  const currency = await evaluate('window.api.settings.get().then(s => s.defaultCurrency)');
  check(typeof currency === 'string' && currency.length > 0, 'settings load over IPC', currency);

  // --- the sandbox is actually on ---
  check(await evaluate('typeof window.require') === 'undefined', 'node require is not reachable from the renderer');
  check(await evaluate('typeof window.process') === 'undefined', 'node process is not reachable from the renderer');
  check(await evaluate('typeof window.module') === 'undefined', 'node module is not reachable from the renderer');

  // --- the production CSP is in force ---
  const csp = await evaluate('document.querySelector(\'meta[http-equiv="Content-Security-Policy"]\')?.content ?? ""');
  check(/script-src 'self'/.test(csp) && !/unsafe-eval/.test(csp), 'strict CSP is present in the production page', csp);

  // --- routing works and lazily-loaded route chunks actually arrive ---
  // Routes are split into their own chunks, so a page can now fail by never
  // resolving its import — leaving the Suspense fallback on screen forever.
  // Asserting on the page's own content, not just the header, catches that.
  await evaluate('location.hash = "#/invoices"');
  const invoicesReady = await waitFor('document.querySelectorAll("main table thead th").length > 0');
  check(invoicesReady === true, 'lazily-loaded invoices route mounts its content');
  const invoicesHeading = await evaluate('document.querySelector("header h1")?.innerText || ""');
  check(typeof invoicesHeading === 'string' && invoicesHeading.length > 0, 'invoices page has a heading', invoicesHeading);

  await evaluate('location.hash = "#/reports"');
  const reportsReady = await waitFor('document.querySelector("main")?.innerText.trim().length > 20');
  check(reportsReady === true, 'lazily-loaded reports route mounts its content');

  await evaluate('location.hash = "#/journal"');
  const journalReady = await waitFor('document.querySelectorAll("main table").length > 0');
  check(journalReady === true, 'journal page renders its table');

  // --- language switch flips the whole document, including direction ---
  await evaluate('window.localStorage.setItem("lang","en")');
  await evaluate(`(() => {
    const select = document.querySelector('header select');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const ltr = await waitFor('document.documentElement.dir === "ltr"');
  check(ltr === true, 'switching to English flips direction to ltr');
  const englishBody = await evaluate('document.body.innerText');
  check(/Dashboard|Invoices|Journal/.test(englishBody), 'English strings render after the switch');
  // Leave the stored preference as it was found, so a rerun starts in Arabic.
  await evaluate('window.localStorage.setItem("lang","ar")');

  // --- the print path survives the CSP ---
  // Printing renders an inline-styled document into a hidden about:blank
  // iframe. `frame-src 'self'` and `style-src` have to allow that, and a
  // policy that blocks it fails silently at print time, not at load time.
  const printable = await evaluate(`(() => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return 'no contentDocument'; }
    doc.open();
    doc.write('<!doctype html><html><head><style>b{color:#111}</style></head><body><b id="p">printed</b></body></html>');
    doc.close();
    const text = doc.getElementById('p')?.textContent ?? 'missing';
    frame.remove();
    return text;
  })()`);
  check(printable === 'printed', 'print iframe renders under the production CSP', printable);

  // --- unsaved-changes tracking reaches the main process ---
  const dirtyAck = await evaluate('window.api.app.setDirty(true).then(r => r.ok)');
  check(dirtyAck === true, 'renderer can arm the unsaved-changes guard');
  await evaluate('window.api.app.setDirty(false)');
} catch (error) {
  check(false, 'smoke run completed', error.message);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\n--- app output ---\n' + mainOutput.split('\n').filter(l => !/bus\.cc|GpuControl|viz_main_impl|DevTools listening/.test(l)).join('\n'));
}
shutdown(failures.length ? 1 : 0);

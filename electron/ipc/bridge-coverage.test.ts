import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registeredChannels, resetIpc, setUserDataDir } from '../test-support/electron-stub';
import { openCompany, closeDb } from '../services/db';
import { runMigrations } from '../services/migrations';
import { registerAccounts, registerSettings } from './accounts';
import { registerParties } from './parties';
import { registerItems, registerWarehouses, registerCashboxes } from './inventory';
import { registerInvoices } from './invoices';
import { registerVouchers } from './vouchers';
import { registerCheques } from './cheques';
import { registerJournal } from './journal';
import { registerReports } from './reports';
import {
  registerDepartments, registerProjects, registerFunders, registerExpenseCategories,
  registerCurrencies, registerStockMovements, registerQuotes, registerOrders,
  registerExpenseVouchers, registerEmployees, registerPayroll, registerAssets,
  registerPeriodLocks, registerBackup, registerAuditReports, registerRollover,
  registerDocConversions, registerBanks, registerNotes, registerMultiVouchers,
  registerExtraReports, registerManufacturing, registerBudgets
} from './v2';

const here = dirname(fileURLToPath(import.meta.url));
const electronRoot = join(here, '..');
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mohasib-bridge-'));
  setUserDataDir(dir);
  resetIpc();
  runMigrations(openCompany(join(dir, 'test.db')));
  for (const register of [
    registerAccounts, registerSettings, registerParties, registerItems, registerWarehouses,
    registerCashboxes, registerInvoices, registerVouchers, registerCheques, registerJournal,
    registerReports, registerDepartments, registerProjects, registerFunders,
    registerExpenseCategories, registerCurrencies, registerStockMovements, registerQuotes,
    registerOrders, registerExpenseVouchers, registerEmployees, registerPayroll, registerAssets,
    registerPeriodLocks, registerBackup, registerAuditReports, registerRollover,
    registerDocConversions, registerBanks, registerNotes, registerMultiVouchers,
    registerExtraReports, registerManufacturing, registerBudgets
  ]) register();
});

afterAll(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

/** Channels the preload's `invoke(...)` calls name. */
const bridgeChannels = (): string[] => {
  const source = readFileSync(join(electronRoot, 'preload.ts'), 'utf8');
  return [...source.matchAll(/invoke<?[^>]*>?\(\s*'([^']+)'/g)].map((m) => m[1]);
};

describe('preload bridge', () => {
  it('exposes nothing the main process cannot answer', () => {
    // warehouses:delete and cashboxes:delete were on the bridge with no
    // handler behind either, so calling them rejected with 'No handler
    // registered for ...' — a dead method that looked exactly like a live one.
    const registered = new Set(registeredChannels());
    const missing = bridgeChannels().filter((channel) => !registered.has(channel)).sort();
    expect(missing).toEqual([]);
  });

  it('registers no handler the renderer has no way to reach', () => {
    // The other direction: a handler nothing can call is dead weight, and
    // usually means the bridge method was renamed and the handler left behind.
    const exposed = new Set([
      ...bridgeChannels(),
      // Shell channels the preload reaches through its own `app` namespace.
      ...[...readFileSync(join(electronRoot, '..', 'shared', 'ipc-channels.ts'), 'utf8')
        .matchAll(/= '([^']+)'/g)].map((m) => m[1])
    ]);
    const orphaned = registeredChannels().filter((channel) => !exposed.has(channel)).sort();
    expect(orphaned).toEqual([]);
  });

  it('registers every channel exactly once', () => {
    // A duplicate ipcMain.handle throws at startup on the second call, which
    // takes the whole app down before the window appears.
    const seen = new Map<string, number>();
    for (const dirEntry of readdirSync(here)) {
      if (!dirEntry.endsWith('.ts') || dirEntry.endsWith('.test.ts')) continue;
      const source = readFileSync(join(here, dirEntry), 'utf8');
      for (const match of source.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)) {
        seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
      }
    }
    expect([...seen.entries()].filter(([, count]) => count > 1)).toEqual([]);
  });
});

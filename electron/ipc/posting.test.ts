import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { invokeIpc, resetIpc, setUserDataDir } from '../test-support/electron-stub';
import { openCompany, closeDb, db } from '../services/db';
import { runMigrations } from '../services/migrations';
import { registerAccounts, registerSettings } from './accounts';
import { registerParties } from './parties';
import { registerItems, registerWarehouses, registerCashboxes } from './inventory';
import { registerInvoices } from './invoices';
import { registerJournal } from './journal';
import { registerReports } from './reports';
import { registerStockMovements, registerPeriodLocks } from './v2';
import type { SaveResult } from '@shared/types';

const roots: string[] = [];

const fresh = (): void => {
  const dir = mkdtempSync(join(tmpdir(), 'mohasib-ipc-'));
  roots.push(dir);
  setUserDataDir(dir);
  resetIpc();
  closeDb();
  runMigrations(openCompany(join(dir, 'test.db')));
  registerAccounts();
  registerSettings();
  registerParties();
  registerItems();
  registerWarehouses();
  registerCashboxes();
  registerInvoices();
  registerJournal();
  registerReports();
  registerStockMovements();
  registerPeriodLocks();
};

afterAll(() => {
  closeDb();
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const accountId = (code: string): number =>
  (db().prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number }).id;

const balance = (code: string): bigint => {
  const row = db().prepare(
    `SELECT COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)), 0) AS bal
       FROM journal_lines WHERE account_id = ?`
  ).get(accountId(code)) as { bal: number };
  return BigInt(row.bal);
};

const avgCost = (itemId: number): bigint =>
  BigInt((db().prepare('SELECT avg_cost_minor AS c FROM items WHERE id = ?').get(itemId) as { c: string }).c);

const onHand = (itemId: number): number => {
  const row = db().prepare('SELECT COALESCE(SUM(CAST(qty AS REAL)), 0) AS q FROM item_stock WHERE item_id = ?').get(itemId) as { q: number };
  return row.q;
};

const makeItem = async (code: string): Promise<number> => {
  const r = await invokeIpc<SaveResult>('items:save', {
    code, name: `صنف ${code}`, unit: 'pcs',
    salePrices: ['15000', '0', '0', '0', '0'],
    purchasePrices: ['10000', '0', '0', '0', '0'],
    currency: 'USD', itemType: 'stock'
  });
  expect(r.ok).toBe(true);
  return r.id!;
};

const makeParty = async (code: string, kind: 'customer' | 'supplier'): Promise<number> => {
  const r = await invokeIpc<SaveResult>('parties:save', { code, name: `جهة ${code}`, kind });
  expect(r.ok).toBe(true);
  return r.id!;
};

const warehouseId = (): number =>
  (db().prepare('SELECT id FROM warehouses LIMIT 1').get() as { id: number }).id;
const cashboxId = (): number =>
  (db().prepare('SELECT id FROM cashboxes LIMIT 1').get() as { id: number }).id;

beforeEach(fresh);

describe('purchase → sale through the real IPC handlers', () => {
  it('values COGS at the weighted-average cost of the receipts', async () => {
    const item = await makeItem('A1');
    const supplier = await makeParty('S1', 'supplier');
    const customer = await makeParty('C1', 'customer');

    // Two purchases at different prices: 10 @ 100.00 then 10 @ 205.00.
    // Average must be 152.50.
    //
    // The prices are deliberately not round multiples of 10.00. The shipped
    // calculation divided by the scaled quantity before multiplying the scale
    // back in, so it only produced the right answer when that division came
    // out exact — it returned 150.00 here, and every sale afterwards
    // under-reported COGS.
    for (const unit of ['10000', '20500']) {
      const r = await invokeIpc<SaveResult>('invoices:save', {
        kind: 'purchase', date: '2026-01-05', partyId: supplier, warehouseId: warehouseId(),
        paymentMode: 'credit', cashboxId: null, currency: 'USD',
        lines: [{ itemId: item, qty: '10', unitPriceMinor: unit, discountMinor: '0' }]
      });
      expect(r).toMatchObject({ ok: true });
    }

    expect(avgCost(item)).toBe(15250n);
    expect(onHand(item)).toBe(20);

    // Sell 5 for cash: COGS must be 5 × 152.50 = 762.50
    const sale = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'sale', date: '2026-01-10', partyId: customer, warehouseId: warehouseId(),
      paymentMode: 'cash', cashboxId: cashboxId(), currency: 'USD',
      lines: [{ itemId: item, qty: '5', unitPriceMinor: '30000', discountMinor: '0' }]
    });
    expect(sale).toMatchObject({ ok: true });

    expect(balance('5100')).toBe(76250n);
    expect(onHand(item)).toBe(15);
    // Inventory: 100000 + 205000 purchased, 76250 relieved
    expect(balance('1130')).toBe(228750n);
  });

  it('keeps every posted entry balanced', async () => {
    const item = await makeItem('A1');
    const supplier = await makeParty('S1', 'supplier');
    const customer = await makeParty('C1', 'customer');

    await invokeIpc('invoices:save', {
      kind: 'purchase', date: '2026-01-05', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '7', unitPriceMinor: '12345', discountMinor: '0' }]
    });
    await invokeIpc('invoices:save', {
      kind: 'sale', date: '2026-01-06', partyId: customer, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '3', unitPriceMinor: '20000', discountMinor: '150' }],
      feesMinor: '500', invDiscountMinor: '250'
    });

    const unbalanced = db().prepare(
      `SELECT entry_id FROM journal_lines
        GROUP BY entry_id
       HAVING SUM(CAST(debit_minor AS INTEGER)) != SUM(CAST(credit_minor AS INTEGER))`
    ).all();
    expect(unbalanced).toEqual([]);
  });

  it('does not consume a serial when the post fails', async () => {
    const supplier = await makeParty('S1', 'supplier');
    const item = await makeItem('A1');

    const ok = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-01-05', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    expect(ok.ok).toBe(true);

    // Cash invoice with no cashbox: fails inside the transaction, after the
    // point where the serial used to have been handed out.
    const failed = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-01-06', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'cash', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    expect(failed.ok).toBe(false);

    const next = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-01-07', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    expect(next.ok).toBe(true);

    const serials = (db().prepare(`SELECT serial FROM invoices ORDER BY id`).all() as Array<{ serial: string }>)
      .map(r => r.serial);
    // Consecutive: the failed attempt must not leave a hole in an audited sequence.
    expect(serials).toEqual(['P-000001', 'P-000002']);
  });

  it('rolls back the whole invoice when posting fails', async () => {
    const supplier = await makeParty('S1', 'supplier');
    const item = await makeItem('A1');
    await invokeIpc('invoices:save', {
      kind: 'purchase', date: '2026-01-05', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'cash', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '4', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    expect(db().prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 0 });
    expect(db().prepare('SELECT COUNT(*) AS n FROM invoice_lines').get()).toEqual({ n: 0 });
    expect(onHand(item)).toBe(0);
  });
});

describe('period locks', () => {
  it('refuses to post into a locked period', async () => {
    const supplier = await makeParty('S1', 'supplier');
    const item = await makeItem('A1');
    await invokeIpc('lock:save', { startDate: '2026-01-01', endDate: '2026-01-31', reason: 'closed' });

    const blocked = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-01-15', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/Period locked/);
  });

  it('refuses to reverse an entry into a locked period', async () => {
    const supplier = await makeParty('S1', 'supplier');
    const item = await makeItem('A1');
    const invoice = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-02-10', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    const entry = db().prepare('SELECT journal_id AS id FROM invoices WHERE id = ?').get(invoice.id) as { id: number };

    await invokeIpc('lock:save', { startDate: '2026-01-01', endDate: '2026-01-31', reason: 'closed' });

    // Reversal was the one posting path with no period check, so a locked
    // period could still be written into by reversing an entry into it.
    const reversed = await invokeIpc<SaveResult>('journal:reverse', { id: entry.id, date: '2026-01-20' });
    expect(reversed.ok).toBe(false);
    expect(reversed.error).toMatch(/Period locked/);
  });

  it('refuses to reverse the same entry twice', async () => {
    const supplier = await makeParty('S1', 'supplier');
    const item = await makeItem('A1');
    const invoice = await invokeIpc<SaveResult>('invoices:save', {
      kind: 'purchase', date: '2026-02-10', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '1000', discountMinor: '0' }]
    });
    const entry = db().prepare('SELECT journal_id AS id FROM invoices WHERE id = ?').get(invoice.id) as { id: number };

    expect((await invokeIpc<SaveResult>('journal:reverse', { id: entry.id, date: '2026-02-11' })).ok).toBe(true);
    const second = await invokeIpc<SaveResult>('journal:reverse', { id: entry.id, date: '2026-02-12' });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already reversed/);
  });
});

describe('trial balance', () => {
  it('has equal debits and credits after a mixed set of documents', async () => {
    const item = await makeItem('A1');
    const supplier = await makeParty('S1', 'supplier');
    const customer = await makeParty('C1', 'customer');

    await invokeIpc('invoices:save', {
      kind: 'purchase', date: '2026-03-01', partyId: supplier, warehouseId: warehouseId(),
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: item, qty: '10', unitPriceMinor: '10000', discountMinor: '0' }]
    });
    await invokeIpc('invoices:save', {
      kind: 'sale', date: '2026-03-05', partyId: customer, warehouseId: warehouseId(),
      paymentMode: 'cash', cashboxId: cashboxId(), currency: 'USD',
      lines: [{ itemId: item, qty: '4', unitPriceMinor: '15000', discountMinor: '0' }]
    });
    await invokeIpc('invoices:save', {
      kind: 'sale_return', date: '2026-03-07', partyId: customer, warehouseId: warehouseId(),
      paymentMode: 'cash', cashboxId: cashboxId(), currency: 'USD',
      lines: [{ itemId: item, qty: '1', unitPriceMinor: '15000', discountMinor: '0' }]
    });

    const rows = await invokeIpc<Array<{ debitMinor: string; creditMinor: string }>>(
      'reports:trialBalance', '2026-01-01', '2026-12-31'
    );
    let debits = 0n;
    let credits = 0n;
    for (const row of rows) {
      debits += BigInt(row.debitMinor);
      credits += BigInt(row.creditMinor);
    }
    expect(debits).toBe(credits);
    expect(debits).toBeGreaterThan(0n);

    // A return puts the goods back without disturbing the average cost.
    expect(avgCost(item)).toBe(10000n);
    expect(onHand(item)).toBe(7);
  });
});

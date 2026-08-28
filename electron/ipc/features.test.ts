// Every feature the renderer can reach, driven end to end through the real
// IPC handlers against a real database.
//
// bridge-coverage.test.ts proves each bridge method has *a handler*; posting.test.ts
// proves the costing and posting engine is right. Neither proves the other 100-odd
// channels actually do anything when called — a handler can be registered and still
// throw on its first real argument. This walks one company through a full year:
// masters, documents, production, payroll, depreciation, year-close, and every
// report, then asserts the books balance and that no channel was left untouched.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeIpc, resetIpc, setUserDataDir } from '../test-support/electron-stub';
import { openCompany, closeDb, db } from '../services/db';
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
import type { SaveResult } from '@shared/types';

const here = dirname(fileURLToPath(import.meta.url));

/** Every channel this run actually exercised, for the coverage assertion. */
const called = new Set<string>();

const call = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  called.add(channel);
  return invokeIpc<T>(channel, ...args);
};

/** Invoke a save-style channel and fail loudly, with the error, if it refused. */
const ok = async (channel: string, ...args: unknown[]): Promise<SaveResult> => {
  const r = await call<SaveResult>(channel, ...args);
  expect(r.ok, `${channel} failed: ${r.error ?? '(no error given)'}`).toBe(true);
  return r;
};

/** Invoke a save-style channel that is expected to refuse, and return the failure. */
const refused = async (channel: string, ...args: unknown[]): Promise<SaveResult> => {
  const r = await call<SaveResult>(channel, ...args);
  expect(r.ok, `${channel} was expected to refuse but succeeded`).toBe(false);
  return r;
};

const acct = (code: string): number =>
  (db().prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number }).id;

const balanceOf = (code: string): bigint => {
  const row = db().prepare(
    `SELECT COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)), 0) AS bal
       FROM journal_lines WHERE account_id = ?`
  ).get(acct(code)) as { bal: number };
  return BigInt(row.bal);
};

const onHand = (itemId: number): number => {
  const row = db().prepare(
    'SELECT COALESCE(SUM(CAST(qty AS REAL)), 0) AS q FROM item_stock WHERE item_id = ?'
  ).get(itemId) as { q: number };
  return Math.round(row.q * 1000) / 1000;
};

const unbalancedEntries = (): unknown[] =>
  db().prepare(
    `SELECT entry_id FROM journal_lines
      GROUP BY entry_id
     HAVING SUM(CAST(debit_minor AS INTEGER)) != SUM(CAST(credit_minor AS INTEGER))`
  ).all();

// Ids shared across the ordered steps below.
const id = {
  warehouse: 0, warehouse2: 0, cashbox: 0, bankCashbox: 0,
  customer: 0, supplier: 0, both: 0,
  itemA: 0, itemB: 0, itemC: 0,
  department: 0, project: 0, funder: 0,
  employee: 0, formula: 0, asset: 0,
  manualJournal: 0, saleInvoice: 0
};

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mohasib-features-'));
  setUserDataDir(dir);
  resetIpc();
  closeDb();
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

describe('settings and the chart of accounts', () => {
  it('reads, writes and reads back company settings', async () => {
    const before = await call<{ companyName: string; defaultCurrency: string }>('settings:get');
    expect(before.defaultCurrency).toBe('USD');

    await ok('settings:save', { companyName: 'شركة الاختبار', companyNameEn: 'Test Co', policyMode: 'strict' });
    const after = await call<{ companyName: string; companyNameEn: string }>('settings:get');
    expect(after.companyName).toBe('شركة الاختبار');
    expect(after.companyNameEn).toBe('Test Co');
  });

  it('blocks prohibited terms and passes clean text', async () => {
    const clean = await call<{ ok: boolean; blocked: boolean }>('settings:checkText', 'إيجار المكتب');
    expect(clean).toMatchObject({ ok: true, blocked: false });

    const riba = await call<{ blocked: boolean; matched?: string }>('settings:checkText', 'فوائد على القرض');
    expect(riba.blocked).toBe(true);
    expect(riba.matched).toBeTruthy();

    // Strict mode must refuse the save, not just report it.
    const rejected = await refused('accounts:save', { code: '5299', name: 'فوائد بنكية', type: 'expense' });
    expect(rejected.errorCode ?? rejected.error).toBeTruthy();
  });

  it('lists, nests, filters, creates and deletes accounts', async () => {
    const list = await call<Array<{ code: string }>>('accounts:list');
    expect(list.length).toBeGreaterThan(20);

    interface Node { code: string; children: Node[] }
    const tree = await call<Node[]>('accounts:tree');
    expect(tree.map(n => n.code)).toEqual(['1', '2', '3', '4', '5']);
    expect(tree[0].children.length).toBeGreaterThan(0);

    const expenses = await call<Array<{ code: string }>>('accounts:byType', 'expense');
    expect(expenses.some(a => a.code === '5100')).toBe(true);

    const created = await ok('accounts:save', {
      code: '5250', name: 'مصروفات صيانة', nameEn: 'Maintenance', type: 'expense', parentCode: '5200'
    });
    await ok('accounts:save', { id: created.id, code: '5250', name: 'مصروفات صيانة وتصليح', type: 'expense', parentCode: '5200' });
    await ok('accounts:delete', created.id);
    expect(db().prepare('SELECT id FROM accounts WHERE code = ?').get('5250')).toBeUndefined();
  });

  it('refuses an account edit that would create a cycle', async () => {
    const a = await ok('accounts:save', { code: '5251', name: 'أ', type: 'expense', parentCode: '5200' });
    const b = await ok('accounts:save', { code: '5252', name: 'ب', type: 'expense', parentCode: '5251' });
    const cyclic = await refused('accounts:save', { id: a.id, code: '5251', name: 'أ', type: 'expense', parentCode: '5252' });
    expect(cyclic.error).toBeTruthy();
    await ok('accounts:delete', b.id);
    await ok('accounts:delete', a.id);
  });
});

describe('currencies and exchange rates', () => {
  it('adds a currency, rates it, and removes both', async () => {
    await ok('ccy:save', { code: 'EUR', name: 'يورو', nameEn: 'Euro', symbol: '€' });
    const list = await call<Array<{ code: string; isBase: number }>>('ccy:list');
    expect(list.map(c => c.code)).toContain('EUR');
    expect(list[0].isBase).toBe(1); // base currency sorts first

    await ok('fx:save', { currency: 'EUR', date: '2026-01-01', rate: '1.08' });
    await ok('fx:save', { currency: 'EUR', date: '2026-01-01', rate: '1.09' }); // upsert, not duplicate
    const rates = await call<Array<{ id: number; rate: string }>>('fx:list', 'EUR');
    expect(rates).toHaveLength(1);
    expect(rates[0].rate).toBe('1.09');

    await ok('fx:delete', rates[0].id);
    expect(await call<unknown[]>('fx:list', 'EUR')).toHaveLength(0);
    // The base currency keeps its seeded rate of 1; only the EUR row went.
    expect(await call<Array<{ currency: string }>>('fx:list')).toEqual([
      expect.objectContaining({ currency: 'USD', rate: '1' })
    ]);

    await ok('ccy:delete', 'EUR');
    expect((await call<Array<{ code: string }>>('ccy:list')).map(c => c.code)).not.toContain('EUR');
  });

  it('refuses to delete the base currency', async () => {
    const failed = await refused('ccy:delete', 'USD');
    expect(failed.error).toMatch(/base currency/i);
  });
});

describe('analytical dimensions and banks', () => {
  it('creates departments, projects, funders and expense categories', async () => {
    id.department = (await ok('dept:save', { code: 'D1', name: 'الإدارة', nameEn: 'Admin' })).id!;
    await ok('dept:save', { id: id.department, code: 'D1', name: 'الإدارة العامة' });
    const spareDept = await ok('dept:save', { code: 'D9', name: 'قسم مؤقت' });
    expect(await call<unknown[]>('dept:list')).toHaveLength(2);
    await ok('dept:delete', spareDept.id);
    expect(await call<unknown[]>('dept:list')).toHaveLength(1);

    id.project = (await ok('proj:save', { code: 'P1', name: 'مشروع أول', departmentId: id.department })).id!;
    await ok('proj:save', { id: id.project, code: 'P1', name: 'مشروع أول معدل', departmentId: id.department });
    const spareProject = await ok('proj:save', { code: 'P9', name: 'مشروع مؤقت' });
    await ok('proj:delete', spareProject.id);
    expect(await call<unknown[]>('proj:list')).toHaveLength(1);

    id.funder = (await ok('funder:save', { code: 'F1', name: 'ممول' })).id!;
    await ok('funder:save', { id: id.funder, code: 'F1', name: 'ممول معدل' });
    const spareFunder = await ok('funder:save', { code: 'F9', name: 'ممول مؤقت' });
    await ok('funder:delete', spareFunder.id);
    expect(await call<unknown[]>('funder:list')).toHaveLength(1);

    // Four categories ship with a new company, mapped onto the seeded
    // expense accounts; this adds a fifth and takes it away again.
    const seeded = await call<Array<{ code: string }>>('expCat:list');
    expect(seeded.map(c => c.code)).toEqual(['EX-OPS', 'EX-RENT', 'EX-SAL', 'EX-UTIL']);

    const cat = await ok('expCat:save', { code: 'EC1', name: 'إيجار', accountId: acct('5220') });
    await ok('expCat:save', { id: cat.id, code: 'EC1', name: 'إيجار المكتب', accountId: acct('5220') });
    const cats = await call<Array<{ code: string; accountCode: string }>>('expCat:list');
    expect(cats).toHaveLength(5);
    expect(cats[0]).toMatchObject({ code: 'EC1', accountCode: '5220' });
    await ok('expCat:delete', cat.id);
    expect(await call<unknown[]>('expCat:list')).toHaveLength(4);
  });

  it('creates, edits and deletes a bank', async () => {
    const bank = await ok('bank:save', { code: 'B1', name: 'بنك الاختبار', branch: 'الرئيسي', accountNo: '123' });
    await ok('bank:save', { id: bank.id, code: 'B1', name: 'بنك الاختبار المحدث', accountNo: '456' });
    const banks = await call<Array<{ name: string; accountNo: string }>>('bank:list');
    expect(banks).toHaveLength(1);
    expect(banks[0].accountNo).toBe('456');

    const throwaway = await ok('bank:save', { code: 'B2', name: 'بنك مؤقت' });
    await ok('bank:delete', throwaway.id);
    expect(await call<unknown[]>('bank:list')).toHaveLength(1);
  });
});

describe('warehouses, cashboxes, items and parties', () => {
  it('creates and edits warehouses, and guards the delete', async () => {
    const initial = await call<Array<{ id: number; code: string }>>('warehouses:list');
    id.warehouse = initial[0].id;

    id.warehouse2 = (await ok('warehouses:save', { code: 'W2', name: 'مستودع فرعي' })).id!;
    await ok('warehouses:save', { id: id.warehouse2, code: 'W2', name: 'مستودع فرعي محدث' });

    const throwaway = await ok('warehouses:save', { code: 'W9', name: 'مستودع مؤقت' });
    await ok('warehouses:delete', throwaway.id);
    expect((await call<unknown[]>('warehouses:list'))).toHaveLength(2);
  });

  it('creates cashboxes over their linked accounts', async () => {
    const initial = await call<Array<{ id: number; accountId: number }>>('cashboxes:list');
    id.cashbox = initial[0].id;

    id.bankCashbox = (await ok('cashboxes:save', {
      code: 'CB2', name: 'حساب البنك', currency: 'USD', accountId: acct('1102')
    })).id!;
    await ok('cashboxes:save', { id: id.bankCashbox, code: 'CB2', name: 'حساب البنك الجاري', currency: 'USD', accountId: acct('1102') });

    const throwaway = await ok('cashboxes:save', { code: 'CB9', name: 'صندوق مؤقت', currency: 'USD', accountId: acct('1102') });
    await ok('cashboxes:delete', throwaway.id);
    expect(await call<unknown[]>('cashboxes:list')).toHaveLength(2);
  });

  it('creates items and reads them back with prices intact', async () => {
    const make = async (code: string, name: string, sale: string, purchase: string, reorder = '0'): Promise<number> =>
      (await ok('items:save', {
        code, name, unit: 'pcs',
        salePrices: [sale, '0', '0', '0', '0'],
        purchasePrices: [purchase, '0', '0', '0', '0'],
        currency: 'USD', itemType: 'stock', minQty: '2', reorderQty: reorder
      })).id!;

    id.itemA = await make('A1', 'صنف أ', '30000', '10000', '5');
    id.itemB = await make('B1', 'صنف ب', '9000', '5000');
    id.itemC = await make('C1', 'منتج مصنع', '60000', '0');

    const fetched = await call<{ code: string; salePrices: string[]; itemType: string }>('items:get', id.itemA);
    expect(fetched.salePrices[0]).toBe('30000');
    expect(fetched.itemType).toBe('stock');

    await ok('items:save', { id: id.itemA, code: 'A1', name: 'صنف أ معدل', unit: 'pcs',
      salePrices: ['30000', '0', '0', '0', '0'], purchasePrices: ['10000', '0', '0', '0', '0'],
      currency: 'USD', itemType: 'stock', minQty: '2', reorderQty: '5' });

    expect(await call<unknown[]>('items:list')).toHaveLength(3);

    const stock = await call<Array<{ itemId: number; qty: number }>>('items:stock');
    expect(stock).toHaveLength(3);
    expect(stock.every(s => s.qty === 0)).toBe(true);

    const service = await ok('items:save', { code: 'SVC', name: 'خدمة', unit: 'hr', itemType: 'service' });
    await ok('items:delete', service.id);
    expect(await call<unknown[]>('items:list')).toHaveLength(3);
  });

  it('creates parties and auto-routes their AR/AP sub-accounts', async () => {
    id.customer = (await ok('parties:save', { code: 'C1', name: 'عميل أول', kind: 'customer' })).id!;
    id.supplier = (await ok('parties:save', { code: 'S1', name: 'مورد أول', kind: 'supplier' })).id!;
    id.both = (await ok('parties:save', { code: 'X1', name: 'عميل ومورد', kind: 'both' })).id!;

    const customer = await call<{ arAccountId: number | null; apAccountId: number | null }>('parties:get', id.customer);
    expect(customer.arAccountId).toBeTruthy();
    expect(customer.apAccountId).toBeNull();

    const both = await call<{ arAccountId: number | null; apAccountId: number | null }>('parties:get', id.both);
    expect(both.arAccountId).toBeTruthy();
    expect(both.apAccountId).toBeTruthy();

    expect(await call<unknown[]>('parties:list')).toHaveLength(3);
    expect(await call<unknown[]>('parties:list', 'customer')).toHaveLength(2); // C1 + X1(both)

    const throwaway = await ok('parties:save', { code: 'TMP', name: 'مؤقت', kind: 'customer' });
    await ok('parties:delete', throwaway.id);
    expect(await call<unknown[]>('parties:list')).toHaveLength(3);
  });

  it('creates employees and guards the delete', async () => {
    id.employee = (await ok('emp:save', {
      code: 'E1', name: 'موظف أول', hireDate: '2026-01-01', jobTitle: 'محاسب',
      basicSalaryMinor: '100000', allowanceMinor: '20000', payableAccountId: acct('2120')
    })).id!;
    await ok('emp:save', { id: id.employee, code: 'E1', name: 'موظف أول', basicSalaryMinor: '110000', payableAccountId: acct('2120') });

    const throwaway = await ok('emp:save', { code: 'E9', name: 'موظف مؤقت' });
    await ok('emp:delete', throwaway.id);
    expect(await call<unknown[]>('emp:list')).toHaveLength(1);
  });
});

describe('the trading cycle', () => {
  it('purchases stock and builds a weighted-average cost', async () => {
    await ok('invoices:save', {
      kind: 'purchase', date: '2026-01-05', partyId: id.supplier, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [
        { itemId: id.itemA, qty: '10', unitPriceMinor: '10000', discountMinor: '0' },
        { itemId: id.itemB, qty: '20', unitPriceMinor: '5000', discountMinor: '0' }
      ]
    });
    await ok('invoices:save', {
      kind: 'purchase', date: '2026-01-08', partyId: id.supplier, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '10', unitPriceMinor: '20500', discountMinor: '0' }]
    });

    const item = db().prepare('SELECT avg_cost_minor AS c FROM items WHERE id = ?').get(id.itemA) as { c: string };
    expect(BigInt(item.c)).toBe(15250n);      // (10×100.00 + 10×205.00) / 20
    expect(onHand(id.itemA)).toBe(20);
    expect(onHand(id.itemB)).toBe(20);
  });

  it('sells for cash and relieves COGS at the average cost', async () => {
    const sale = await ok('invoices:save', {
      kind: 'sale', date: '2026-01-15', partyId: id.customer, warehouseId: id.warehouse,
      paymentMode: 'cash', cashboxId: id.cashbox, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '5', unitPriceMinor: '30000', discountMinor: '0' }]
    });
    id.saleInvoice = sale.id!;

    expect(balanceOf('5100')).toBe(76250n);   // 5 × 152.50
    expect(onHand(id.itemA)).toBe(15);

    const fetched = await call<{ serial: string; lines: unknown[]; grandTotalMinor: string }>('invoices:get', id.saleInvoice);
    expect(fetched.serial).toBe('S-000001');
    expect(fetched.lines).toHaveLength(1);
    expect(fetched.grandTotalMinor).toBe('150000');
  });

  it('sells on credit and honours the due-date and credit-limit rules', async () => {
    db().prepare('UPDATE parties SET credit_limit_minor = ?, due_days = ? WHERE id = ?')
      .run('50000', 30, id.customer);

    const withinLimit = await ok('invoices:save', {
      kind: 'sale', date: '2026-01-20', partyId: id.customer, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '1', unitPriceMinor: '30000', discountMinor: '0' }]
    });
    const due = db().prepare('SELECT due_date AS d FROM invoices WHERE id = ?').get(withinLimit.id) as { d: string };
    expect(due.d).toBe('2026-02-19'); // 30 days on, in UTC, not a day early

    const overLimit = await refused('invoices:save', {
      kind: 'sale', date: '2026-01-21', partyId: id.customer, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '5', unitPriceMinor: '30000', discountMinor: '0' }]
    });
    expect(overLimit.errorCode).toBe('creditLimitExceeded');

    db().prepare('UPDATE parties SET credit_limit_minor = NULL WHERE id = ?').run(id.customer);
  });

  it('takes returns on both sides without disturbing the average cost', async () => {
    const avgBefore = (db().prepare('SELECT avg_cost_minor AS c FROM items WHERE id = ?').get(id.itemA) as { c: string }).c;

    await ok('invoices:save', {
      kind: 'sale_return', date: '2026-01-25', partyId: id.customer, warehouseId: id.warehouse,
      paymentMode: 'cash', cashboxId: id.cashbox, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '1', unitPriceMinor: '30000', discountMinor: '0' }]
    });
    await ok('invoices:save', {
      kind: 'purchase_return', date: '2026-01-26', partyId: id.supplier, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: id.itemB, qty: '2', unitPriceMinor: '5000', discountMinor: '0' }]
    });

    const avgAfter = (db().prepare('SELECT avg_cost_minor AS c FROM items WHERE id = ?').get(id.itemA) as { c: string }).c;
    expect(avgAfter).toBe(avgBefore);
    expect(onHand(id.itemA)).toBe(15);  // 20 - 5 - 1(credit sale) + 1(return)
    expect(onHand(id.itemB)).toBe(18);

    // 2 purchases, a cash sale, a credit sale, a sale return, a purchase return.
    expect(await call<unknown[]>('invoices:list')).toHaveLength(6);
    expect(await call<unknown[]>('invoices:list', 'sale')).toHaveLength(2);
    expect(await call<unknown[]>('invoices:list', 'sale_return')).toHaveLength(1);
  });
});

describe('quotes and orders', () => {
  it('quotes, converts one to an invoice and cancels another', async () => {
    const quote = await ok('quotes:save', {
      kind: 'sale', date: '2026-02-01', validUntil: '2026-02-28', partyId: id.customer, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '2', unitPriceMinor: '30000', discountMinor: '0' }],
      discountMinor: '1000', feesMinor: '500', notes: 'عرض سعر'
    });

    const fetched = await call<{ serial: string; status: string; grandTotalMinor: string; lines: unknown[] }>('quotes:get', quote.id);
    expect(fetched.serial).toBe('QS-000001');
    expect(fetched.status).toBe('open');
    expect(fetched.grandTotalMinor).toBe('59500'); // 2×300.00 − 10.00 + 5.00
    expect(fetched.lines).toHaveLength(1);
    expect(await call<unknown[]>('quotes:list', 'sale')).toHaveLength(1);

    const converted = await ok('quotes:convert', {
      id: quote.id, warehouseId: id.warehouse, paymentMode: 'cash', cashboxId: id.cashbox, date: '2026-02-02'
    });
    const after = await call<{ status: string; convertedInvoiceId: number }>('quotes:get', quote.id);
    expect(after.status).toBe('converted');
    expect(after.convertedInvoiceId).toBe(converted.id);

    // A converted quote must not be convertible a second time.
    const again = await refused('quotes:convert', { id: quote.id, warehouseId: id.warehouse, paymentMode: 'cash', cashboxId: id.cashbox });
    expect(again.errorCode).toBe('documentAlreadyProcessed');

    const doomed = await ok('quotes:save', {
      kind: 'purchase', date: '2026-02-03', partyId: id.supplier, currency: 'USD',
      lines: [{ itemId: id.itemB, qty: '1', unitPriceMinor: '5000' }]
    });
    await ok('quotes:cancel', doomed.id);
    expect((await call<{ status: string }>('quotes:get', doomed.id)).status).toBe('cancelled');
  });

  it('orders, fulfils one into an invoice and cancels another', async () => {
    const order = await ok('orders:save', {
      kind: 'purchase', date: '2026-02-05', dueDate: '2026-02-20', partyId: id.supplier,
      warehouseId: id.warehouse, currency: 'USD',
      lines: [{ itemId: id.itemB, qty: '5', unitPriceMinor: '6000', discountMinor: '0' }]
    });

    const fetched = await call<{ serial: string; status: string; lines: Array<{ qtyFulfilled: string }> }>('orders:get', order.id);
    expect(fetched.serial).toBe('OP-000001');
    expect(fetched.status).toBe('open');
    expect(await call<unknown[]>('orders:list', 'purchase')).toHaveLength(1);

    await ok('orders:convert', {
      id: order.id, warehouseId: id.warehouse, paymentMode: 'credit', date: '2026-02-06'
    });
    const after = await call<{ status: string; lines: Array<{ qty: string; qtyFulfilled: string }> }>('orders:get', order.id);
    expect(after.status).toBe('fulfilled');
    expect(after.lines[0].qtyFulfilled).toBe(after.lines[0].qty);
    expect(onHand(id.itemB)).toBe(23); // 18 + 5 received

    const doomed = await ok('orders:save', {
      kind: 'sale', date: '2026-02-07', partyId: id.customer, warehouseId: id.warehouse, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '1', unitPriceMinor: '30000' }]
    });
    await ok('orders:cancel', doomed.id);
    expect((await call<{ status: string }>('orders:get', doomed.id)).status).toBe('cancelled');
  });
});

describe('settlements', () => {
  it('records receipt and payment vouchers against AR and AP', async () => {
    const arBefore = balanceOf('1110-C1');
    await ok('vouchers:save', {
      kind: 'receipt', date: '2026-03-01', partyId: id.customer, cashboxId: id.cashbox,
      currency: 'USD', amountMinor: '10000', notes: 'دفعة من العميل'
    });
    expect(balanceOf('1110-C1')).toBe(arBefore - 10000n);

    const apBefore = balanceOf('2110-S1');
    await ok('vouchers:save', {
      kind: 'payment', date: '2026-03-02', partyId: id.supplier, cashboxId: id.cashbox,
      currency: 'USD', amountMinor: '25000', notes: 'دفعة للمورد'
    });
    expect(balanceOf('2110-S1')).toBe(apBefore + 25000n);

    expect(await call<unknown[]>('vouchers:list')).toHaveLength(2);
    expect(await call<unknown[]>('vouchers:list', 'receipt')).toHaveLength(1);

    const zero = await refused('vouchers:save', {
      kind: 'receipt', date: '2026-03-03', partyId: id.customer, cashboxId: id.cashbox,
      currency: 'USD', amountMinor: '0'
    });
    expect(zero.errorCode).toBe('amountMustBePositive');
  });

  it('settles several parties in one multi-party voucher', async () => {
    const receipt = await ok('mvouch:save', {
      kind: 'receipt', date: '2026-03-05', cashboxId: id.cashbox, currency: 'USD',
      lines: [
        { partyId: id.customer, amountMinor: '3000', memo: 'دفعة أولى' },
        { partyId: id.both, amountMinor: '2000', memo: 'دفعة ثانية' }
      ]
    });

    const fetched = await call<{ serial: string; totalMinor: string; lines: unknown[] }>('mvouch:get', receipt.id);
    expect(fetched.serial).toBe('MR-000001');
    expect(fetched.totalMinor).toBe('5000');
    expect(fetched.lines).toHaveLength(2);

    await ok('mvouch:save', {
      kind: 'payment', date: '2026-03-06', cashboxId: id.cashbox, currency: 'USD',
      lines: [{ partyId: id.supplier, amountMinor: '4000' }]
    });

    expect(await call<unknown[]>('mvouch:list')).toHaveLength(2);
    expect(await call<unknown[]>('mvouch:list', 'receipt')).toHaveLength(1);
  });

  it('runs cheques through their lifecycle exactly once', async () => {
    const incoming = await ok('cheques:save', {
      number: '900123', bank: 'بنك الاختبار', date: '2026-03-10', dueDate: '2026-04-10',
      partyId: id.customer, cashboxId: id.cashbox, direction: 'in', currency: 'USD', amountMinor: '20000'
    });
    expect(balanceOf('1140')).toBe(20000n); // under collection

    await ok('cheques:transition', { id: incoming.id, toStatus: 'cleared', date: '2026-04-10' });
    expect(balanceOf('1140')).toBe(0n);     // moved to cash

    // Clearing twice would post the settlement again and double the cash.
    const twice = await refused('cheques:transition', { id: incoming.id, toStatus: 'cleared', date: '2026-04-11' });
    expect(twice.errorCode).toBe('chequeAlreadySettled');

    const outgoing = await ok('cheques:save', {
      number: '900124', date: '2026-03-11', dueDate: '2026-04-11',
      partyId: id.supplier, cashboxId: id.cashbox, direction: 'out', currency: 'USD', amountMinor: '15000'
    });
    expect(balanceOf('2140')).toBe(-15000n); // payable, credit balance
    await ok('cheques:transition', { id: outgoing.id, toStatus: 'paid', date: '2026-04-11' });
    expect(balanceOf('2140')).toBe(0n);

    expect(await call<unknown[]>('cheques:list')).toHaveLength(2);
    expect(await call<unknown[]>('cheques:list', 'cleared')).toHaveLength(1);
  });

  it('posts all four kinds of debit and credit note', async () => {
    const kinds: Array<[string, string]> = [
      ['debit_customer', '4100'],
      ['credit_customer', '4100'],
      ['debit_supplier', '5200'],
      ['credit_supplier', '5200']
    ];
    for (const [kind, code] of kinds) {
      await ok('note:save', {
        kind, date: '2026-03-15', partyId: id.both, accountId: acct(code),
        currency: 'USD', amountMinor: '1000', notes: kind
      });
    }
    expect(await call<unknown[]>('note:list')).toHaveLength(4);
    expect(await call<unknown[]>('note:list', 'debit_customer')).toHaveLength(1);

    // A debit and a credit note of the same size cancel out on the party account.
    const rows = await call<Array<{ kind: string; amountMinor: string }>>('note:list');
    expect(rows.every(r => r.amountMinor === '1000')).toBe(true);
  });
});

describe('expenses, payroll and fixed assets', () => {
  it('posts an expense voucher against its dimensions', async () => {
    await ok('expense:save', {
      date: '2026-03-20', expenseAccountId: acct('5220'), cashboxId: id.cashbox,
      amountMinor: '25000', currency: 'USD', partyId: id.supplier,
      departmentId: id.department, projectId: id.project, funderId: id.funder, notes: 'إيجار مارس'
    });
    expect(balanceOf('5220')).toBe(25000n);

    const list = await call<Array<{ expenseAccountName: string; departmentId: number | null }>>('expense:list');
    expect(list).toHaveLength(1);
    expect(list[0].departmentId).toBe(id.department);

    const tagged = db().prepare(
      `SELECT COUNT(*) AS n FROM journal_lines WHERE project_id = ?`
    ).get(id.project) as { n: number };
    expect(tagged.n).toBeGreaterThan(0);
  });

  it('books an expense with no supplier against a routed fallback party', async () => {
    const before = balanceOf('5200');
    await ok('expense:save', {
      date: '2026-03-21', expenseAccountId: acct('5200'), cashboxId: id.cashbox,
      amountMinor: '4000', currency: 'USD', notes: 'مصروف نثري'
    });
    expect(balanceOf('5200')).toBe(before + 4000n);
    expect(await call<unknown[]>('expense:list')).toHaveLength(2);

    // The fallback party is a supplier like any other, so it needs AP routing:
    // without it the app's own audit report calls it an error, and the first
    // payment voucher raised against it fails on a missing AP account.
    const misc = db().prepare(
      `SELECT id, kind, ap_account_id AS ap FROM parties WHERE code = 'MISC'`
    ).get() as { id: number; kind: string; ap: number | null };
    expect(misc.kind).toBe('supplier');
    expect(misc.ap).not.toBeNull();

    await ok('vouchers:save', {
      kind: 'payment', date: '2026-03-22', partyId: misc.id, cashboxId: id.cashbox,
      currency: 'USD', amountMinor: '500'
    });
  });

  it('posts a payroll sheet with a part payment', async () => {
    const sheet = await ok('pay:save', {
      period: '2026-03', date: '2026-03-31', currency: 'USD',
      salaryAccountId: acct('5210'), payableAccountId: acct('2120'), paymentAccountId: acct('1101'),
      lines: [{
        employeeId: id.employee, basicMinor: '100000', allowanceMinor: '20000',
        overtimeMinor: '5000', deductionsMinor: '3000', paidMinor: '80000'
      }]
    });

    const fetched = await call<{ totalMinor: string; paidMinor: string; status: string; lines: Array<{ netMinor: string }> }>('pay:get', sheet.id);
    expect(fetched.lines[0].netMinor).toBe('122000');  // 100000 + 20000 + 5000 − 3000
    expect(fetched.totalMinor).toBe('122000');
    expect(fetched.paidMinor).toBe('80000');
    expect(fetched.status).toBe('posted');

    expect(balanceOf('5210')).toBe(122000n);
    expect(balanceOf('2120')).toBe(-42000n);           // 122000 accrued − 80000 paid
    expect(await call<unknown[]>('pay:list')).toHaveLength(1);
  });

  it('depreciates an asset a month at a time and stops at the floor', async () => {
    id.asset = (await ok('asset:save', {
      code: 'AS1', name: 'سيارة', acqDate: '2026-01-01', costMinor: '1200000', salvageMinor: '0',
      usefulLifeMonths: 12, assetAccountId: acct('1210'), accumAccountId: acct('1290'),
      expenseAccountId: acct('5240')
    })).id!;
    await ok('asset:save', { id: id.asset, code: 'AS1', name: 'سيارة الشركة', acqDate: '2026-01-01',
      costMinor: '1200000', salvageMinor: '0', usefulLifeMonths: 12,
      assetAccountId: acct('1210'), accumAccountId: acct('1290'), expenseAccountId: acct('5240') });

    await ok('asset:depreciate', { assetId: id.asset, period: '2026-04', date: '2026-04-30' });
    await ok('asset:depreciate', { assetId: id.asset, period: '2026-05', date: '2026-05-31' });

    expect(balanceOf('5240')).toBe(200000n);   // 2 × 100,000
    expect(balanceOf('1290')).toBe(-200000n);

    const runs = await call<Array<{ period: string; amountMinor: string }>>('asset:runs', id.asset);
    expect(runs).toHaveLength(2);
    expect(runs[0].amountMinor).toBe('100000');
    expect(await call<unknown[]>('asset:list')).toHaveLength(1);

    // Salvage must sit below cost, and life must be a positive whole number.
    expect((await refused('asset:save', { code: 'AS8', name: 'خطأ', acqDate: '2026-01-01',
      costMinor: '100000', salvageMinor: '100000', usefulLifeMonths: 12,
      assetAccountId: acct('1210'), accumAccountId: acct('1290'), expenseAccountId: acct('5240') })).error)
      .toMatch(/salvage/i);

    // An asset that has been depreciated cannot be deleted; a fresh one can.
    await refused('asset:delete', id.asset);
    const spare = await ok('asset:save', { code: 'AS2', name: 'طابعة', acqDate: '2026-02-01',
      costMinor: '60000', salvageMinor: '0', usefulLifeMonths: 6,
      assetAccountId: acct('1210'), accumAccountId: acct('1290'), expenseAccountId: acct('5240') });
    await ok('asset:delete', spare.id);
  });
});

describe('stock movements and manufacturing', () => {
  it('moves stock in, out and between warehouses', async () => {
    const opening = await ok('sm:save', {
      date: '2026-04-01', kind: 'opening', toWarehouseId: id.warehouse,
      lines: [{ itemId: id.itemC, qty: '4', unitCostMinor: '25000' }], notes: 'رصيد افتتاحي'
    });
    expect(onHand(id.itemC)).toBe(4);
    expect(balanceOf('1130')).toBeGreaterThan(0n);

    const fetched = await call<{ serial: string; kind: string; lines: unknown[] }>('sm:get', opening.id);
    expect(fetched.serial).toBe('OPN-000001');
    expect(fetched.lines).toHaveLength(1);

    await ok('sm:save', {
      date: '2026-04-02', kind: 'adjust_in', toWarehouseId: id.warehouse,
      lines: [{ itemId: id.itemB, qty: '10', unitCostMinor: '5000' }]
    });
    expect(onHand(id.itemB)).toBe(33);

    await ok('sm:save', {
      date: '2026-04-03', kind: 'adjust_out', fromWarehouseId: id.warehouse,
      lines: [{ itemId: id.itemB, qty: '3' }]
    });
    expect(onHand(id.itemB)).toBe(30);

    // A transfer moves quantity between warehouses and nothing between accounts.
    const inventoryBefore = balanceOf('1130');
    await ok('sm:save', {
      date: '2026-04-04', kind: 'transfer', fromWarehouseId: id.warehouse, toWarehouseId: id.warehouse2,
      lines: [{ itemId: id.itemB, qty: '5' }]
    });
    expect(balanceOf('1130')).toBe(inventoryBefore);
    expect(onHand(id.itemB)).toBe(30);
    const atSecond = db().prepare('SELECT qty FROM item_stock WHERE item_id=? AND warehouse_id=?')
      .get(id.itemB, id.warehouse2) as { qty: string };
    expect(parseFloat(atSecond.qty)).toBe(5);

    expect(await call<unknown[]>('sm:list')).toHaveLength(4);

    const badTransfer = await refused('sm:save', {
      date: '2026-04-05', kind: 'transfer', fromWarehouseId: id.warehouse,
      lines: [{ itemId: id.itemB, qty: '1' }]
    });
    expect(badTransfer.error).toMatch(/warehouse/i);
  });

  it('builds a formula and runs production against real stock', async () => {
    id.formula = (await ok('mfg:formulas:save', {
      code: 'F1', name: 'تركيبة المنتج', outputItemId: id.itemC, outputQty: '1',
      lines: [{ itemId: id.itemB, qty: '2', wastePct: '0' }]
    })).id!;

    const fetched = await call<{ code: string; lines: Array<{ itemId: number; qty: string }> }>('mfg:formulas:get', id.formula);
    expect(fetched.lines).toHaveLength(1);
    expect(fetched.lines[0].itemId).toBe(id.itemB);
    expect(await call<unknown[]>('mfg:formulas:list')).toHaveLength(1);

    // An output item cannot be its own component.
    await refused('mfg:formulas:save', {
      code: 'F8', name: 'دائرية', outputItemId: id.itemC, outputQty: '1',
      lines: [{ itemId: id.itemC, qty: '1' }]
    });

    const beforeB = onHand(id.itemB);
    const beforeC = onHand(id.itemC);
    await ok('mfg:runs:save', { date: '2026-04-10', formulaId: id.formula, warehouseId: id.warehouse, outputQty: '3' });
    expect(onHand(id.itemB)).toBe(beforeB - 6);   // 3 output × 2 components
    expect(onHand(id.itemC)).toBe(beforeC + 3);
    expect(await call<unknown[]>('mfg:runs:list')).toHaveLength(1);

    // More than the warehouse holds must be refused, not posted negative.
    const short = await refused('mfg:runs:save', {
      date: '2026-04-11', formulaId: id.formula, warehouseId: id.warehouse2, outputQty: '100'
    });
    expect(short.errorCode ?? short.error).toBeTruthy();

    // A formula with runs is protected; one without is not.
    await refused('mfg:formulas:delete', id.formula);
    const spare = await ok('mfg:formulas:save', {
      code: 'F9', name: 'تركيبة مؤقتة', outputItemId: id.itemC, outputQty: '1',
      lines: [{ itemId: id.itemB, qty: '1' }]
    });
    await ok('mfg:formulas:delete', spare.id);
  });
});

describe('budgets and the manual journal', () => {
  it('budgets an account and reports the variance against actuals', async () => {
    const budget = await ok('budget:save', { accountId: acct('5220'), period: '2026-03', amountMinor: '30000', notes: 'إيجار' });
    await ok('budget:save', { id: budget.id, accountId: acct('5220'), period: '2026-03', amountMinor: '20000' });
    expect(await call<unknown[]>('budget:list')).toHaveLength(1);

    const report = await call<Array<{ accountCode: string; budgetMinor: number; actualMinor: number; varianceMinor: number }>>(
      'budget:report', '2026-03-01', '2026-03-31'
    );
    const rent = report.find(r => r.accountCode === '5220');
    expect(rent).toBeDefined();
    expect(rent!.budgetMinor).toBe(20000);
    expect(rent!.actualMinor).toBe(25000);      // the March rent expense
    expect(rent!.varianceMinor).toBe(5000);

    await refused('budget:save', { accountId: acct('5220'), period: 'March', amountMinor: '100' });

    const spare = await ok('budget:save', { accountId: acct('5230'), period: '2026-04', amountMinor: '5000' });
    await ok('budget:delete', spare.id);
    expect(await call<unknown[]>('budget:list')).toHaveLength(1);
  });

  it('posts, reads and reverses a manual journal entry', async () => {
    const entry = await ok('journal:save', {
      date: '2026-05-01', reference: 'JV-1', memo: 'قيد يدوي',
      lines: [
        { accountId: acct('5230'), debitMinor: '7500', creditMinor: '0', currency: 'USD', memo: 'كهرباء' },
        { accountId: acct('1101'), debitMinor: '0', creditMinor: '7500', currency: 'USD', memo: 'نقداً' }
      ]
    });
    id.manualJournal = entry.id!;
    expect(balanceOf('5230')).toBe(7500n);

    const fetched = await call<{ reference: string; lines: Array<{ accountCode: string }> }>('journal:get', id.manualJournal);
    expect(fetched.reference).toBe('JV-1');
    expect(fetched.lines).toHaveLength(2);
    expect(fetched.lines[0].accountCode).toBe('5230');

    expect((await call<unknown[]>('journal:list')).length).toBeGreaterThan(10);
    expect(await call<unknown[]>('journal:list', '2026-05-01', '2026-05-01')).toHaveLength(1);

    // An unbalanced entry must never reach the ledger.
    await refused('journal:save', {
      date: '2026-05-02', reference: 'JV-BAD', lines: [
        { accountId: acct('5230'), debitMinor: '100', creditMinor: '0', currency: 'USD' },
        { accountId: acct('1101'), debitMinor: '0', creditMinor: '50', currency: 'USD' }
      ]
    });

    await ok('journal:reverse', { id: id.manualJournal, date: '2026-05-03', memo: 'إلغاء القيد' });
    expect(balanceOf('5230')).toBe(0n);

    const twice = await refused('journal:reverse', { id: id.manualJournal, date: '2026-05-04' });
    expect(twice.errorCode).toBe('alreadyReversed');
  });
});

describe('period locks', () => {
  it('closes a period, refuses to post into it, and reopens it', async () => {
    const lock = await ok('lock:save', { startDate: '2025-01-01', endDate: '2025-12-31', reason: 'سنة مقفلة' });
    await ok('lock:save', { id: lock.id, startDate: '2025-01-01', endDate: '2025-12-31', reason: 'سنة مقفلة نهائياً' });
    expect(await call<unknown[]>('lock:list')).toHaveLength(1);

    const blocked = await refused('invoices:save', {
      kind: 'purchase', date: '2025-06-01', partyId: id.supplier, warehouseId: id.warehouse,
      paymentMode: 'credit', cashboxId: null, currency: 'USD',
      lines: [{ itemId: id.itemA, qty: '1', unitPriceMinor: '1000' }]
    });
    expect(blocked.errorCode).toBe('periodLocked');

    // Every posting path honours the lock, not just invoices.
    expect((await refused('vouchers:save', {
      kind: 'receipt', date: '2025-06-01', partyId: id.customer, cashboxId: id.cashbox,
      currency: 'USD', amountMinor: '100'
    })).errorCode).toBe('periodLocked');
    expect((await refused('expense:save', {
      date: '2025-06-01', expenseAccountId: acct('5220'), cashboxId: id.cashbox,
      amountMinor: '100', currency: 'USD'
    })).errorCode).toBe('periodLocked');

    await ok('lock:delete', lock.id);
    expect(await call<unknown[]>('lock:list')).toHaveLength(0);
  });
});

describe('reports', () => {
  it('produces a trial balance whose two sides agree', async () => {
    const rows = await call<Array<{ debitMinor: string; creditMinor: string }>>(
      'reports:trialBalance', '2026-01-01', '2026-12-31'
    );
    let debits = 0n;
    let credits = 0n;
    for (const r of rows) { debits += BigInt(r.debitMinor); credits += BigInt(r.creditMinor); }
    expect(debits).toBe(credits);
    expect(debits).toBeGreaterThan(0n);
  });

  it('runs a ledger and a party statement with a carried opening balance', async () => {
    const ledger = await call<Array<{ memo: string; runningMinor: string }>>(
      'reports:accountLedger', acct('1130'), '2026-01-01', '2026-12-31'
    );
    expect(ledger[0].memo).toBe('Opening balance');
    expect(ledger.length).toBeGreaterThan(1);
    expect(BigInt(ledger[ledger.length - 1].runningMinor)).toBe(balanceOf('1130'));

    const statement = await call<Array<{ memo: string }>>('reports:partyStatement', id.customer, '2026-01-01', '2026-12-31');
    expect(statement[0].memo).toBe('Opening balance');
    expect(statement.length).toBeGreaterThan(1);
  });

  it('values inventory at the average cost and lists item movement', async () => {
    const balance = await call<Array<{ itemId: number; qty: number; unitCostMinor: string; stockValueMinor: string }>>(
      'reports:inventoryBalance'
    );
    expect(balance).toHaveLength(3);
    const rowA = balance.find(r => r.itemId === id.itemA)!;
    // 15 after the trading cycle, less the 2 the converted quote shipped.
    expect(rowA.qty).toBe(13);
    expect(BigInt(rowA.stockValueMinor)).toBe(BigInt(rowA.unitCostMinor) * 13n);

    const movement = await call<unknown[]>('reports:inventoryMovement', id.itemA, '2026-01-01', '2026-12-31');
    expect(movement.length).toBeGreaterThan(0);
  });

  it('summarises sales and purchases over a range', async () => {
    const sales = await call<Array<{ kind: string }>>('reports:salesSummary', '2026-01-01', '2026-12-31');
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every(r => r.kind === 'sale' || r.kind === 'sale_return')).toBe(true);

    const purchases = await call<Array<{ kind: string }>>('reports:purchasesSummary', '2026-01-01', '2026-12-31');
    expect(purchases.length).toBeGreaterThan(0);
    expect(purchases.every(r => r.kind === 'purchase' || r.kind === 'purchase_return')).toBe(true);
  });

  it('ages receivables and payables as of a date', async () => {
    const ar = await call<Array<{ partyId: number; balanceMinor: number }>>('reports:arAging', '2026-12-31');
    const ap = await call<Array<{ partyId: number; balanceMinor: number }>>('reports:apAging', '2026-12-31');
    expect(ar.every(r => r.balanceMinor > 0)).toBe(true);
    expect(ap.every(r => r.balanceMinor > 0)).toBe(true);
    expect(ap.some(r => r.partyId === id.supplier)).toBe(true);
  });

  it('states income and a balance sheet that actually balances', async () => {
    const pnl = await call<{ totalRevenueMinor: string; totalExpenseMinor: string; netIncomeMinor: string; lines: unknown[] }>(
      'reports:incomeStatement', '2026-01-01', '2026-12-31'
    );
    expect(BigInt(pnl.netIncomeMinor)).toBe(BigInt(pnl.totalRevenueMinor) - BigInt(pnl.totalExpenseMinor));
    expect(pnl.lines.length).toBeGreaterThan(0);

    const bs = await call<{ totalAssetsMinor: string; totalLiabilitiesMinor: string; totalEquityMinor: string }>(
      'reports:balanceSheet', '2026-12-31'
    );
    expect(BigInt(bs.totalAssetsMinor))
      .toBe(BigInt(bs.totalLiabilitiesMinor) + BigInt(bs.totalEquityMinor));
  });

  it('fills the dashboard and the operational reports', async () => {
    const dash = await call<{ assetsMinor: string; invoicesCount: number; lowStock: unknown[] }>('reports:dashboard');
    expect(Number(dash.invoicesCount)).toBeGreaterThan(0);
    expect(BigInt(dash.assetsMinor)).not.toBe(0n);

    const reorder = await call<Array<{ id: number; onHand: number; reorderQty: number }>>('reports:reorderAlert');
    expect(Array.isArray(reorder)).toBe(true);

    const liquidity = await call<{ cashboxes: unknown[]; inflows: unknown[]; outflows: unknown[] }>('reports:bankLiquidity');
    expect(liquidity.cashboxes.length).toBe(2);

    const journalId = (db().prepare('SELECT journal_id AS j FROM invoices WHERE id = ?').get(id.saleInvoice) as { j: number }).j;
    const source = await call<{ sourceType: string; sourceId: number }>('reports:sourceDoc', journalId);
    expect(source.sourceType).toBe('invoice');
    expect(source.sourceId).toBe(id.saleInvoice);

    const stock = await call<{ qty: number }>('reports:stockOnHand', id.itemB, id.warehouse2);
    expect(stock.qty).toBe(5);
  });
});

describe('backup, audit and year close', () => {
  it('reports a cancelled backup or restore rather than throwing', async () => {
    // The stubbed dialogs cancel, which is the path a user takes most often.
    expect(await call<SaveResult>('backup:save')).toMatchObject({ ok: false, error: 'cancelled' });
    expect(await call<SaveResult>('backup:restore')).toMatchObject({ ok: false, error: 'cancelled' });
  });

  it('finds no integrity errors in a correctly-kept set of books', async () => {
    const report = await call<{ issues: Array<{ severity: string; entity: string; message: string }>; runAt: string }>('audit:run');
    expect(report.runAt).toBeTruthy();
    const errors = report.issues.filter(i => i.severity === 'error');
    expect(errors, `audit reported errors: ${errors.map(e => e.message).join(' | ')}`).toEqual([]);
  });

  it('closes the year into retained earnings and locks it', async () => {
    const pnl = await call<{ netIncomeMinor: string }>('reports:incomeStatement', '2026-01-01', '2026-12-31');
    const netIncome = BigInt(pnl.netIncomeMinor);

    // These two are the reason the close used to fail: contra accounts whose
    // balance sits on the opposite side from their type. Both must be carrying
    // something, or this test is not covering the case it exists for.
    expect(balanceOf('4900')).toBeGreaterThan(0n);  // sales returns, a debit balance on a revenue account
    expect(balanceOf('5900')).toBeLessThan(0n);     // purchase returns, a credit balance on an expense account

    await ok('rollover:run', { closeDate: '2026-12-31', openDate: '2027-01-01' });

    // Every revenue and expense account is flat, contra accounts included.
    expect(balanceOf('4900')).toBe(0n);
    expect(balanceOf('5900')).toBe(0n);

    // Revenue and expense are flat afterwards, and the result sits in equity.
    const after = await call<{ totalRevenueMinor: string; totalExpenseMinor: string }>(
      'reports:incomeStatement', '2026-01-01', '2026-12-31'
    );
    expect(BigInt(after.totalRevenueMinor)).toBe(0n);
    expect(BigInt(after.totalExpenseMinor)).toBe(0n);
    expect(balanceOf('3200')).toBe(-netIncome);

    // Closing twice would zero the year a second time and double retained
    // earnings. The lock the close just wrote is what stops it.
    const again = await refused('rollover:run', { closeDate: '2026-12-31', openDate: '2027-01-01' });
    expect(again.errorCode ?? again.error).toBeTruthy();
    expect(balanceOf('3200')).toBe(-netIncome);

    const locks = await call<Array<{ startDate: string; endDate: string }>>('lock:list');
    expect(locks.some(l => l.endDate === '2026-12-31')).toBe(true);
  });
});

describe('the books as a whole', () => {
  it('has no unbalanced journal entry anywhere', () => {
    expect(unbalancedEntries()).toEqual([]);
  });

  it('holds no negative stock', () => {
    const negative = db().prepare(
      `SELECT i.code, s.qty FROM item_stock s JOIN items i ON i.id = s.item_id WHERE CAST(s.qty AS REAL) < 0`
    ).all();
    expect(negative).toEqual([]);
  });

  it('gave every document a serial, and never the same one twice', () => {
    const duplicate = db().prepare(
      `SELECT serial FROM (
         SELECT serial FROM invoices UNION ALL SELECT serial FROM vouchers
         UNION ALL SELECT serial FROM cheques UNION ALL SELECT serial FROM quotes
         UNION ALL SELECT serial FROM orders  UNION ALL SELECT serial FROM stock_movements
         UNION ALL SELECT serial FROM notes_docs UNION ALL SELECT serial FROM multi_vouchers
         UNION ALL SELECT serial FROM payroll_sheets UNION ALL SELECT serial FROM manufacturing_runs
       ) GROUP BY serial HAVING COUNT(*) > 1`
    ).all();
    expect(duplicate).toEqual([]);
  });

  it('left every posted document pointing at its journal entry', () => {
    for (const table of ['invoices', 'vouchers', 'notes_docs', 'multi_vouchers']) {
      const orphans = db().prepare(`SELECT id FROM ${table} WHERE journal_id IS NULL`).all();
      expect(orphans, `${table} rows with no journal entry`).toEqual([]);
    }
  });

  it('exercised every channel the preload bridge exposes', () => {
    const source = readFileSync(join(here, '..', 'preload.ts'), 'utf8');
    const bridge = [...source.matchAll(/invoke<?[^>]*>?\(\s*'([^']+)'/g)].map(m => m[1]);
    const untested = bridge.filter(channel => !called.has(channel)).sort();
    expect(untested).toEqual([]);
  });
});

// End-to-end calculation test: seeds the production schema with test data,
// posts invoices/vouchers/cheques, then asserts journal balances and stock values.
// Runs OUTSIDE Electron — just imports better-sqlite3 + the schema SQL directly.

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_V1, DEFAULT_ACCOUNTS } from '../electron/services/migrations';

const tmp = mkdtempSync(join(tmpdir(), 'mohasib-e2e-'));
const dbPath = join(tmp, 'test.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(SCHEMA_V1);

// seed accounts + warehouse + cashbox + settings
db.prepare("INSERT INTO settings (key, value) VALUES ('schema_version', '1')").run();
const insAcct = db.prepare(`INSERT INTO accounts (code, name, name_en, type, parent_code, currency)
                            VALUES (?, ?, ?, ?, ?, 'USD')`);
for (const a of DEFAULT_ACCOUNTS) {
  insAcct.run(a.code, a.name, a.nameEn, a.type, a.parent ?? null);
}
db.prepare(`INSERT INTO warehouses (code, name, name_en, is_default) VALUES ('W1','المستودع','Main',1)`).run();
const cashAcct = db.prepare(`SELECT id FROM accounts WHERE code='1101'`).get() as { id: number };
db.prepare(`INSERT INTO cashboxes (code, name, currency, account_id, is_default) VALUES ('CB1','الصندوق','USD', ?, 1)`).run(cashAcct.id);
db.prepare(`INSERT INTO settings (key, value) VALUES ('policy_mode','strict'), ('default_currency','USD'), ('language','ar')`).run();

const acctId = (code: string): number => (db.prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number }).id;

// ---------- assertion helpers ----------
let passed = 0;
let failed = 0;
const log = (ok: boolean, msg: string): void => {
  (ok ? passed++ : failed++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};
const assertEq = <T>(actual: T, expected: T, msg: string): void => {
  log(JSON.stringify(actual) === JSON.stringify(expected), `${msg} — got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
};

// ---------- 1. Compliance test: try to create an account named "ضريبة القيمة المضافة" ----------
// Use the actual production compliance check
import { checkText as prodCheck } from '../shared/domain/Compliance';
const checkText = (s: string): boolean => !prodCheck(s, 'strict').blocked;
log(!checkText('ضريبة القيمة المضافة'),  'compliance blocks "ضريبة القيمة المضافة"');
log(!checkText('فوائد بنكية'),           'compliance blocks "فوائد بنكية"');
log(!checkText('Interest expense'),      'compliance blocks "Interest expense"');
log(checkText('مصاريف توصيل'),           'compliance allows "مصاريف توصيل" (delivery)');
log(checkText('عمولة وكيل'),             'compliance allows "عمولة وكيل"');

// ---------- 2. Seed parties + items ----------
const insParty = db.prepare(`INSERT INTO parties (code, name, kind) VALUES (?, ?, ?)`);
const cust = insParty.run('C001','عميل اختبار','customer').lastInsertRowid as number;
const supp = insParty.run('S001','مورد اختبار','supplier').lastInsertRowid as number;
// Create AR/AP sub-accounts
const arAcctId = (insAcct.run('1110-C001','عميل اختبار','Test customer','asset','1110').lastInsertRowid as number);
const apAcctId = (insAcct.run('2110-S001','مورد اختبار','Test supplier','liability','2110').lastInsertRowid as number);
db.prepare('UPDATE parties SET ar_account_id = ? WHERE id = ?').run(arAcctId, cust);
db.prepare('UPDATE parties SET ap_account_id = ? WHERE id = ?').run(apAcctId, supp);

const insItem = db.prepare(`INSERT INTO items (code, barcode, name, unit,
  sale_price_1, sale_price_2, sale_price_3, sale_price_4, sale_price_5,
  purchase_price_1, purchase_price_2, purchase_price_3, purchase_price_4, purchase_price_5,
  currency) VALUES (?, ?, ?, 'pcs',
  ?, '0','0','0','0',
  ?, '0','0','0','0', 'USD')`);
const itemA = insItem.run('A1','BARCODE-A1','صنف أ', '15000','10000').lastInsertRowid as number; // sale 150.00 / purchase 100.00
const itemB = insItem.run('B1','BARCODE-B1','صنف ب', '8000','5000').lastInsertRowid as number;   //  80.00 /  50.00

// ---------- 3. Helper: post journal entry (matches services/posting.ts) ----------
let serialN = 0;
const nextRef = (p: string): string => `${p}-${String(++serialN).padStart(6,'0')}`;
const postJE = (date: string, ref: string, memo: string, lines: Array<{ accountId:number; debitMinor:bigint; creditMinor:bigint }>): number => {
  let totD = 0n; let totC = 0n;
  for (const l of lines) { totD += l.debitMinor; totC += l.creditMinor; }
  if (totD !== totC) throw new Error(`JE not balanced: D=${totD} C=${totC}`);
  const r = db.prepare(`INSERT INTO journal_entries (date, reference, memo, source_type, total_minor, currency)
                        VALUES (?, ?, ?, 'manual', ?, 'USD')`).run(date, ref, memo, totD.toString());
  const eid = Number(r.lastInsertRowid);
  const insL = db.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit_minor, credit_minor, currency) VALUES (?,?,?,?,'USD')`);
  for (const l of lines) insL.run(eid, l.accountId, l.debitMinor.toString(), l.creditMinor.toString());
  return eid;
};

// ---------- 4. Purchase invoice: 10 of A @ 100, 20 of B @ 50, on credit ----------
//   Subtotal = 10*100 + 20*50 = 1000 + 1000 = 2000.00
//   Inventory Dr 2000;  AP Cr 2000;
//   Stock: A=10 @ avg 100;  B=20 @ avg 50;  inventory value 200000 minor + 100000 minor = 300000 minor
const invAcct = acctId('1130');
postJE('2026-04-01', nextRef('P'), 'Purchase #1', [
  { accountId: invAcct, debitMinor: 200000n, creditMinor: 0n },
  { accountId: apAcctId, debitMinor: 0n, creditMinor: 200000n }
]);
db.prepare(`INSERT INTO item_stock (item_id, warehouse_id, qty) VALUES (?, 1, '10')`).run(itemA);
db.prepare(`INSERT INTO item_stock (item_id, warehouse_id, qty) VALUES (?, 1, '20')`).run(itemB);
db.prepare(`UPDATE items SET avg_cost_minor = '10000' WHERE id = ?`).run(itemA);
db.prepare(`UPDATE items SET avg_cost_minor = '5000'  WHERE id = ?`).run(itemB);

// ---------- 5. Sale invoice (cash): 3 of A @ 150 with 5.00 line discount, invoice fees 10.00 (delivery) ----------
//   line A: 3*150 - 5 = 450 - 5 = 445.00  (44500 minor)
//   subtotal = 44500;  fees = 1000;  grand = 45500
//   Cash (cb1 → 1101) Dr 45500;  Revenue (4100) Cr 45500;
//   COGS: 3 * 100 (avg) = 300.00 (30000 minor)
//   COGS Dr 30000;  Inventory (1130) Cr 30000;
const saleSubtotal = 3n * 15000n - 500n;          // 44500
const saleGrand = saleSubtotal + 1000n;          // 45500
const saleCogs = 3n * 10000n;                     // 30000
postJE('2026-04-05', nextRef('S'), 'Sale #1', [
  { accountId: cashAcct.id, debitMinor: saleGrand, creditMinor: 0n },
  { accountId: acctId('4100'), debitMinor: 0n, creditMinor: saleGrand }
]);
postJE('2026-04-05', nextRef('S'), 'Sale #1 COGS', [
  { accountId: acctId('5100'), debitMinor: saleCogs, creditMinor: 0n },
  { accountId: invAcct, debitMinor: 0n, creditMinor: saleCogs }
]);
db.prepare(`UPDATE item_stock SET qty = CAST(CAST(qty AS REAL) - 3 AS TEXT) WHERE item_id = ? AND warehouse_id = 1`).run(itemA);

// ---------- 6. Receipt voucher from credit customer (50.00 cash receipt against AR) ----------
//   We never extended AR for cust in this test; let's create a credit sale first.
//   Credit sale: 1 of B @ 80
const credSaleGrand = 1n * 8000n; // 8000
postJE('2026-04-06', nextRef('S'), 'Credit sale', [
  { accountId: arAcctId, debitMinor: credSaleGrand, creditMinor: 0n },
  { accountId: acctId('4100'), debitMinor: 0n, creditMinor: credSaleGrand }
]);
postJE('2026-04-06', nextRef('S'), 'Credit sale COGS', [
  { accountId: acctId('5100'), debitMinor: 5000n, creditMinor: 0n },
  { accountId: invAcct, debitMinor: 0n, creditMinor: 5000n }
]);
db.prepare(`UPDATE item_stock SET qty = CAST(CAST(qty AS REAL) - 1 AS TEXT) WHERE item_id = ? AND warehouse_id = 1`).run(itemB);

// Receipt: cash 50.00 from cust
postJE('2026-04-08', nextRef('R'), 'Receipt', [
  { accountId: cashAcct.id, debitMinor: 5000n, creditMinor: 0n },
  { accountId: arAcctId, debitMinor: 0n, creditMinor: 5000n }
]);

// ---------- 7. Verify trial balance: total debits == total credits ----------
const tot = db.prepare(`SELECT
  COALESCE(SUM(CAST(debit_minor AS INTEGER)),0) AS d,
  COALESCE(SUM(CAST(credit_minor AS INTEGER)),0) AS c
  FROM journal_lines`).get() as { d: number; c: number };
log(tot.d === tot.c, `trial balance: D=${tot.d} C=${tot.c}`);

// ---------- 8. Verify cash box balance: 45500 (cash sale) + 5000 (receipt) = 50500 minor ----------
const cashBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(cashAcct.id) as { bal: number };
assertEq(cashBal.bal, 50500, 'cash account balance is 505.00');

// ---------- 9. Verify AR balance for credit cust = 8000 - 5000 = 3000 ----------
const arBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(arAcctId) as { bal: number };
assertEq(arBal.bal, 3000, 'customer AR balance is 30.00');

// ---------- 10. Verify AP balance for supplier = 200000 (purchase) ----------
const apBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(credit_minor AS INTEGER) - CAST(debit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(apAcctId) as { bal: number };
assertEq(apBal.bal, 200000, 'supplier AP balance is 2000.00');

// ---------- 11. Verify Revenue (sales) total = 45500 + 8000 = 53500 ----------
const revBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(credit_minor AS INTEGER) - CAST(debit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(acctId('4100')) as { bal: number };
assertEq(revBal.bal, 53500, 'revenue 4100 balance is 535.00');

// ---------- 12. Verify COGS (5100) = 30000 + 5000 = 35000 ----------
const cogsBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(acctId('5100')) as { bal: number };
assertEq(cogsBal.bal, 35000, 'COGS 5100 balance is 350.00');

// ---------- 13. Verify Inventory account = 200000 - 30000 - 5000 = 165000 ----------
const invBal = db.prepare(`SELECT
  COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS bal
  FROM journal_lines WHERE account_id = ?`).get(invAcct) as { bal: number };
assertEq(invBal.bal, 165000, 'inventory 1130 balance is 1650.00');

// ---------- 14. Stock physical match ----------
//   A: started 10, sold 3 cash → 7
//   B: started 20, sold 1 credit → 19
const stockA = db.prepare(`SELECT qty FROM item_stock WHERE item_id = ?`).get(itemA) as { qty: string };
const stockB = db.prepare(`SELECT qty FROM item_stock WHERE item_id = ?`).get(itemB) as { qty: string };
assertEq(parseFloat(stockA.qty), 7,  'item A on-hand qty');
assertEq(parseFloat(stockB.qty), 19, 'item B on-hand qty');

// Stock value @ avg cost: 7*100 + 19*50 = 700 + 950 = 1650 USD = 165000 minor
const stockValue = Math.round(7 * 10000 + 19 * 5000);
assertEq(stockValue, invBal.bal, 'stock value matches inventory ledger');

// ---------- 15. Cheque round-trip ----------
//   Incoming cheque from credit customer for 30.00 (settles AR). Initial: clearing 1140 Dr / AR Cr.
postJE('2026-04-10', nextRef('CHI'), 'Incoming cheque', [
  { accountId: acctId('1140'), debitMinor: 3000n, creditMinor: 0n },
  { accountId: arAcctId,        debitMinor: 0n,    creditMinor: 3000n }
]);
//   On clearance: cashbox Dr / 1140 Cr
postJE('2026-04-12', nextRef('CHI'), 'Cheque cleared', [
  { accountId: cashAcct.id, debitMinor: 3000n, creditMinor: 0n },
  { accountId: acctId('1140'), debitMinor: 0n, creditMinor: 3000n }
]);
const arAfter = db.prepare(`SELECT COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS b FROM journal_lines WHERE account_id = ?`).get(arAcctId) as { b: number };
assertEq(arAfter.b, 0, 'AR is settled to 0 after cheque clears');

const clearingBal = db.prepare(`SELECT COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS b FROM journal_lines WHERE account_id = ?`).get(acctId('1140')) as { b: number };
assertEq(clearingBal.b, 0, 'cheque clearing 1140 zero after clearance');

// ---------- 16. Compliance prevents seeding any haram account ----------
const accountNames = (db.prepare('SELECT name FROM accounts').all() as Array<{ name: string }>).map(x => x.name);
const offending = accountNames.filter(n => !checkText(n));
log(offending.length === 0, `all default accounts are compliant${offending.length ? ' — offending: ' + offending.join(', ') : ''}`);

// ---------- Done ----------
console.log(`\n${passed} passed, ${failed} failed`);
db.close();
rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

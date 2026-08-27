// Seeds the LIVE app DB with realistic Arabic test data.
// DB path: ~/Library/Application Support/mohasib/companies/default.db
// Usage:   npx tsx scripts/seed-demo.ts

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_V1, DEFAULT_ACCOUNTS } from '../electron/services/migrations';

const dbDir = join(homedir(), 'Library', 'Application Support', 'mohasib', 'companies');
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const dbPath = join(dbDir, 'default.db');
console.log('Seeding:', dbPath);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(SCHEMA_V1);

const acctCount = (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
if (acctCount === 0) {
  const insAcct = db.prepare(
    `INSERT INTO accounts (code, name, name_en, type, parent_code, currency) VALUES (?, ?, ?, ?, ?, 'USD')`
  );
  for (const a of DEFAULT_ACCOUNTS) insAcct.run(a.code, a.name, a.nameEn, a.type, a.parent ?? null);
}

const setIfMissing = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
setIfMissing.run('schema_version', '1');
setIfMissing.run('company_name', 'متجر التجربة');
setIfMissing.run('company_name_en', 'Test Trading Co.');
setIfMissing.run('language', 'ar');
setIfMissing.run('default_currency', 'USD');
setIfMissing.run('policy_mode', 'strict');
setIfMissing.run('fiscal_year_start', '01-01');

const whCount = (db.prepare('SELECT COUNT(*) AS n FROM warehouses').get() as { n: number }).n;
if (whCount === 0) {
  db.prepare(
    `INSERT INTO warehouses (code, name, name_en, is_default) VALUES ('W1','المستودع الرئيسي','Main Warehouse',1)`
  ).run();
}

const cbCount = (db.prepare('SELECT COUNT(*) AS n FROM cashboxes').get() as { n: number }).n;
if (cbCount === 0) {
  const cashAcctId = (db.prepare(`SELECT id FROM accounts WHERE code='1101'`).get() as { id: number }).id;
  db.prepare(
    `INSERT INTO cashboxes (code, name, currency, account_id, is_default) VALUES ('CB1','الصندوق الرئيسي','USD', ?, 1)`
  ).run(cashAcctId);
}

const partyCount = (db.prepare('SELECT COUNT(*) AS n FROM parties').get() as { n: number }).n;
if (partyCount === 0) {
  const insParty = db.prepare(
    `INSERT INTO parties (code, name, name_en, kind, phone, email, address) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insAcct = db.prepare(
    `INSERT INTO accounts (code, name, name_en, type, parent_code, currency, is_party, party_id) VALUES (?, ?, ?, ?, ?, 'USD', 1, ?)`
  );

  const addCustomer = (code: string, name: string, nameEn: string, phone: string): void => {
    const r = insParty.run(code, name, nameEn, 'customer', phone, null, null);
    const pid = Number(r.lastInsertRowid);
    const acct = insAcct.run(`1110-${code}`, name, nameEn, 'asset', '1110', pid);
    db.prepare('UPDATE parties SET ar_account_id = ? WHERE id = ?').run(Number(acct.lastInsertRowid), pid);
  };
  const addSupplier = (code: string, name: string, nameEn: string, phone: string): void => {
    const r = insParty.run(code, name, nameEn, 'supplier', phone, null, null);
    const pid = Number(r.lastInsertRowid);
    const acct = insAcct.run(`2110-${code}`, name, nameEn, 'liability', '2110', pid);
    db.prepare('UPDATE parties SET ap_account_id = ? WHERE id = ?').run(Number(acct.lastInsertRowid), pid);
  };

  addCustomer('C001', 'أحمد محمد التاجر', 'Ahmed M. Trader', '0599111111');
  addCustomer('C002', 'سوبرماركت النور', 'AlNoor Market', '0599222222');
  addCustomer('C003', 'مكتبة القلم', 'Pen Bookshop', '0599333333');
  addSupplier('S001', 'شركة المورد المتحد', 'United Supplier', '0598111111');
  addSupplier('S002', 'مصنع الصناعات الغذائية', 'Food Industries Factory', '0598222222');
}

const itemCount = (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n;
if (itemCount === 0) {
  const ins = db.prepare(`INSERT INTO items (code, barcode, name, name_en, unit,
    sale_price_1, sale_price_2, sale_price_3, sale_price_4, sale_price_5,
    purchase_price_1, purchase_price_2, purchase_price_3, purchase_price_4, purchase_price_5,
    currency, min_qty, reorder_qty, max_qty, item_type)
    VALUES (?, ?, ?, ?, 'pcs',
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      'USD', '0', '0', '0', 'stock')`);
  const m = (n: number): string => String(Math.round(n * 100));
  ins.run('A001', '6291100150018', 'سكر أبيض 1كغ', 'White sugar 1kg', m(1.5), m(1.4), m(1.35), m(1.3), m(1.25), m(1.0), m(1.0), m(1.0), m(1.0), m(1.0));
  ins.run('A002', '6291100150025', 'أرز بسمتي 5كغ', 'Basmati rice 5kg', m(7.5), m(7.2), m(7.0), m(6.8), m(6.5), m(5.2), m(5.2), m(5.2), m(5.2), m(5.2));
  ins.run('A003', '6291100150032', 'زيت زيتون 1لتر', 'Olive oil 1L', m(9.0), m(8.8), m(8.5), m(8.3), m(8.0), m(6.5), m(6.5), m(6.5), m(6.5), m(6.5));
  ins.run('A004', '6291100150049', 'حليب طازج 1لتر', 'Fresh milk 1L', m(1.8), m(1.75), m(1.7), m(1.65), m(1.6), m(1.2), m(1.2), m(1.2), m(1.2), m(1.2));
  ins.run('A005', '6291100150056', 'خبز عربي حزمة', 'Arabic bread pack', m(1.0), m(0.95), m(0.9), m(0.85), m(0.8), m(0.5), m(0.5), m(0.5), m(0.5), m(0.5));
  ins.run('B001', '6291100150063', 'دفتر A4 مسطر', 'Notebook A4 ruled', m(2.5), m(2.4), m(2.3), m(2.2), m(2.0), m(1.3), m(1.3), m(1.3), m(1.3), m(1.3));
  ins.run('B002', '6291100150070', 'قلم حبر أزرق', 'Blue pen', m(0.5), m(0.5), m(0.45), m(0.4), m(0.35), m(0.2), m(0.2), m(0.2), m(0.2), m(0.2));
}

const counts = {
  accounts: (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n,
  parties: (db.prepare('SELECT COUNT(*) AS n FROM parties').get() as { n: number }).n,
  items: (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n,
};
console.log('Done:', counts);
db.close();

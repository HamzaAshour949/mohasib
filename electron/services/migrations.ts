import type Database from 'better-sqlite3';

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),
  parent_code TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_party INTEGER NOT NULL DEFAULT 0,
  party_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_code);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);

CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('customer','supplier','both','employee')),
  phone TEXT,
  email TEXT,
  address TEXT,
  ar_account_id INTEGER REFERENCES accounts(id),
  ap_account_id INTEGER REFERENCES accounts(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  name_en TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  -- 5 sale + 5 purchase prices, all bigint minor units stored as TEXT for safety
  sale_price_1 TEXT NOT NULL DEFAULT '0',
  sale_price_2 TEXT NOT NULL DEFAULT '0',
  sale_price_3 TEXT NOT NULL DEFAULT '0',
  sale_price_4 TEXT NOT NULL DEFAULT '0',
  sale_price_5 TEXT NOT NULL DEFAULT '0',
  purchase_price_1 TEXT NOT NULL DEFAULT '0',
  purchase_price_2 TEXT NOT NULL DEFAULT '0',
  purchase_price_3 TEXT NOT NULL DEFAULT '0',
  purchase_price_4 TEXT NOT NULL DEFAULT '0',
  purchase_price_5 TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'USD',
  -- weighted-average cost (minor units as TEXT)
  avg_cost_minor TEXT NOT NULL DEFAULT '0',
  min_qty TEXT NOT NULL DEFAULT '0',
  reorder_qty TEXT NOT NULL DEFAULT '0',
  max_qty TEXT NOT NULL DEFAULT '0',
  item_type TEXT NOT NULL DEFAULT 'stock' CHECK(item_type IN ('stock','service','non_stock')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);

CREATE TABLE IF NOT EXISTS item_stock (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  qty TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS cashboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  reference TEXT,
  memo TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id INTEGER,
  total_minor TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit_minor TEXT NOT NULL DEFAULT '0',
  credit_minor TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'USD',
  memo TEXT
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','sale_return','purchase_return')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  payment_mode TEXT NOT NULL CHECK(payment_mode IN ('cash','credit')),
  cashbox_id INTEGER REFERENCES cashboxes(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_minor TEXT NOT NULL DEFAULT '0',
  inv_discount_minor TEXT NOT NULL DEFAULT '0',
  fees_minor TEXT NOT NULL DEFAULT '0',
  grand_total_minor TEXT NOT NULL DEFAULT '0',
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_inv_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_inv_party ON invoices(party_id);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty TEXT NOT NULL,
  unit_price_minor TEXT NOT NULL,
  discount_minor TEXT NOT NULL DEFAULT '0',
  total_minor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('receipt','payment')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  cashbox_id INTEGER NOT NULL REFERENCES cashboxes(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_minor TEXT NOT NULL,
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id)
);

CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  number TEXT NOT NULL,
  bank TEXT,
  date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  cashbox_id INTEGER REFERENCES cashboxes(id),
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  status TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_minor TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS serials (
  prefix TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL DEFAULT 1
);
`;

export const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; nameEn: string; type: string; parent: string | null }> = [
  { code: '1', name: 'الأصول', nameEn: 'Assets', type: 'asset', parent: null },
  { code: '11', name: 'الأصول المتداولة', nameEn: 'Current Assets', type: 'asset', parent: '1' },
  { code: '1101', name: 'الصندوق', nameEn: 'Cash on Hand', type: 'asset', parent: '11' },
  { code: '1102', name: 'البنك', nameEn: 'Bank', type: 'asset', parent: '11' },
  { code: '1110', name: 'العملاء (مدينون)', nameEn: 'Accounts Receivable', type: 'asset', parent: '11' },
  { code: '1130', name: 'المخزون', nameEn: 'Inventory', type: 'asset', parent: '11' },
  { code: '1140', name: 'شيكات تحت التحصيل', nameEn: 'Cheques Under Collection', type: 'asset', parent: '11' },
  { code: '12', name: 'الأصول الثابتة', nameEn: 'Fixed Assets', type: 'asset', parent: '1' },
  { code: '2', name: 'الالتزامات', nameEn: 'Liabilities', type: 'liability', parent: null },
  { code: '21', name: 'الالتزامات المتداولة', nameEn: 'Current Liabilities', type: 'liability', parent: '2' },
  { code: '2110', name: 'الموردون (دائنون)', nameEn: 'Accounts Payable', type: 'liability', parent: '21' },
  { code: '2140', name: 'شيكات مستحقة الدفع', nameEn: 'Cheques Payable', type: 'liability', parent: '21' },
  { code: '3', name: 'حقوق الملكية', nameEn: 'Equity', type: 'equity', parent: null },
  { code: '3100', name: 'رأس المال', nameEn: 'Capital', type: 'equity', parent: '3' },
  { code: '3200', name: 'الأرباح المحتجزة', nameEn: 'Retained Earnings', type: 'equity', parent: '3' },
  { code: '4', name: 'الإيرادات', nameEn: 'Revenue', type: 'revenue', parent: null },
  { code: '4100', name: 'إيرادات المبيعات', nameEn: 'Sales Revenue', type: 'revenue', parent: '4' },
  { code: '4900', name: 'مردودات المبيعات', nameEn: 'Sales Returns', type: 'revenue', parent: '4' },
  { code: '5', name: 'المصروفات', nameEn: 'Expenses', type: 'expense', parent: null },
  { code: '5100', name: 'تكلفة البضاعة المباعة', nameEn: 'Cost of Goods Sold', type: 'expense', parent: '5' },
  { code: '5200', name: 'مصروفات تشغيلية', nameEn: 'Operating Expenses', type: 'expense', parent: '5' },
  { code: '5210', name: 'الرواتب والأجور', nameEn: 'Salaries & Wages', type: 'expense', parent: '5200' },
  { code: '5220', name: 'الإيجار', nameEn: 'Rent', type: 'expense', parent: '5200' },
  { code: '5230', name: 'الكهرباء والمياه', nameEn: 'Utilities', type: 'expense', parent: '5200' },
  { code: '5900', name: 'مردودات المشتريات', nameEn: 'Purchase Returns', type: 'expense', parent: '5' }
];

export const runMigrations = (db: Database.Database): void => {
  db.exec(SCHEMA_V1);

  // seed if accounts empty
  const count = (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO accounts (code, name, name_en, type, parent_code, currency) VALUES (?, ?, ?, ?, ?, ?)'
    );
    db.transaction(() => {
      for (const a of DEFAULT_ACCOUNTS) ins.run(a.code, a.name, a.nameEn, a.type, a.parent, 'USD');
    })();
  }

  const wcount = (db.prepare('SELECT COUNT(*) AS n FROM warehouses').get() as { n: number }).n;
  if (wcount === 0) {
    db.prepare('INSERT INTO warehouses (code, name, name_en, is_default) VALUES (?, ?, ?, 1)')
      .run('W1', 'المستودع الرئيسي', 'Main Warehouse');
  }

  const ccount = (db.prepare('SELECT COUNT(*) AS n FROM cashboxes').get() as { n: number }).n;
  if (ccount === 0) {
    const cashAcct = db.prepare(`SELECT id FROM accounts WHERE code = '1101'`).get() as { id: number } | undefined;
    if (cashAcct) {
      db.prepare('INSERT INTO cashboxes (code, name, currency, account_id, is_default) VALUES (?, ?, ?, ?, 1)')
        .run('CB1', 'الصندوق الرئيسي', 'USD', cashAcct.id);
    }
  }

  // settings defaults
  const setIfMissing = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  setIfMissing.run('company_name', 'شركتي');
  setIfMissing.run('company_name_en', 'My Company');
  setIfMissing.run('default_currency', 'USD');
  setIfMissing.run('language', 'ar');
  setIfMissing.run('policy_mode', 'strict');
  setIfMissing.run('fiscal_year_start', '01-01');
  setIfMissing.run('schema_version', '2');
  setIfMissing.run('group_notes', '');

  // ---- V2 migration (idempotent — uses CREATE TABLE IF NOT EXISTS) ----
  db.exec(SCHEMA_V2);
  seedV2(db);

  // upgrade marker
  db.prepare(`UPDATE settings SET value='2' WHERE key='schema_version'`).run();
};

export const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  symbol TEXT,
  is_base INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  rate TEXT NOT NULL,
  UNIQUE(currency, date)
);
CREATE INDEX IF NOT EXISTS idx_fx_currency_date ON fx_rates(currency, date);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  department_id INTEGER REFERENCES departments(id),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS funders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  account_id INTEGER NOT NULL REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('transfer','adjust_in','adjust_out','opening')),
  from_warehouse_id INTEGER REFERENCES warehouses(id),
  to_warehouse_id INTEGER REFERENCES warehouses(id),
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_sm_date ON stock_movements(date);

CREATE TABLE IF NOT EXISTS stock_movement_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id INTEGER NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty TEXT NOT NULL,
  unit_cost_minor TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('sale','purchase')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  valid_until TEXT,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_minor TEXT NOT NULL DEFAULT '0',
  discount_minor TEXT NOT NULL DEFAULT '0',
  fees_minor TEXT NOT NULL DEFAULT '0',
  grand_total_minor TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','converted','cancelled')),
  converted_invoice_id INTEGER REFERENCES invoices(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(date);

CREATE TABLE IF NOT EXISTS quote_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty TEXT NOT NULL,
  unit_price_minor TEXT NOT NULL,
  discount_minor TEXT NOT NULL DEFAULT '0',
  total_minor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('sale','purchase')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_minor TEXT NOT NULL DEFAULT '0',
  discount_minor TEXT NOT NULL DEFAULT '0',
  fees_minor TEXT NOT NULL DEFAULT '0',
  grand_total_minor TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','partial','fulfilled','cancelled')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty TEXT NOT NULL,
  qty_fulfilled TEXT NOT NULL DEFAULT '0',
  unit_price_minor TEXT NOT NULL,
  discount_minor TEXT NOT NULL DEFAULT '0',
  total_minor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  party_id INTEGER REFERENCES parties(id),
  hire_date TEXT,
  job_title TEXT,
  basic_salary_minor TEXT NOT NULL DEFAULT '0',
  allowance_minor TEXT NOT NULL DEFAULT '0',
  payable_account_id INTEGER REFERENCES accounts(id),
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payroll_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  period TEXT NOT NULL,
  date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  salary_account_id INTEGER NOT NULL REFERENCES accounts(id),
  payable_account_id INTEGER NOT NULL REFERENCES accounts(id),
  payment_account_id INTEGER REFERENCES accounts(id),
  total_minor TEXT NOT NULL DEFAULT '0',
  paid_minor TEXT NOT NULL DEFAULT '0',
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted'))
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL REFERENCES payroll_sheets(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  basic_minor TEXT NOT NULL DEFAULT '0',
  allowance_minor TEXT NOT NULL DEFAULT '0',
  overtime_minor TEXT NOT NULL DEFAULT '0',
  deductions_minor TEXT NOT NULL DEFAULT '0',
  net_minor TEXT NOT NULL DEFAULT '0',
  paid_minor TEXT NOT NULL DEFAULT '0',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  acq_date TEXT NOT NULL,
  cost_minor TEXT NOT NULL,
  salvage_minor TEXT NOT NULL DEFAULT '0',
  useful_life_months INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'straight' CHECK(method IN ('straight')),
  asset_account_id INTEGER NOT NULL REFERENCES accounts(id),
  accum_account_id INTEGER NOT NULL REFERENCES accounts(id),
  expense_account_id INTEGER NOT NULL REFERENCES accounts(id),
  accumulated_minor TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disposed')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS depreciation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_minor TEXT NOT NULL,
  journal_id INTEGER REFERENCES journal_entries(id),
  UNIQUE(asset_id, period)
);

CREATE TABLE IF NOT EXISTS period_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  locked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  branch TEXT,
  address TEXT,
  phone TEXT,
  account_no TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notes_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('debit_customer','credit_customer','debit_supplier','credit_supplier')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_minor TEXT NOT NULL,
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_notes_docs_date ON notes_docs(date);

CREATE TABLE IF NOT EXISTS multi_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('receipt','payment')),
  serial TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  cashbox_id INTEGER NOT NULL REFERENCES cashboxes(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  total_minor TEXT NOT NULL DEFAULT '0',
  notes TEXT,
  journal_id INTEGER REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_mvouch_date ON multi_vouchers(date);

CREATE TABLE IF NOT EXISTS multi_voucher_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL REFERENCES multi_vouchers(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES parties(id),
  amount_minor TEXT NOT NULL,
  memo TEXT
);

CREATE TABLE IF NOT EXISTS manufacturing_formulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  output_item_id INTEGER NOT NULL REFERENCES items(id),
  output_qty TEXT NOT NULL DEFAULT '1',
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS manufacturing_formula_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  formula_id INTEGER NOT NULL REFERENCES manufacturing_formulas(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty TEXT NOT NULL,
  waste_pct TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS manufacturing_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  formula_id INTEGER NOT NULL REFERENCES manufacturing_formulas(id),
  date TEXT NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  output_qty TEXT NOT NULL,
  notes TEXT,
  out_movement_id INTEGER REFERENCES stock_movements(id),
  in_movement_id INTEGER REFERENCES stock_movements(id),
  journal_id INTEGER REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_mfg_runs_date ON manufacturing_runs(date);

CREATE TABLE IF NOT EXISTS account_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount_minor TEXT NOT NULL DEFAULT '0',
  notes TEXT,
  UNIQUE(account_id, period)
);
CREATE INDEX IF NOT EXISTS idx_account_budgets_period ON account_budgets(period);

-- Extend parties with extra Aseel-style fields (idempotent ALTER)
`;

export const seedV2 = (db: Database.Database): void => {
  // Add columns to existing tables — wrap each in try/catch since SQLite ALTER is conditional
  const safeAlter = (sql: string): void => { try { db.exec(sql); } catch { /* column exists */ } };

  // parties extras
  safeAlter(`ALTER TABLE parties ADD COLUMN due_days INTEGER`);
  safeAlter(`ALTER TABLE parties ADD COLUMN credit_limit_minor TEXT`);
  safeAlter(`ALTER TABLE parties ADD COLUMN price_tier INTEGER`);
  safeAlter(`ALTER TABLE parties ADD COLUMN default_warehouse_id INTEGER REFERENCES warehouses(id)`);
  safeAlter(`ALTER TABLE parties ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);

  // journal_lines analytical dimensions
  safeAlter(`ALTER TABLE journal_lines ADD COLUMN department_id INTEGER REFERENCES departments(id)`);
  safeAlter(`ALTER TABLE journal_lines ADD COLUMN project_id INTEGER REFERENCES projects(id)`);
  safeAlter(`ALTER TABLE journal_lines ADD COLUMN funder_id INTEGER REFERENCES funders(id)`);

  // vouchers — add expense kind support
  // SQLite doesn't allow ALTER CHECK; we keep new vouchers via a separate table or relax check.
  // Instead, store expense info on journal entries linked via vouchers. Add expense_account_id col.
  safeAlter(`ALTER TABLE vouchers ADD COLUMN expense_account_id INTEGER REFERENCES accounts(id)`);
  safeAlter(`ALTER TABLE vouchers ADD COLUMN department_id INTEGER REFERENCES departments(id)`);
  safeAlter(`ALTER TABLE vouchers ADD COLUMN project_id INTEGER REFERENCES projects(id)`);
  safeAlter(`ALTER TABLE vouchers ADD COLUMN funder_id INTEGER REFERENCES funders(id)`);

  // invoices analytical dimensions
  safeAlter(`ALTER TABLE invoices ADD COLUMN department_id INTEGER REFERENCES departments(id)`);
  safeAlter(`ALTER TABLE invoices ADD COLUMN project_id INTEGER REFERENCES projects(id)`);
  safeAlter(`ALTER TABLE invoices ADD COLUMN funder_id INTEGER REFERENCES funders(id)`);
  safeAlter(`ALTER TABLE invoices ADD COLUMN due_date TEXT`);

  // cheques: link to bank master (free-text bank field stays for backward compat)
  safeAlter(`ALTER TABLE cheques ADD COLUMN bank_id INTEGER REFERENCES banks(id)`);

  // Seed base currency from settings
  const baseCcy = (db.prepare(`SELECT value FROM settings WHERE key='default_currency'`).get() as { value?: string } | undefined)?.value ?? 'USD';
  db.prepare(`INSERT OR IGNORE INTO currencies (code, name, name_en, symbol, is_base) VALUES (?, ?, ?, ?, 1)`)
    .run(baseCcy, baseCcy, baseCcy, baseCcy);
  db.prepare(`INSERT OR IGNORE INTO fx_rates (currency, date, rate) VALUES (?, ?, '1')`).run(baseCcy, '1900-01-01');

  // Seed default fixed-asset accounts (children of 12) if not present
  const has = (code: string): boolean =>
    !!(db.prepare('SELECT 1 FROM accounts WHERE code=?').get(code));
  const insAcct = db.prepare(`INSERT INTO accounts (code, name, name_en, type, parent_code, currency)
                              VALUES (?, ?, ?, ?, ?, 'USD')`);
  if (!has('1210')) insAcct.run('1210', 'الأصول الثابتة - تكلفة', 'Fixed Assets - Cost', 'asset', '12');
  if (!has('1290')) insAcct.run('1290', 'مجمع الإهلاك', 'Accumulated Depreciation', 'asset', '12');
  if (!has('5240')) insAcct.run('5240', 'مصروف الإهلاك', 'Depreciation Expense', 'expense', '5200');
  if (!has('2120')) insAcct.run('2120', 'الرواتب المستحقة', 'Salaries Payable', 'liability', '21');

  // Seed base expense categories — link to existing expense accounts
  const ec = db.prepare('SELECT COUNT(*) AS n FROM expense_categories').get() as { n: number };
  if (ec.n === 0) {
    const findAcct = (code: string): number | null => {
      const r = db.prepare('SELECT id FROM accounts WHERE code=?').get(code) as { id: number } | undefined;
      return r ? r.id : null;
    };
    const insExp = db.prepare('INSERT INTO expense_categories (code, name, name_en, account_id) VALUES (?, ?, ?, ?)');
    const rentId = findAcct('5220');
    const utilId = findAcct('5230');
    const salId = findAcct('5210');
    const opsId = findAcct('5200');
    if (rentId) insExp.run('EX-RENT', 'الإيجار', 'Rent', rentId);
    if (utilId) insExp.run('EX-UTIL', 'الكهرباء والمياه', 'Utilities', utilId);
    if (salId) insExp.run('EX-SAL', 'الرواتب', 'Salaries', salId);
    if (opsId) insExp.run('EX-OPS', 'مصاريف تشغيلية', 'Operating Expenses', opsId);
  }
};

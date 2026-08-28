import { ipcMain } from 'electron';
import { db } from '../services/db';
import { isDebitNormal, type AccountType } from '@shared/domain/Account';
import { valueOf } from '@shared/domain/Inventory';

interface TBRow {
  id: number; code: string; name: string; type: AccountType;
  debitMinor: string; creditMinor: string; balanceMinor: string;
}

export const registerReports = (): void => {

  // ---------- Trial Balance ----------
  ipcMain.handle('reports:trialBalance', (_e, fromDate: string, toDate: string): TBRow[] => {
    const rows = db().prepare(`
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER)), 0)  AS debit,
             COALESCE(SUM(CAST(jl.credit_minor AS INTEGER)), 0) AS credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
      WHERE (je.date IS NULL OR (je.date >= ? AND je.date <= ?))
      GROUP BY a.id
      HAVING debit > 0 OR credit > 0
      ORDER BY a.code
    `).all(fromDate, toDate) as Array<{ id:number; code:string; name:string; type:AccountType; debit:number; credit:number }>;
    return rows.map(r => {
      const balance = isDebitNormal(r.type) ? r.debit - r.credit : r.credit - r.debit;
      return {
        id: r.id, code: r.code, name: r.name, type: r.type,
        debitMinor: String(r.debit), creditMinor: String(r.credit), balanceMinor: String(balance)
      };
    });
  });

  // ---------- Account Ledger ----------
  ipcMain.handle('reports:accountLedger', (_e, accountId: number, fromDate: string, toDate: string) => {
    const acct = db().prepare('SELECT type FROM accounts WHERE id = ?').get(accountId) as { type: AccountType } | undefined;
    if (!acct) return [];
    const debitNormal = isDebitNormal(acct.type);

    // opening balance: everything before fromDate
    const open = db().prepare(`
      SELECT COALESCE(SUM(CAST(jl.debit_minor AS INTEGER)), 0)  AS debit,
             COALESCE(SUM(CAST(jl.credit_minor AS INTEGER)), 0) AS credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ? AND je.date < ?
    `).get(accountId, fromDate) as { debit: number; credit: number };

    let running = debitNormal ? open.debit - open.credit : open.credit - open.debit;

    const rows = db().prepare(`
      SELECT je.id AS entryId, je.date, je.reference, jl.memo,
             CAST(jl.debit_minor AS INTEGER)  AS debit,
             CAST(jl.credit_minor AS INTEGER) AS credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ? AND je.date >= ? AND je.date <= ?
      ORDER BY je.date, je.id, jl.id
    `).all(accountId, fromDate, toDate) as Array<{ entryId:number; date:string; reference:string|null; memo:string|null; debit:number; credit:number }>;

    const out: Array<{ entryId:number|null; date:string; reference:string|null; memo:string; debitMinor:string; creditMinor:string; runningMinor:string }> = [];
    out.push({ entryId: null, date: fromDate, reference: '—', memo: 'Opening balance', debitMinor: '0', creditMinor: '0', runningMinor: String(running) });

    for (const r of rows) {
      running += debitNormal ? (r.debit - r.credit) : (r.credit - r.debit);
      out.push({
        entryId: r.entryId, date: r.date, reference: r.reference, memo: r.memo ?? '',
        debitMinor: String(r.debit), creditMinor: String(r.credit), runningMinor: String(running)
      });
    }
    return out;
  });

  // ---------- Customer Statement ----------
  ipcMain.handle('reports:partyStatement', (_e, partyId: number, fromDate: string, toDate: string) => {
    const p = db().prepare(`SELECT ar_account_id, ap_account_id FROM parties WHERE id = ?`).get(partyId) as { ar_account_id: number | null; ap_account_id: number | null } | undefined;
    if (!p) return [];
    const ids: number[] = [p.ar_account_id, p.ap_account_id].filter((x): x is number => !!x);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');

    const open = db().prepare(`
      SELECT COALESCE(SUM(CAST(jl.debit_minor AS INTEGER)), 0)  AS debit,
             COALESCE(SUM(CAST(jl.credit_minor AS INTEGER)), 0) AS credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id IN (${placeholders}) AND je.date < ?
    `).get(...ids, fromDate) as { debit: number; credit: number };
    let running = open.debit - open.credit;

    const rows = db().prepare(`
      SELECT je.id AS entryId, je.date, je.reference, jl.memo,
             CAST(jl.debit_minor AS INTEGER)  AS debit,
             CAST(jl.credit_minor AS INTEGER) AS credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id IN (${placeholders}) AND je.date >= ? AND je.date <= ?
      ORDER BY je.date, je.id
    `).all(...ids, fromDate, toDate) as Array<{ entryId:number; date:string; reference:string|null; memo:string|null; debit:number; credit:number }>;

    const out: Array<{ entryId:number|null; date:string; reference:string|null; memo:string; debitMinor:string; creditMinor:string; runningMinor:string }> = [
      { entryId: null, date: fromDate, reference: '—', memo: 'Opening balance', debitMinor: '0', creditMinor: '0', runningMinor: String(running) }
    ];
    for (const r of rows) {
      running += r.debit - r.credit;
      out.push({ entryId: r.entryId, date: r.date, reference: r.reference, memo: r.memo ?? '', debitMinor: String(r.debit), creditMinor: String(r.credit), runningMinor: String(running) });
    }
    return out;
  });

  // ---------- Inventory Balance ----------
  ipcMain.handle('reports:inventoryBalance', () => {
    return db().prepare(`
      SELECT i.id AS itemId, i.code, i.name, i.unit,
             i.avg_cost_minor AS unitCostMinor,
             COALESCE(SUM(CAST(s.qty AS REAL)), 0) AS qty
      FROM items i
      LEFT JOIN item_stock s ON s.item_id = i.id
      WHERE i.item_type = 'stock'
      GROUP BY i.id
      ORDER BY i.code
    `).all().map((r: unknown) => {
      const row = r as { itemId:number; code:string; name:string; unit:string; unitCostMinor:string; qty:number };
      const stockValue = valueOf(BigInt(row.unitCostMinor || '0'), row.qty);
      return { ...row, stockValueMinor: stockValue.toString() };
    });
  });

  // ---------- Inventory Movement ----------
  ipcMain.handle('reports:inventoryMovement', (_e, itemId: number, fromDate: string, toDate: string) => {
    return db().prepare(`
      SELECT inv.date, inv.serial, inv.kind, il.qty,
             il.unit_price_minor AS unitPriceMinor, il.total_minor AS totalMinor,
             p.name AS partyName
      FROM invoice_lines il
      JOIN invoices inv ON inv.id = il.invoice_id
      JOIN parties p ON p.id = inv.party_id
      WHERE il.item_id = ? AND inv.date >= ? AND inv.date <= ?
      ORDER BY inv.date, inv.id
    `).all(itemId, fromDate, toDate);
  });

  // ---------- Sales Summary ----------
  ipcMain.handle('reports:salesSummary', (_e, fromDate: string, toDate: string) => {
    return db().prepare(`
      SELECT inv.date, inv.serial, inv.kind, p.name AS partyName,
             inv.grand_total_minor AS grandTotalMinor, inv.currency
      FROM invoices inv
      JOIN parties p ON p.id = inv.party_id
      WHERE inv.kind IN ('sale','sale_return') AND inv.date >= ? AND inv.date <= ?
      ORDER BY inv.date, inv.id
    `).all(fromDate, toDate);
  });

  // ---------- Purchases Summary ----------
  ipcMain.handle('reports:purchasesSummary', (_e, fromDate: string, toDate: string) => {
    return db().prepare(`
      SELECT inv.date, inv.serial, inv.kind, p.name AS partyName,
             inv.grand_total_minor AS grandTotalMinor, inv.currency
      FROM invoices inv
      JOIN parties p ON p.id = inv.party_id
      WHERE inv.kind IN ('purchase','purchase_return') AND inv.date >= ? AND inv.date <= ?
      ORDER BY inv.date, inv.id
    `).all(fromDate, toDate);
  });

  // ---------- AR/AP Aging (no interest, simple bucketing) ----------
  ipcMain.handle('reports:arAging', (_e, asOfDate: string) => {
    return db().prepare(`
      SELECT p.id AS partyId, p.code, p.name,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS balanceMinor
      FROM parties p
      JOIN journal_lines jl ON jl.account_id = p.ar_account_id
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.date <= ?
      GROUP BY p.id
      HAVING balanceMinor > 0
      ORDER BY p.name
    `).all(asOfDate);
  });

  ipcMain.handle('reports:apAging', (_e, asOfDate: string) => {
    return db().prepare(`
      SELECT p.id AS partyId, p.code, p.name,
             COALESCE(SUM(CAST(jl.credit_minor AS INTEGER) - CAST(jl.debit_minor AS INTEGER)), 0) AS balanceMinor
      FROM parties p
      JOIN journal_lines jl ON jl.account_id = p.ap_account_id
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.date <= ?
      GROUP BY p.id
      HAVING balanceMinor > 0
      ORDER BY p.name
    `).all(asOfDate);
  });

  // ---------- P&L (Income Statement) ----------
  ipcMain.handle('reports:incomeStatement', (_e, fromDate: string, toDate: string) => {
    const rows = db().prepare(`
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(CAST(jl.credit_minor AS INTEGER) - CAST(jl.debit_minor AS INTEGER)), 0) AS revenueBalance,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS expenseBalance
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
      WHERE a.type IN ('revenue','expense') AND (je.date IS NULL OR (je.date >= ? AND je.date <= ?))
      GROUP BY a.id
      ORDER BY a.code
    `).all(fromDate, toDate) as Array<{ id:number; code:string; name:string; type:AccountType; revenueBalance:number; expenseBalance:number }>;

    let totalRev = 0, totalExp = 0;
    const lines = rows.map(r => {
      const amount = r.type === 'revenue' ? r.revenueBalance : r.expenseBalance;
      if (r.type === 'revenue') totalRev += amount; else totalExp += amount;
      return { code: r.code, name: r.name, type: r.type, amountMinor: String(amount) };
    });
    return { lines, totalRevenueMinor: String(totalRev), totalExpenseMinor: String(totalExp), netIncomeMinor: String(totalRev - totalExp) };
  });

  // ---------- Balance Sheet ----------
  ipcMain.handle('reports:balanceSheet', (_e, asOfDate: string) => {
    const rows = db().prepare(`
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS netDebit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
      WHERE a.type IN ('asset','liability','equity') AND (je.date IS NULL OR je.date <= ?)
      GROUP BY a.id
      ORDER BY a.code
    `).all(asOfDate) as Array<{ id:number; code:string; name:string; type:AccountType; netDebit:number }>;

    let assets = 0, liab = 0, equity = 0;
    const lines = rows.map(r => {
      const amount = isDebitNormal(r.type) ? r.netDebit : -r.netDebit;
      if (r.type === 'asset') assets += amount;
      else if (r.type === 'liability') liab += amount;
      else equity += amount;
      return { code: r.code, name: r.name, type: r.type, amountMinor: String(amount) };
    });
    // include net income in equity
    const ni = db().prepare(`
      SELECT COALESCE(SUM(CASE WHEN a.type='revenue' THEN CAST(jl.credit_minor AS INTEGER) - CAST(jl.debit_minor AS INTEGER)
                               WHEN a.type='expense' THEN -(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER))
                               ELSE 0 END), 0) AS ni
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE je.date <= ?
    `).get(asOfDate) as { ni: number };
    equity += ni.ni;

    return {
      lines,
      totalAssetsMinor: String(assets),
      totalLiabilitiesMinor: String(liab),
      totalEquityMinor: String(equity),
      netIncomeMinor: String(ni.ni)
    };
  });

  // ---------- Dashboard summary ----------
  ipcMain.handle('reports:dashboard', () => {
    const totals = db().prepare(`
      SELECT a.type,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS netDebit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      GROUP BY a.type
    `).all() as Array<{ type: AccountType; netDebit: number }>;
    let assets=0, liab=0, equity=0, rev=0, exp=0;
    for (const t of totals) {
      if (t.type === 'asset') assets = t.netDebit;
      else if (t.type === 'liability') liab = -t.netDebit;
      else if (t.type === 'equity') equity = -t.netDebit;
      else if (t.type === 'revenue') rev = -t.netDebit;
      else if (t.type === 'expense') exp = t.netDebit;
    }
    const cash = (db().prepare(`
      SELECT COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS bal
      FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
      WHERE a.code IN ('1101','1102')
    `).get() as { bal: number }).bal;
    const ar = (db().prepare(`
      SELECT COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS bal
      FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
      WHERE a.code = '1110' OR a.parent_code = '1110'
    `).get() as { bal: number }).bal;
    const ap = (db().prepare(`
      SELECT COALESCE(SUM(CAST(jl.credit_minor AS INTEGER) - CAST(jl.debit_minor AS INTEGER)), 0) AS bal
      FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
      WHERE a.code = '2110' OR a.parent_code = '2110'
    `).get() as { bal: number }).bal;
    const invoices = (db().prepare(`SELECT COUNT(*) AS n FROM invoices`).get() as { n: number }).n;
    const lowStock = db().prepare(`
      SELECT i.code, i.name, COALESCE(SUM(CAST(s.qty AS REAL)), 0) AS qty, i.min_qty AS minQty
      FROM items i
      LEFT JOIN item_stock s ON s.item_id = i.id
      WHERE i.item_type = 'stock'
      GROUP BY i.id
      HAVING qty < CAST(i.min_qty AS REAL)
      LIMIT 10
    `).all();

    return {
      assetsMinor: String(assets),
      liabilitiesMinor: String(liab),
      equityMinor: String(equity),
      netIncomeMinor: String(rev - exp),
      cashMinor: String(cash),
      arMinor: String(ar),
      apMinor: String(ap),
      invoicesCount: invoices,
      lowStock
    };
  });
};

// IPC handlers for V2 entities: stock movements, quotes, orders, expense vouchers,
// departments/projects/funders, currencies/fx, employees/payroll, assets/depreciation,
// period locks, backup/restore.

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { copyFileSync } from 'node:fs';
import { db, dbPath, openCompany, closeDb } from '../services/db';
import { runMigrations } from '../services/migrations';
import { assertRestorableDatabase, dropWalSidecars, replaceDatabaseFile } from '../services/sqlite-file';
import { S } from '../strings';
import { audit } from '../services/audit';
import { postJournal, nextSerial } from '../services/posting';
import { requirePeriodOpen } from '../services/period';
import type { JournalLineDto, SaveResult } from '@shared/types';

// ---------- helpers ----------

const acctIdByCode = (code: string): number | null => {
  const r = db().prepare(`SELECT id FROM accounts WHERE code = ?`).get(code) as { id: number } | undefined;
  return r ? r.id : null;
};

const requireAcct = (code: string): number => {
  const id = acctIdByCode(code);
  if (id == null) throw new Error(`Required account ${code} missing`);
  return id;
};

// ---------- Departments ----------

export const registerDepartments = (): void => {
  ipcMain.handle('dept:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, is_active AS isActive FROM departments ORDER BY code`).all()
  );
  ipcMain.handle('dept:save', (_e, d: { id?: number; code: string; name: string; nameEn?: string; isActive?: number }): SaveResult => {
    if (d.id) {
      db().prepare(`UPDATE departments SET code=?, name=?, name_en=?, is_active=? WHERE id=?`)
        .run(d.code, d.name, d.nameEn ?? null, d.isActive ?? 1, d.id);
      return { ok: true, id: d.id };
    }
    const r = db().prepare(`INSERT INTO departments (code, name, name_en, is_active) VALUES (?, ?, ?, ?)`)
      .run(d.code, d.name, d.nameEn ?? null, d.isActive ?? 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('dept:delete', (_e, id: number): SaveResult => {
    try { db().prepare(`DELETE FROM departments WHERE id=?`).run(id); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });
};

// ---------- Projects ----------

export const registerProjects = (): void => {
  ipcMain.handle('proj:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, department_id AS departmentId, is_active AS isActive FROM projects ORDER BY code`).all()
  );
  ipcMain.handle('proj:save', (_e, p: { id?: number; code: string; name: string; nameEn?: string; departmentId?: number | null; isActive?: number }): SaveResult => {
    if (p.id) {
      db().prepare(`UPDATE projects SET code=?, name=?, name_en=?, department_id=?, is_active=? WHERE id=?`)
        .run(p.code, p.name, p.nameEn ?? null, p.departmentId ?? null, p.isActive ?? 1, p.id);
      return { ok: true, id: p.id };
    }
    const r = db().prepare(`INSERT INTO projects (code, name, name_en, department_id, is_active) VALUES (?, ?, ?, ?, ?)`)
      .run(p.code, p.name, p.nameEn ?? null, p.departmentId ?? null, p.isActive ?? 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('proj:delete', (_e, id: number): SaveResult => {
    try { db().prepare(`DELETE FROM projects WHERE id=?`).run(id); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });
};

// ---------- Funders ----------

export const registerFunders = (): void => {
  ipcMain.handle('funder:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, is_active AS isActive FROM funders ORDER BY code`).all()
  );
  ipcMain.handle('funder:save', (_e, f: { id?: number; code: string; name: string; nameEn?: string; isActive?: number }): SaveResult => {
    if (f.id) {
      db().prepare(`UPDATE funders SET code=?, name=?, name_en=?, is_active=? WHERE id=?`)
        .run(f.code, f.name, f.nameEn ?? null, f.isActive ?? 1, f.id);
      return { ok: true, id: f.id };
    }
    const r = db().prepare(`INSERT INTO funders (code, name, name_en, is_active) VALUES (?, ?, ?, ?)`)
      .run(f.code, f.name, f.nameEn ?? null, f.isActive ?? 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('funder:delete', (_e, id: number): SaveResult => {
    try { db().prepare(`DELETE FROM funders WHERE id=?`).run(id); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });
};

// ---------- Expense Categories ----------

export const registerExpenseCategories = (): void => {
  ipcMain.handle('expCat:list', () =>
    db().prepare(`SELECT ec.id, ec.code, ec.name, ec.name_en AS nameEn, ec.account_id AS accountId,
                          a.code AS accountCode, a.name AS accountName
                   FROM expense_categories ec JOIN accounts a ON a.id = ec.account_id ORDER BY ec.code`).all()
  );
  ipcMain.handle('expCat:save', (_e, c: { id?: number; code: string; name: string; nameEn?: string; accountId: number }): SaveResult => {
    if (c.id) {
      db().prepare(`UPDATE expense_categories SET code=?, name=?, name_en=?, account_id=? WHERE id=?`)
        .run(c.code, c.name, c.nameEn ?? null, c.accountId, c.id);
      return { ok: true, id: c.id };
    }
    const r = db().prepare(`INSERT INTO expense_categories (code, name, name_en, account_id) VALUES (?, ?, ?, ?)`)
      .run(c.code, c.name, c.nameEn ?? null, c.accountId);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('expCat:delete', (_e, id: number): SaveResult => {
    try { db().prepare(`DELETE FROM expense_categories WHERE id=?`).run(id); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });
};

// ---------- Currencies + FX rates ----------

export const registerCurrencies = (): void => {
  ipcMain.handle('ccy:list', () =>
    db().prepare(`SELECT code, name, name_en AS nameEn, symbol, is_base AS isBase FROM currencies ORDER BY is_base DESC, code`).all()
  );
  ipcMain.handle('ccy:save', (_e, c: { code: string; name: string; nameEn?: string; symbol?: string; isBase?: number; original?: string }): SaveResult => {
    if (c.isBase) db().prepare(`UPDATE currencies SET is_base=0`).run();
    if (c.original && c.original !== c.code) {
      db().prepare(`UPDATE currencies SET code=?, name=?, name_en=?, symbol=?, is_base=? WHERE code=?`)
        .run(c.code, c.name, c.nameEn ?? null, c.symbol ?? null, c.isBase ?? 0, c.original);
    } else {
      db().prepare(`INSERT INTO currencies (code, name, name_en, symbol, is_base) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(code) DO UPDATE SET name=excluded.name, name_en=excluded.name_en, symbol=excluded.symbol, is_base=excluded.is_base`)
        .run(c.code, c.name, c.nameEn ?? null, c.symbol ?? null, c.isBase ?? 0);
    }
    return { ok: true };
  });
  ipcMain.handle('ccy:delete', (_e, code: string): SaveResult => {
    const base = db().prepare(`SELECT is_base FROM currencies WHERE code=?`).get(code) as { is_base: number } | undefined;
    if (base?.is_base) return { ok: false, error: 'Cannot delete base currency' };
    db().prepare(`DELETE FROM currencies WHERE code=?`).run(code);
    db().prepare(`DELETE FROM fx_rates WHERE currency=?`).run(code);
    return { ok: true };
  });

  ipcMain.handle('fx:list', (_e, currency?: string) => {
    const where = currency ? 'WHERE currency = ?' : '';
    const args = currency ? [currency] : [];
    return db().prepare(`SELECT id, currency, date, rate FROM fx_rates ${where} ORDER BY date DESC, currency`).all(...args);
  });
  ipcMain.handle('fx:save', (_e, r: { id?: number; currency: string; date: string; rate: string }): SaveResult => {
    db().prepare(`INSERT INTO fx_rates (currency, date, rate) VALUES (?, ?, ?)
                  ON CONFLICT(currency, date) DO UPDATE SET rate=excluded.rate`)
      .run(r.currency, r.date, r.rate);
    return { ok: true };
  });
  ipcMain.handle('fx:delete', (_e, id: number): SaveResult => {
    db().prepare(`DELETE FROM fx_rates WHERE id=?`).run(id);
    return { ok: true };
  });
};

// ---------- Stock movements (manual + transfers) ----------

interface StockMoveInput {
  date: string;
  kind: 'transfer' | 'adjust_in' | 'adjust_out' | 'opening';
  fromWarehouseId?: number | null;
  toWarehouseId?: number | null;
  notes?: string | null;
  lines: Array<{ itemId: number; qty: string; unitCostMinor?: string }>;
}

const adjustStock = (itemId: number, warehouseId: number, qtyDelta: number): void => {
  const row = db().prepare('SELECT qty FROM item_stock WHERE item_id=? AND warehouse_id=?').get(itemId, warehouseId) as { qty: string } | undefined;
  const cur = parseFloat(row?.qty ?? '0');
  const newQty = cur + qtyDelta;
  if (row) db().prepare('UPDATE item_stock SET qty=? WHERE item_id=? AND warehouse_id=?').run(String(newQty), itemId, warehouseId);
  else db().prepare('INSERT INTO item_stock (item_id, warehouse_id, qty) VALUES (?, ?, ?)').run(itemId, warehouseId, String(newQty));
};

const updateAvgCostForReceipt = (itemId: number, qtyIn: number, unitCostMinor: bigint): void => {
  if (qtyIn <= 0) return;
  const row = db().prepare('SELECT avg_cost_minor FROM items WHERE id=?').get(itemId) as { avg_cost_minor: string };
  const stockRow = db().prepare('SELECT COALESCE(SUM(CAST(qty AS REAL)), 0) AS q FROM item_stock WHERE item_id=?').get(itemId) as { q: number };
  const curQty = stockRow.q;
  const curAvg = BigInt(row.avg_cost_minor || '0');
  const newQty = curQty + qtyIn;
  if (newQty <= 0) return;
  const totalValue = curAvg * BigInt(Math.round(curQty * 1000)) / 1000n + unitCostMinor * BigInt(Math.round(qtyIn * 1000)) / 1000n;
  const newAvg = totalValue / BigInt(Math.max(1, Math.round(newQty * 1000))) * 1000n;
  db().prepare('UPDATE items SET avg_cost_minor=? WHERE id=?').run(newAvg.toString(), itemId);
};

export const registerStockMovements = (): void => {
  ipcMain.handle('sm:list', () =>
    db().prepare(`SELECT sm.id, sm.serial, sm.date, sm.kind,
                          sm.from_warehouse_id AS fromWarehouseId, sm.to_warehouse_id AS toWarehouseId,
                          sm.notes, sm.journal_id AS journalId,
                          (SELECT name FROM warehouses WHERE id = sm.from_warehouse_id) AS fromWarehouseName,
                          (SELECT name FROM warehouses WHERE id = sm.to_warehouse_id) AS toWarehouseName,
                          (SELECT COUNT(*) FROM stock_movement_lines WHERE movement_id = sm.id) AS lineCount
                  FROM stock_movements sm ORDER BY date DESC, id DESC LIMIT 500`).all()
  );

  ipcMain.handle('sm:get', (_e, id: number) => {
    const m = db().prepare(`SELECT id, serial, date, kind, from_warehouse_id AS fromWarehouseId, to_warehouse_id AS toWarehouseId, notes, journal_id AS journalId
                            FROM stock_movements WHERE id=?`).get(id);
    if (!m) return undefined;
    const lines = db().prepare(`SELECT sml.id, sml.item_id AS itemId, sml.qty, sml.unit_cost_minor AS unitCostMinor,
                                       i.code AS itemCode, i.name AS itemName, i.unit
                                FROM stock_movement_lines sml JOIN items i ON i.id = sml.item_id
                                WHERE sml.movement_id=?`).all(id);
    return { ...m, lines };
  });

  ipcMain.handle('sm:save', (_e, m: StockMoveInput): SaveResult => {
    try {
      requirePeriodOpen(m.date);
      if (m.kind === 'transfer' && (!m.fromWarehouseId || !m.toWarehouseId)) {
        return { ok: false, error: 'Transfer needs both source and destination warehouses' };
      }
      if (m.kind === 'adjust_in' && !m.toWarehouseId) return { ok: false, error: 'Adjust-in needs warehouse' };
      if (m.kind === 'adjust_out' && !m.fromWarehouseId) return { ok: false, error: 'Adjust-out needs warehouse' };
      if (m.kind === 'opening' && !m.toWarehouseId) return { ok: false, error: 'Opening needs warehouse' };

      const serial = nextSerial(m.kind === 'transfer' ? 'TRF' : m.kind === 'adjust_in' ? 'ADI' : m.kind === 'adjust_out' ? 'ADO' : 'OPN');
      let movementId = 0;

      db().transaction(() => {
        const r = db().prepare(`INSERT INTO stock_movements (serial, date, kind, from_warehouse_id, to_warehouse_id, notes)
                                VALUES (?, ?, ?, ?, ?, ?)`).run(serial, m.date, m.kind,
          m.fromWarehouseId ?? null, m.toWarehouseId ?? null, m.notes ?? null);
        movementId = Number(r.lastInsertRowid);

        const insLine = db().prepare(`INSERT INTO stock_movement_lines (movement_id, item_id, qty, unit_cost_minor) VALUES (?, ?, ?, ?)`);
        for (const l of m.lines) {
          const qty = parseFloat(l.qty);
          if (qty <= 0) throw new Error('Line qty must be positive');
          insLine.run(movementId, l.itemId, l.qty, l.unitCostMinor ?? '0');

          if (m.kind === 'transfer') {
            adjustStock(l.itemId, m.fromWarehouseId!, -qty);
            adjustStock(l.itemId, m.toWarehouseId!, qty);
          } else if (m.kind === 'adjust_in') {
            adjustStock(l.itemId, m.toWarehouseId!, qty);
            updateAvgCostForReceipt(l.itemId, qty, BigInt(l.unitCostMinor || '0'));
          } else if (m.kind === 'adjust_out') {
            adjustStock(l.itemId, m.fromWarehouseId!, -qty);
          } else if (m.kind === 'opening') {
            adjustStock(l.itemId, m.toWarehouseId!, qty);
            updateAvgCostForReceipt(l.itemId, qty, BigInt(l.unitCostMinor || '0'));
          }
        }

        // For adjust_in/opening with a unit cost, post Dr Inventory / Cr Owner Equity (3100) so books balance.
        // For adjust_out, post Dr Operating Expenses (5200) / Cr Inventory at avg cost.
        const inventoryAcct = requireAcct('1130');
        const lines: JournalLineDto[] = [];
        let total = 0n;

        if (m.kind === 'adjust_in' || m.kind === 'opening') {
          for (const l of m.lines) {
            const qty = parseFloat(l.qty);
            const unit = BigInt(l.unitCostMinor || '0');
            total += unit * BigInt(Math.round(qty * 100)) / 100n;
          }
          if (total > 0n) {
            const equityAcct = requireAcct('3100');
            lines.push({ accountId: inventoryAcct, debitMinor: total.toString(), creditMinor: '0', currency: 'USD', memo: `${m.kind} ${serial}` });
            lines.push({ accountId: equityAcct, debitMinor: '0', creditMinor: total.toString(), currency: 'USD', memo: `${m.kind} ${serial}` });
          }
        } else if (m.kind === 'adjust_out') {
          // Cost at avg
          for (const l of m.lines) {
            const qty = parseFloat(l.qty);
            const item = db().prepare('SELECT avg_cost_minor FROM items WHERE id=?').get(l.itemId) as { avg_cost_minor: string };
            const avg = BigInt(item.avg_cost_minor || '0');
            total += avg * BigInt(Math.round(qty * 100)) / 100n;
          }
          if (total > 0n) {
            const opsAcct = requireAcct('5200');
            lines.push({ accountId: opsAcct, debitMinor: total.toString(), creditMinor: '0', currency: 'USD', memo: `Adjustment ${serial}` });
            lines.push({ accountId: inventoryAcct, debitMinor: '0', creditMinor: total.toString(), currency: 'USD', memo: `Adjustment ${serial}` });
          }
        }
        // Transfers don't move value (same item, total stock unchanged) — no JE.

        if (lines.length) {
          const pr = postJournal({ date: m.date, reference: serial, memo: `Stock ${m.kind} ${serial}`, sourceType: 'stock_movement', sourceId: movementId, lines });
          if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
          db().prepare('UPDATE stock_movements SET journal_id=? WHERE id=?').run(pr.entryId!, movementId);
        }
      })();

      audit('create', 'stock_movement', movementId, { serial, kind: m.kind });
      return { ok: true, id: movementId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Manufacturing formulas (BOM) + production runs ----------

interface FormulaInput {
  id?: number;
  code: string;
  name: string;
  outputItemId: number;
  outputQty: string;
  notes?: string | null;
  isActive?: number;
  lines: Array<{ itemId: number; qty: string; wastePct?: string }>;
}

interface ManufactureInput {
  date: string;
  formulaId: number;
  warehouseId: number;
  outputQty: string;
  notes?: string | null;
}

const stockQty = (itemId: number, warehouseId: number): number => {
  const row = db().prepare('SELECT qty FROM item_stock WHERE item_id=? AND warehouse_id=?').get(itemId, warehouseId) as { qty: string } | undefined;
  return parseFloat(row?.qty ?? '0');
};

const amountForQty = (unitCostMinor: bigint, qty: number): bigint =>
  unitCostMinor * BigInt(Math.round(qty * 1000)) / 1000n;

export const registerManufacturing = (): void => {
  ipcMain.handle('mfg:formulas:list', () =>
    db().prepare(`SELECT f.id, f.code, f.name, f.output_item_id AS outputItemId, f.output_qty AS outputQty,
                         f.notes, f.is_active AS isActive,
                         i.code AS outputItemCode, i.name AS outputItemName,
                         (SELECT COUNT(*) FROM manufacturing_formula_lines WHERE formula_id=f.id) AS lineCount
                  FROM manufacturing_formulas f JOIN items i ON i.id=f.output_item_id
                  ORDER BY f.code`).all()
  );

  ipcMain.handle('mfg:formulas:get', (_e, id: number) => {
    const formula = db().prepare(`SELECT id, code, name, output_item_id AS outputItemId, output_qty AS outputQty,
                                        notes, is_active AS isActive
                                 FROM manufacturing_formulas WHERE id=?`).get(id);
    if (!formula) return undefined;
    const lines = db().prepare(`SELECT l.id, l.item_id AS itemId, l.qty, l.waste_pct AS wastePct,
                                      i.code AS itemCode, i.name AS itemName
                               FROM manufacturing_formula_lines l JOIN items i ON i.id=l.item_id
                               WHERE l.formula_id=? ORDER BY l.id`).all(id);
    return { ...formula, lines };
  });

  ipcMain.handle('mfg:formulas:save', (_e, f: FormulaInput): SaveResult => {
    try {
      if (!f.code?.trim() || !f.name?.trim() || !f.outputItemId) return { ok: false, error: 'Formula code, name, and output item are required' };
      if (parseFloat(f.outputQty) <= 0) return { ok: false, error: 'Output quantity must be positive' };
      if (!f.lines?.length) return { ok: false, error: 'At least one component is required' };
      let id = f.id ?? 0;
      db().transaction(() => {
        if (id) {
          db().prepare(`UPDATE manufacturing_formulas SET code=?, name=?, output_item_id=?, output_qty=?, notes=?, is_active=? WHERE id=?`)
            .run(f.code, f.name, f.outputItemId, f.outputQty, f.notes ?? null, f.isActive ?? 1, id);
          db().prepare('DELETE FROM manufacturing_formula_lines WHERE formula_id=?').run(id);
        } else {
          const r = db().prepare(`INSERT INTO manufacturing_formulas (code, name, output_item_id, output_qty, notes, is_active)
                                  VALUES (?, ?, ?, ?, ?, ?)`).run(f.code, f.name, f.outputItemId, f.outputQty, f.notes ?? null, f.isActive ?? 1);
          id = Number(r.lastInsertRowid);
        }
        const ins = db().prepare(`INSERT INTO manufacturing_formula_lines (formula_id, item_id, qty, waste_pct) VALUES (?, ?, ?, ?)`);
        for (const line of f.lines) {
          if (!line.itemId || parseFloat(line.qty) <= 0) throw new Error('Component quantity must be positive');
          if (line.itemId === f.outputItemId) throw new Error('Output item cannot be one of its own components');
          ins.run(id, line.itemId, line.qty, line.wastePct ?? '0');
        }
      })();
      audit(f.id ? 'update' : 'create', 'manufacturing_formula', id);
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('mfg:formulas:delete', (_e, id: number): SaveResult => {
    const used = db().prepare('SELECT COUNT(*) AS n FROM manufacturing_runs WHERE formula_id=?').get(id) as { n: number };
    if (used.n > 0) return { ok: false, error: 'Formula has production runs and cannot be deleted' };
    db().prepare('DELETE FROM manufacturing_formulas WHERE id=?').run(id);
    audit('delete', 'manufacturing_formula', id);
    return { ok: true };
  });

  ipcMain.handle('mfg:runs:list', () =>
    db().prepare(`SELECT r.id, r.serial, r.date, r.output_qty AS outputQty, r.notes,
                         r.out_movement_id AS outMovementId, r.in_movement_id AS inMovementId, r.journal_id AS journalId,
                         f.code AS formulaCode, f.name AS formulaName,
                         w.name AS warehouseName,
                         i.code AS outputItemCode, i.name AS outputItemName
                  FROM manufacturing_runs r
                  JOIN manufacturing_formulas f ON f.id=r.formula_id
                  JOIN warehouses w ON w.id=r.warehouse_id
                  JOIN items i ON i.id=f.output_item_id
                  ORDER BY r.date DESC, r.id DESC LIMIT 500`).all()
  );

  ipcMain.handle('mfg:runs:save', (_e, m: ManufactureInput): SaveResult => {
    try {
      requirePeriodOpen(m.date);
      const outQty = parseFloat(m.outputQty);
      if (!m.formulaId || !m.warehouseId || outQty <= 0) return { ok: false, error: 'Formula, warehouse, and output quantity are required' };
      const formula = db().prepare(`SELECT id, code, name, output_item_id AS outputItemId, output_qty AS outputQty
                                   FROM manufacturing_formulas WHERE id=? AND is_active=1`).get(m.formulaId) as
        { id: number; code: string; name: string; outputItemId: number; outputQty: string } | undefined;
      if (!formula) return { ok: false, error: 'Active formula not found' };
      const formulaLines = db().prepare(`SELECT item_id AS itemId, qty, waste_pct AS wastePct
                                        FROM manufacturing_formula_lines WHERE formula_id=?`).all(m.formulaId) as
        Array<{ itemId: number; qty: string; wastePct: string }>;
      if (!formulaLines.length) return { ok: false, error: 'Formula has no components' };

      const scale = outQty / parseFloat(formula.outputQty);
      const components = formulaLines.map(line => {
        const baseQty = parseFloat(line.qty) * scale;
        const waste = parseFloat(line.wastePct || '0') / 100;
        return { itemId: line.itemId, qty: baseQty * (1 + waste) };
      });
      for (const component of components) {
        const available = stockQty(component.itemId, m.warehouseId);
        if (available + 0.000001 < component.qty) throw new Error(`Insufficient stock for component #${component.itemId}`);
      }

      const serial = nextSerial('MFG');
      const outSerial = nextSerial('MFO');
      const inSerial = nextSerial('MFI');
      let runId = 0;
      let outMovementId = 0;
      let inMovementId = 0;
      let journalId: number | undefined;
      let totalCost = 0n;

      db().transaction(() => {
        const run = db().prepare(`INSERT INTO manufacturing_runs (serial, formula_id, date, warehouse_id, output_qty, notes)
                                  VALUES (?, ?, ?, ?, ?, ?)`).run(serial, m.formulaId, m.date, m.warehouseId, m.outputQty, m.notes ?? null);
        runId = Number(run.lastInsertRowid);

        const outMove = db().prepare(`INSERT INTO stock_movements (serial, date, kind, from_warehouse_id, to_warehouse_id, notes)
                                      VALUES (?, ?, 'adjust_out', ?, NULL, ?)`)
          .run(outSerial, m.date, m.warehouseId, `Manufacturing ${serial} components`);
        outMovementId = Number(outMove.lastInsertRowid);
        const insLine = db().prepare(`INSERT INTO stock_movement_lines (movement_id, item_id, qty, unit_cost_minor) VALUES (?, ?, ?, ?)`);
        for (const component of components) {
          const item = db().prepare('SELECT avg_cost_minor FROM items WHERE id=?').get(component.itemId) as { avg_cost_minor: string };
          const avg = BigInt(item.avg_cost_minor || '0');
          totalCost += amountForQty(avg, component.qty);
          insLine.run(outMovementId, component.itemId, String(component.qty), avg.toString());
          adjustStock(component.itemId, m.warehouseId, -component.qty);
        }

        const unitCost = totalCost > 0n ? (totalCost * 1000n / BigInt(Math.max(1, Math.round(outQty * 1000)))) : 0n;
        const inMove = db().prepare(`INSERT INTO stock_movements (serial, date, kind, from_warehouse_id, to_warehouse_id, notes)
                                     VALUES (?, ?, 'adjust_in', NULL, ?, ?)`)
          .run(inSerial, m.date, m.warehouseId, `Manufacturing ${serial} output`);
        inMovementId = Number(inMove.lastInsertRowid);
        insLine.run(inMovementId, formula.outputItemId, m.outputQty, unitCost.toString());
        adjustStock(formula.outputItemId, m.warehouseId, outQty);
        updateAvgCostForReceipt(formula.outputItemId, outQty, unitCost);

        if (totalCost > 0n) {
          const inventoryAcct = requireAcct('1130');
          const pr = postJournal({
            date: m.date,
            reference: serial,
            memo: `Manufacturing ${formula.code} ${serial}`,
            sourceType: 'manufacturing',
            sourceId: runId,
            lines: [
              { accountId: inventoryAcct, debitMinor: totalCost.toString(), creditMinor: '0', currency: 'USD', memo: `Finished goods ${serial}` },
              { accountId: inventoryAcct, debitMinor: '0', creditMinor: totalCost.toString(), currency: 'USD', memo: `Components ${serial}` }
            ]
          });
          if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
          journalId = pr.entryId;
        }

        db().prepare(`UPDATE manufacturing_runs SET out_movement_id=?, in_movement_id=?, journal_id=? WHERE id=?`)
          .run(outMovementId, inMovementId, journalId ?? null, runId);
        if (journalId) {
          db().prepare('UPDATE stock_movements SET journal_id=? WHERE id IN (?, ?)').run(journalId, outMovementId, inMovementId);
        }
      })();

      audit('create', 'manufacturing_run', runId, { serial, formulaId: m.formulaId });
      return { ok: true, id: runId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Account budgets ----------

interface BudgetInput { id?: number; accountId: number; period: string; amountMinor: string; notes?: string | null }

export const registerBudgets = (): void => {
  ipcMain.handle('budget:list', () =>
    db().prepare(`SELECT b.id, b.account_id AS accountId, b.period, b.amount_minor AS amountMinor, b.notes,
                         a.code AS accountCode, a.name AS accountName, a.type AS accountType
                  FROM account_budgets b JOIN accounts a ON a.id=b.account_id
                  ORDER BY b.period DESC, a.code`).all()
  );

  ipcMain.handle('budget:save', (_e, b: BudgetInput): SaveResult => {
    try {
      if (!b.accountId || !/^\d{4}-\d{2}$/.test(b.period) || BigInt(b.amountMinor || '0') < 0n) {
        return { ok: false, error: 'Account, month, and non-negative amount are required' };
      }
      if (b.id) {
        db().prepare(`UPDATE account_budgets SET account_id=?, period=?, amount_minor=?, notes=? WHERE id=?`)
          .run(b.accountId, b.period, b.amountMinor, b.notes ?? null, b.id);
        audit('update', 'account_budget', b.id);
        return { ok: true, id: b.id };
      }
      const r = db().prepare(`INSERT INTO account_budgets (account_id, period, amount_minor, notes)
                              VALUES (?, ?, ?, ?)
                              ON CONFLICT(account_id, period) DO UPDATE SET amount_minor=excluded.amount_minor, notes=excluded.notes`)
        .run(b.accountId, b.period, b.amountMinor, b.notes ?? null);
      const id = Number(r.lastInsertRowid || (db().prepare('SELECT id FROM account_budgets WHERE account_id=? AND period=?').get(b.accountId, b.period) as { id: number }).id);
      audit('create', 'account_budget', id);
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('budget:delete', (_e, id: number): SaveResult => {
    db().prepare('DELETE FROM account_budgets WHERE id=?').run(id);
    audit('delete', 'account_budget', id);
    return { ok: true };
  });

  ipcMain.handle('budget:report', (_e, fromDate: string, toDate: string) => {
    const fromPeriod = fromDate.slice(0, 7);
    const toPeriod = toDate.slice(0, 7);
    return db().prepare(`
      WITH actual AS (
        SELECT jl.account_id AS accountId,
               SUM(CASE WHEN a.type IN ('liability','equity','revenue')
                        THEN CAST(jl.credit_minor AS INTEGER) - CAST(jl.debit_minor AS INTEGER)
                        ELSE CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER) END) AS actualMinor
        FROM journal_lines jl
        JOIN journal_entries je ON je.id=jl.entry_id
        JOIN accounts a ON a.id=jl.account_id
        WHERE je.date BETWEEN ? AND ?
        GROUP BY jl.account_id
      ), budget AS (
        SELECT account_id AS accountId, SUM(CAST(amount_minor AS INTEGER)) AS budgetMinor
        FROM account_budgets
        WHERE period BETWEEN ? AND ?
        GROUP BY account_id
      )
      SELECT a.id AS accountId, a.code AS accountCode, a.name AS accountName, a.type AS accountType,
             COALESCE(b.budgetMinor, 0) AS budgetMinor,
             COALESCE(ac.actualMinor, 0) AS actualMinor,
             COALESCE(ac.actualMinor, 0) - COALESCE(b.budgetMinor, 0) AS varianceMinor
      FROM accounts a
      LEFT JOIN budget b ON b.accountId=a.id
      LEFT JOIN actual ac ON ac.accountId=a.id
      WHERE COALESCE(b.budgetMinor, 0) != 0 OR COALESCE(ac.actualMinor, 0) != 0
      ORDER BY a.code
    `).all(fromDate, toDate, fromPeriod, toPeriod);
  });
};

// ---------- Quotes ----------

interface QuoteInput {
  kind: 'sale' | 'purchase';
  date: string;
  validUntil?: string | null;
  partyId: number;
  currency: string;
  lines: Array<{ itemId: number; qty: string; unitPriceMinor: string; discountMinor?: string }>;
  discountMinor?: string;
  feesMinor?: string;
  notes?: string | null;
}

export const registerQuotes = (): void => {
  ipcMain.handle('quotes:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT id, kind, serial, date, valid_until AS validUntil, party_id AS partyId,
                                currency, subtotal_minor AS subtotalMinor, discount_minor AS discountMinor,
                                fees_minor AS feesMinor, grand_total_minor AS grandTotalMinor,
                                status, converted_invoice_id AS convertedInvoiceId, notes,
                                (SELECT name FROM parties WHERE id = party_id) AS partyName
                         FROM quotes ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('quotes:get', (_e, id: number) => {
    const q = db().prepare(`SELECT id, kind, serial, date, valid_until AS validUntil, party_id AS partyId,
                                   currency, subtotal_minor AS subtotalMinor, discount_minor AS discountMinor,
                                   fees_minor AS feesMinor, grand_total_minor AS grandTotalMinor,
                                   status, converted_invoice_id AS convertedInvoiceId, notes
                            FROM quotes WHERE id=?`).get(id);
    if (!q) return undefined;
    const lines = db().prepare(`SELECT ql.id, ql.item_id AS itemId, ql.qty,
                                       ql.unit_price_minor AS unitPriceMinor, ql.discount_minor AS discountMinor,
                                       ql.total_minor AS totalMinor,
                                       i.code AS itemCode, i.name AS itemName
                                FROM quote_lines ql JOIN items i ON i.id = ql.item_id
                                WHERE ql.quote_id=?`).all(id);
    return { ...q, lines };
  });

  ipcMain.handle('quotes:save', (_e, qIn: QuoteInput): SaveResult => {
    try {
      let subtotal = 0n;
      const computed = qIn.lines.map(l => {
        const qty = parseFloat(l.qty);
        if (qty <= 0) throw new Error('Invalid quote line');
        const unit = BigInt(l.unitPriceMinor || '0');
        const disc = BigInt(l.discountMinor || '0');
        const total = unit * BigInt(Math.round(qty * 100)) / 100n - disc;
        subtotal += total;
        return { itemId: l.itemId, qty: l.qty, unit, disc, total };
      });
      const disc = BigInt(qIn.discountMinor ?? '0');
      const fees = BigInt(qIn.feesMinor ?? '0');
      const grand = subtotal - disc + fees;
      const serial = nextSerial(qIn.kind === 'sale' ? 'QS' : 'QP');
      let qid = 0;
      db().transaction(() => {
        const r = db().prepare(`INSERT INTO quotes (kind, serial, date, valid_until, party_id, currency,
                                  subtotal_minor, discount_minor, fees_minor, grand_total_minor, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          qIn.kind, serial, qIn.date, qIn.validUntil ?? null, qIn.partyId, qIn.currency,
          subtotal.toString(), disc.toString(), fees.toString(), grand.toString(), qIn.notes ?? null
        );
        qid = Number(r.lastInsertRowid);
        const ins = db().prepare(`INSERT INTO quote_lines (quote_id, item_id, qty, unit_price_minor, discount_minor, total_minor)
                                  VALUES (?, ?, ?, ?, ?, ?)`);
        for (const l of computed) ins.run(qid, l.itemId, l.qty, l.unit.toString(), l.disc.toString(), l.total.toString());
      })();
      audit('create', 'quote', qid, { serial, kind: qIn.kind });
      return { ok: true, id: qid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('quotes:cancel', (_e, id: number): SaveResult => {
    db().prepare(`UPDATE quotes SET status='cancelled' WHERE id=?`).run(id);
    return { ok: true, id };
  });
};

// ---------- Orders ----------

interface OrderInput {
  kind: 'sale' | 'purchase';
  date: string;
  dueDate?: string | null;
  partyId: number;
  warehouseId?: number | null;
  currency: string;
  lines: Array<{ itemId: number; qty: string; unitPriceMinor: string; discountMinor?: string }>;
  discountMinor?: string;
  feesMinor?: string;
  notes?: string | null;
}

export const registerOrders = (): void => {
  ipcMain.handle('orders:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT id, kind, serial, date, due_date AS dueDate, party_id AS partyId,
                                warehouse_id AS warehouseId, currency, subtotal_minor AS subtotalMinor,
                                discount_minor AS discountMinor, fees_minor AS feesMinor,
                                grand_total_minor AS grandTotalMinor, status, notes,
                                (SELECT name FROM parties WHERE id = party_id) AS partyName,
                                (SELECT name FROM warehouses WHERE id = warehouse_id) AS warehouseName
                         FROM orders ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('orders:get', (_e, id: number) => {
    const o = db().prepare(`SELECT id, kind, serial, date, due_date AS dueDate, party_id AS partyId,
                                   warehouse_id AS warehouseId, currency, subtotal_minor AS subtotalMinor,
                                   discount_minor AS discountMinor, fees_minor AS feesMinor,
                                   grand_total_minor AS grandTotalMinor, status, notes
                            FROM orders WHERE id=?`).get(id);
    if (!o) return undefined;
    const lines = db().prepare(`SELECT ol.id, ol.item_id AS itemId, ol.qty, ol.qty_fulfilled AS qtyFulfilled,
                                       ol.unit_price_minor AS unitPriceMinor, ol.discount_minor AS discountMinor,
                                       ol.total_minor AS totalMinor,
                                       i.code AS itemCode, i.name AS itemName
                                FROM order_lines ol JOIN items i ON i.id = ol.item_id
                                WHERE ol.order_id=?`).all(id);
    return { ...o, lines };
  });

  ipcMain.handle('orders:save', (_e, o: OrderInput): SaveResult => {
    try {
      let subtotal = 0n;
      const computed = o.lines.map(l => {
        const qty = parseFloat(l.qty);
        if (qty <= 0) throw new Error('Invalid order line');
        const unit = BigInt(l.unitPriceMinor || '0');
        const disc = BigInt(l.discountMinor || '0');
        const total = unit * BigInt(Math.round(qty * 100)) / 100n - disc;
        subtotal += total;
        return { itemId: l.itemId, qty: l.qty, unit, disc, total };
      });
      const disc = BigInt(o.discountMinor ?? '0');
      const fees = BigInt(o.feesMinor ?? '0');
      const grand = subtotal - disc + fees;
      const serial = nextSerial(o.kind === 'sale' ? 'OS' : 'OP');
      let oid = 0;
      db().transaction(() => {
        const r = db().prepare(`INSERT INTO orders (kind, serial, date, due_date, party_id, warehouse_id, currency,
                                  subtotal_minor, discount_minor, fees_minor, grand_total_minor, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          o.kind, serial, o.date, o.dueDate ?? null, o.partyId, o.warehouseId ?? null, o.currency,
          subtotal.toString(), disc.toString(), fees.toString(), grand.toString(), o.notes ?? null
        );
        oid = Number(r.lastInsertRowid);
        const ins = db().prepare(`INSERT INTO order_lines (order_id, item_id, qty, unit_price_minor, discount_minor, total_minor)
                                  VALUES (?, ?, ?, ?, ?, ?)`);
        for (const l of computed) ins.run(oid, l.itemId, l.qty, l.unit.toString(), l.disc.toString(), l.total.toString());
      })();
      audit('create', 'order', oid, { serial, kind: o.kind });
      return { ok: true, id: oid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('orders:cancel', (_e, id: number): SaveResult => {
    db().prepare(`UPDATE orders SET status='cancelled' WHERE id=?`).run(id);
    return { ok: true, id };
  });
};

// ---------- Quote / Order conversion to Invoice ----------

interface ConvertArgs {
  id: number;
  warehouseId: number;
  paymentMode: 'cash' | 'credit';
  cashboxId?: number | null;
  date?: string;
}

interface DocLineRow {
  itemId: number; qty: string; unitPriceMinor: string; discountMinor: string;
}

interface DocHeader {
  id: number; kind: 'sale' | 'purchase'; partyId: number; currency: string;
  discountMinor: string; feesMinor: string; notes: string | null;
}

const buildInvoiceFromDoc = async (
  hdr: DocHeader,
  lines: DocLineRow[],
  args: ConvertArgs
): Promise<SaveResult> => {
  const { saveInvoiceCore } = await import('./invoices');
  const today = new Date().toISOString().slice(0, 10);
  return saveInvoiceCore({
    kind: hdr.kind, // 'sale' | 'purchase'
    date: args.date ?? today,
    partyId: hdr.partyId,
    warehouseId: args.warehouseId,
    paymentMode: args.paymentMode,
    cashboxId: args.paymentMode === 'cash' ? (args.cashboxId ?? null) : null,
    currency: hdr.currency,
    lines: lines.map(l => ({
      itemId: l.itemId,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor
    })),
    invDiscountMinor: hdr.discountMinor,
    feesMinor: hdr.feesMinor,
    notes: hdr.notes
  });
};

export const registerDocConversions = (): void => {
  ipcMain.handle('quotes:convert', async (_e, args: ConvertArgs): Promise<SaveResult> => {
    try {
      const q = db().prepare(`SELECT id, kind, party_id AS partyId, currency,
                                     discount_minor AS discountMinor, fees_minor AS feesMinor,
                                     notes, status
                              FROM quotes WHERE id=?`).get(args.id) as
        (DocHeader & { status: string }) | undefined;
      if (!q) throw new Error('Quote not found');
      if (q.status !== 'open') throw new Error(`Quote already ${q.status}`);
      const lines = db().prepare(`SELECT item_id AS itemId, qty,
                                          unit_price_minor AS unitPriceMinor,
                                          discount_minor AS discountMinor
                                   FROM quote_lines WHERE quote_id=?`).all(args.id) as DocLineRow[];
      const r = await buildInvoiceFromDoc(q, lines, args);
      if (!r.ok) throw new Error(r.error);
      db().prepare(`UPDATE quotes SET status='converted', converted_invoice_id=? WHERE id=?`)
        .run(r.id, args.id);
      audit('convert', 'quote', args.id, { invoiceId: r.id });
      return { ok: true, id: r.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('orders:convert', async (_e, args: ConvertArgs): Promise<SaveResult> => {
    try {
      const o = db().prepare(`SELECT id, kind, party_id AS partyId, currency,
                                     discount_minor AS discountMinor, fees_minor AS feesMinor,
                                     notes, status, warehouse_id AS warehouseId
                              FROM orders WHERE id=?`).get(args.id) as
        (DocHeader & { status: string; warehouseId: number | null }) | undefined;
      if (!o) throw new Error('Order not found');
      if (o.status === 'cancelled' || o.status === 'fulfilled') throw new Error(`Order already ${o.status}`);
      const lines = db().prepare(`SELECT item_id AS itemId, qty,
                                          unit_price_minor AS unitPriceMinor,
                                          discount_minor AS discountMinor
                                   FROM order_lines WHERE order_id=?`).all(args.id) as DocLineRow[];
      const r = await buildInvoiceFromDoc(o, lines, { ...args, warehouseId: args.warehouseId ?? o.warehouseId ?? 1 });
      if (!r.ok) throw new Error(r.error);
      db().prepare(`UPDATE orders SET status='fulfilled' WHERE id=?`).run(args.id);
      // mark all lines fully fulfilled
      db().prepare(`UPDATE order_lines SET qty_fulfilled=qty WHERE order_id=?`).run(args.id);
      audit('convert', 'order', args.id, { invoiceId: r.id });
      return { ok: true, id: r.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Expense vouchers ----------
// Posts: Dr expense_account / Cr cashbox_account.

interface ExpenseInput {
  date: string;
  expenseAccountId: number;
  cashboxId: number;
  amountMinor: string;
  currency: string;
  partyId?: number | null; // optional supplier reference for paper trail
  departmentId?: number | null;
  projectId?: number | null;
  funderId?: number | null;
  notes?: string | null;
}

export const registerExpenseVouchers = (): void => {
  ipcMain.handle('expense:list', () =>
    db().prepare(`SELECT v.id, v.serial, v.date, v.party_id AS partyId, v.cashbox_id AS cashboxId,
                          v.expense_account_id AS expenseAccountId,
                          v.currency, v.amount_minor AS amountMinor, v.notes, v.journal_id AS journalId,
                          v.department_id AS departmentId, v.project_id AS projectId, v.funder_id AS funderId,
                          (SELECT name FROM parties WHERE id = v.party_id) AS partyName,
                          (SELECT name FROM accounts WHERE id = v.expense_account_id) AS expenseAccountName,
                          (SELECT name FROM cashboxes WHERE id = v.cashbox_id) AS cashboxName
                  FROM vouchers v WHERE v.kind='payment' AND v.expense_account_id IS NOT NULL
                  ORDER BY v.date DESC, v.id DESC LIMIT 500`).all()
  );

  ipcMain.handle('expense:save', (_e, x: ExpenseInput): SaveResult => {
    try {
      requirePeriodOpen(x.date);
      const cashbox = db().prepare(`SELECT account_id FROM cashboxes WHERE id=?`).get(x.cashboxId) as { account_id: number } | undefined;
      if (!cashbox) throw new Error('Cashbox missing');
      const serial = nextSerial('EX');
      const amount = BigInt(x.amountMinor);
      let vid = 0;
      let jid = 0;

      db().transaction(() => {
        // Use a sentinel party — pick any party or null. The vouchers schema requires party_id NOT NULL,
        // but we can store the supplier if provided, otherwise create or pick a generic "Misc" party.
        let partyId = x.partyId ?? null;
        if (partyId == null) {
          const generic = db().prepare(`SELECT id FROM parties WHERE code='MISC' LIMIT 1`).get() as { id: number } | undefined;
          if (generic) partyId = generic.id;
          else {
            const r = db().prepare(`INSERT INTO parties (code, name, name_en, kind) VALUES ('MISC','مصاريف عامة','Miscellaneous','supplier')`).run();
            partyId = Number(r.lastInsertRowid);
          }
        }

        const r = db().prepare(`INSERT INTO vouchers (kind, serial, date, party_id, cashbox_id, currency, amount_minor, notes,
                                  expense_account_id, department_id, project_id, funder_id)
                                VALUES ('payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          serial, x.date, partyId, x.cashboxId, x.currency, amount.toString(), x.notes ?? null,
          x.expenseAccountId, x.departmentId ?? null, x.projectId ?? null, x.funderId ?? null
        );
        vid = Number(r.lastInsertRowid);

        const lines: JournalLineDto[] = [
          { accountId: x.expenseAccountId, debitMinor: amount.toString(), creditMinor: '0', currency: x.currency, memo: `Expense ${serial}` },
          { accountId: cashbox.account_id, debitMinor: '0', creditMinor: amount.toString(), currency: x.currency, memo: `Expense ${serial}` }
        ];
        const pr = postJournal({ date: x.date, reference: serial, memo: `Expense ${serial}`, sourceType: 'expense', sourceId: vid, lines });
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        jid = pr.entryId!;
        db().prepare(`UPDATE vouchers SET journal_id=? WHERE id=?`).run(jid, vid);

        // Tag analytical dimensions on journal_lines
        if (x.departmentId || x.projectId || x.funderId) {
          db().prepare(`UPDATE journal_lines SET department_id=?, project_id=?, funder_id=? WHERE entry_id=?`)
            .run(x.departmentId ?? null, x.projectId ?? null, x.funderId ?? null, jid);
        }
      })();
      audit('create', 'expense', vid, { serial });
      return { ok: true, id: vid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Employees ----------

export const registerEmployees = (): void => {
  ipcMain.handle('emp:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, party_id AS partyId, hire_date AS hireDate,
                          job_title AS jobTitle, basic_salary_minor AS basicSalaryMinor,
                          allowance_minor AS allowanceMinor, payable_account_id AS payableAccountId,
                          phone, email, notes, is_active AS isActive
                   FROM employees ORDER BY code`).all()
  );

  ipcMain.handle('emp:save', (_e, em: {
    id?: number; code: string; name: string; nameEn?: string; partyId?: number | null;
    hireDate?: string; jobTitle?: string; basicSalaryMinor?: string; allowanceMinor?: string;
    payableAccountId?: number; phone?: string; email?: string; notes?: string; isActive?: number;
  }): SaveResult => {
    if (em.id) {
      db().prepare(`UPDATE employees SET code=?, name=?, name_en=?, party_id=?, hire_date=?, job_title=?,
                      basic_salary_minor=?, allowance_minor=?, payable_account_id=?, phone=?, email=?, notes=?, is_active=?
                    WHERE id=?`).run(em.code, em.name, em.nameEn ?? null, em.partyId ?? null, em.hireDate ?? null,
        em.jobTitle ?? null, em.basicSalaryMinor ?? '0', em.allowanceMinor ?? '0',
        em.payableAccountId ?? null, em.phone ?? null, em.email ?? null, em.notes ?? null, em.isActive ?? 1, em.id);
      return { ok: true, id: em.id };
    }
    const r = db().prepare(`INSERT INTO employees (code, name, name_en, party_id, hire_date, job_title,
                              basic_salary_minor, allowance_minor, payable_account_id, phone, email, notes, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(em.code, em.name, em.nameEn ?? null,
      em.partyId ?? null, em.hireDate ?? null, em.jobTitle ?? null,
      em.basicSalaryMinor ?? '0', em.allowanceMinor ?? '0',
      em.payableAccountId ?? null, em.phone ?? null, em.email ?? null, em.notes ?? null, em.isActive ?? 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('emp:delete', (_e, id: number): SaveResult => {
    const used = db().prepare('SELECT COUNT(*) AS n FROM payroll_lines WHERE employee_id=?').get(id) as { n: number };
    if (used.n > 0) return { ok: false, error: 'Employee referenced in payroll' };
    db().prepare(`DELETE FROM employees WHERE id=?`).run(id);
    return { ok: true };
  });
};

// ---------- Payroll ----------

interface PayrollInput {
  period: string;
  date: string;
  currency: string;
  salaryAccountId: number;
  payableAccountId: number;
  paymentAccountId?: number | null;
  notes?: string | null;
  lines: Array<{
    employeeId: number;
    basicMinor: string;
    allowanceMinor?: string;
    overtimeMinor?: string;
    deductionsMinor?: string;
    paidMinor?: string;
    notes?: string;
  }>;
}

export const registerPayroll = (): void => {
  ipcMain.handle('pay:list', () =>
    db().prepare(`SELECT id, serial, period, date, currency,
                          salary_account_id AS salaryAccountId, payable_account_id AS payableAccountId,
                          payment_account_id AS paymentAccountId, total_minor AS totalMinor, paid_minor AS paidMinor,
                          notes, journal_id AS journalId, status
                   FROM payroll_sheets ORDER BY period DESC, id DESC LIMIT 200`).all()
  );

  ipcMain.handle('pay:get', (_e, id: number) => {
    const sheet = db().prepare(`SELECT id, serial, period, date, currency,
                                       salary_account_id AS salaryAccountId, payable_account_id AS payableAccountId,
                                       payment_account_id AS paymentAccountId, total_minor AS totalMinor,
                                       paid_minor AS paidMinor, notes, journal_id AS journalId, status
                                FROM payroll_sheets WHERE id=?`).get(id);
    if (!sheet) return undefined;
    const lines = db().prepare(`SELECT pl.id, pl.employee_id AS employeeId,
                                       pl.basic_minor AS basicMinor, pl.allowance_minor AS allowanceMinor,
                                       pl.overtime_minor AS overtimeMinor, pl.deductions_minor AS deductionsMinor,
                                       pl.net_minor AS netMinor, pl.paid_minor AS paidMinor, pl.notes,
                                       e.code AS empCode, e.name AS empName
                                FROM payroll_lines pl JOIN employees e ON e.id = pl.employee_id
                                WHERE pl.sheet_id=?`).all(id);
    return { ...sheet, lines };
  });

  ipcMain.handle('pay:save', (_e, p: PayrollInput): SaveResult => {
    try {
      requirePeriodOpen(p.date);
      const serial = nextSerial('PR');
      let totalNet = 0n;
      let totalPaid = 0n;
      const computed = p.lines.map(l => {
        const basic = BigInt(l.basicMinor || '0');
        const allow = BigInt(l.allowanceMinor ?? '0');
        const ot = BigInt(l.overtimeMinor ?? '0');
        const ded = BigInt(l.deductionsMinor ?? '0');
        const net = basic + allow + ot - ded;
        const paid = BigInt(l.paidMinor ?? '0');
        totalNet += net;
        totalPaid += paid;
        return { ...l, basic, allow, ot, ded, net, paid };
      });

      let sid = 0;
      let jid = 0;
      db().transaction(() => {
        const r = db().prepare(`INSERT INTO payroll_sheets (serial, period, date, currency,
                                  salary_account_id, payable_account_id, payment_account_id,
                                  total_minor, paid_minor, notes, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')`).run(
          serial, p.period, p.date, p.currency, p.salaryAccountId, p.payableAccountId,
          p.paymentAccountId ?? null, totalNet.toString(), totalPaid.toString(), p.notes ?? null
        );
        sid = Number(r.lastInsertRowid);

        const ins = db().prepare(`INSERT INTO payroll_lines (sheet_id, employee_id, basic_minor, allowance_minor,
                                    overtime_minor, deductions_minor, net_minor, paid_minor, notes)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const l of computed) {
          ins.run(sid, l.employeeId, l.basic.toString(), l.allow.toString(), l.ot.toString(),
            l.ded.toString(), l.net.toString(), l.paid.toString(), l.notes ?? null);
        }

        // JE: Dr Salaries Expense / Cr Salaries Payable. If paid > 0: Dr Salaries Payable / Cr Cash.
        const lines: JournalLineDto[] = [];
        if (totalNet > 0n) {
          lines.push({ accountId: p.salaryAccountId, debitMinor: totalNet.toString(), creditMinor: '0', currency: p.currency, memo: `Payroll ${serial}` });
          lines.push({ accountId: p.payableAccountId, debitMinor: '0', creditMinor: totalNet.toString(), currency: p.currency, memo: `Payroll ${serial}` });
        }
        if (totalPaid > 0n && p.paymentAccountId) {
          lines.push({ accountId: p.payableAccountId, debitMinor: totalPaid.toString(), creditMinor: '0', currency: p.currency, memo: `Payroll paid ${serial}` });
          lines.push({ accountId: p.paymentAccountId, debitMinor: '0', creditMinor: totalPaid.toString(), currency: p.currency, memo: `Payroll paid ${serial}` });
        }
        if (lines.length) {
          const pr = postJournal({ date: p.date, reference: serial, memo: `Payroll ${p.period}`, sourceType: 'payroll', sourceId: sid, lines });
          if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
          jid = pr.entryId!;
          db().prepare(`UPDATE payroll_sheets SET journal_id=? WHERE id=?`).run(jid, sid);
        }
      })();
      audit('create', 'payroll', sid, { serial });
      return { ok: true, id: sid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Assets + Depreciation ----------

interface AssetInput {
  id?: number;
  code: string;
  name: string;
  nameEn?: string;
  acqDate: string;
  costMinor: string;
  salvageMinor?: string;
  usefulLifeMonths: number;
  assetAccountId: number;
  accumAccountId: number;
  expenseAccountId: number;
  notes?: string | null;
}

export const registerAssets = (): void => {
  ipcMain.handle('asset:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, acq_date AS acqDate,
                          cost_minor AS costMinor, salvage_minor AS salvageMinor,
                          useful_life_months AS usefulLifeMonths, method,
                          asset_account_id AS assetAccountId, accum_account_id AS accumAccountId,
                          expense_account_id AS expenseAccountId,
                          accumulated_minor AS accumulatedMinor, status, notes
                   FROM assets ORDER BY code`).all()
  );

  ipcMain.handle('asset:save', (_e, a: AssetInput): SaveResult => {
    if (a.id) {
      db().prepare(`UPDATE assets SET code=?, name=?, name_en=?, acq_date=?, cost_minor=?, salvage_minor=?,
                      useful_life_months=?, asset_account_id=?, accum_account_id=?, expense_account_id=?, notes=?
                    WHERE id=?`).run(a.code, a.name, a.nameEn ?? null, a.acqDate, a.costMinor, a.salvageMinor ?? '0',
        a.usefulLifeMonths, a.assetAccountId, a.accumAccountId, a.expenseAccountId, a.notes ?? null, a.id);
      return { ok: true, id: a.id };
    }
    const r = db().prepare(`INSERT INTO assets (code, name, name_en, acq_date, cost_minor, salvage_minor,
                              useful_life_months, asset_account_id, accum_account_id, expense_account_id, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      a.code, a.name, a.nameEn ?? null, a.acqDate, a.costMinor, a.salvageMinor ?? '0',
      a.usefulLifeMonths, a.assetAccountId, a.accumAccountId, a.expenseAccountId, a.notes ?? null);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('asset:delete', (_e, id: number): SaveResult => {
    const has = db().prepare('SELECT COUNT(*) AS n FROM depreciation_runs WHERE asset_id=?').get(id) as { n: number };
    if (has.n > 0) return { ok: false, error: 'Asset has depreciation runs' };
    db().prepare('DELETE FROM assets WHERE id=?').run(id);
    return { ok: true };
  });

  ipcMain.handle('asset:depreciate', (_e, args: { assetId: number; period: string; date: string }): SaveResult => {
    try {
      requirePeriodOpen(args.date);
      const a = db().prepare(`SELECT * FROM assets WHERE id=?`).get(args.assetId) as {
        id: number; cost_minor: string; salvage_minor: string; useful_life_months: number;
        asset_account_id: number; accum_account_id: number; expense_account_id: number;
        accumulated_minor: string; status: string;
      } | undefined;
      if (!a) throw new Error('Asset missing');
      if (a.status !== 'active') throw new Error('Asset not active');

      const cost = BigInt(a.cost_minor);
      const salvage = BigInt(a.salvage_minor);
      const monthly = (cost - salvage) / BigInt(a.useful_life_months);
      const accumulated = BigInt(a.accumulated_minor);
      const remaining = (cost - salvage) - accumulated;
      const amount = monthly < remaining ? monthly : remaining;
      if (amount <= 0n) throw new Error('Asset fully depreciated');

      let runId = 0;
      let jid = 0;
      db().transaction(() => {
        const r = db().prepare(`INSERT INTO depreciation_runs (asset_id, period, date, amount_minor) VALUES (?, ?, ?, ?)`)
          .run(args.assetId, args.period, args.date, amount.toString());
        runId = Number(r.lastInsertRowid);

        const lines: JournalLineDto[] = [
          { accountId: a.expense_account_id, debitMinor: amount.toString(), creditMinor: '0', currency: 'USD', memo: `Depreciation ${args.period}` },
          { accountId: a.accum_account_id, debitMinor: '0', creditMinor: amount.toString(), currency: 'USD', memo: `Depreciation ${args.period}` }
        ];
        const pr = postJournal({ date: args.date, reference: `DEP-${args.assetId}-${args.period}`, memo: `Depreciation ${args.period}`, sourceType: 'depreciation', sourceId: runId, lines });
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        jid = pr.entryId!;
        db().prepare(`UPDATE depreciation_runs SET journal_id=? WHERE id=?`).run(jid, runId);
        db().prepare(`UPDATE assets SET accumulated_minor=? WHERE id=?`).run((accumulated + amount).toString(), args.assetId);
      })();

      return { ok: true, id: runId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('asset:runs', (_e, assetId: number) =>
    db().prepare(`SELECT id, asset_id AS assetId, period, date, amount_minor AS amountMinor, journal_id AS journalId
                   FROM depreciation_runs WHERE asset_id=? ORDER BY period DESC`).all(assetId)
  );
};

// ---------- Period locks ----------

export const registerPeriodLocks = (): void => {
  ipcMain.handle('lock:list', () =>
    db().prepare(`SELECT id, start_date AS startDate, end_date AS endDate, reason, locked_at AS lockedAt
                   FROM period_locks ORDER BY end_date DESC`).all()
  );
  ipcMain.handle('lock:save', (_e, l: { id?: number; startDate: string; endDate: string; reason?: string }): SaveResult => {
    if (l.id) {
      db().prepare(`UPDATE period_locks SET start_date=?, end_date=?, reason=? WHERE id=?`)
        .run(l.startDate, l.endDate, l.reason ?? null, l.id);
      return { ok: true, id: l.id };
    }
    const r = db().prepare(`INSERT INTO period_locks (start_date, end_date, reason) VALUES (?, ?, ?)`)
      .run(l.startDate, l.endDate, l.reason ?? null);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('lock:delete', (_e, id: number): SaveResult => {
    db().prepare(`DELETE FROM period_locks WHERE id=?`).run(id);
    return { ok: true };
  });
};

// ---------- Backup / Restore ----------

export const registerBackup = (): void => {
  ipcMain.handle('backup:save', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const s = S();
    const res = await dialog.showSaveDialog(win!, {
      title: s.backupTitle,
      defaultPath: `mohasib-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: s.sqliteFiles, extensions: ['db'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, error: 'cancelled' };
    try {
      // SQLite's online backup API, so the copy includes everything still
      // sitting in the write-ahead log.
      await db().backup(res.filePath);
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const s = S();
    const res = await dialog.showOpenDialog(win!, {
      title: s.restoreTitle,
      properties: ['openFile'],
      filters: [{ name: s.sqliteFiles, extensions: ['db'] }]
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'cancelled' };

    try {
      assertRestorableDatabase(res.filePaths[0]);
    } catch (e) {
      return { ok: false, error: `${s.notADatabase} (${(e as Error).message})` };
    }

    const confirm = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: [s.cancel, s.replace],
      defaultId: 0,
      cancelId: 0,
      message: s.restoreWarning,
      detail: s.restoreWarningDetail
    });
    if (confirm.response !== 1) return { ok: false, error: 'cancelled' };

    const current = dbPath();
    const safety = `${current}.before-restore-${Date.now()}.db`;
    try {
      // Safety copy through the backup API, not copyFileSync: the database is
      // in WAL mode, so a raw copy of the main file silently omits every
      // committed page still in the -wal — the fallback would be missing
      // exactly the recent work the user is most likely to want back.
      await db().backup(safety);

      // Closing checkpoints and releases the WAL. Overwriting the main file
      // while it is open leaves a -wal that belongs to the *old* database; on
      // the next open SQLite replays it over the restored pages and the
      // restore quietly reverts itself.
      closeDb();
      replaceDatabaseFile(current, res.filePaths[0]);

      const reopened = openCompany(current);
      runMigrations(reopened);

      void dialog.showMessageBox(win!, {
        type: 'info',
        message: s.restoreDoneTitle,
        detail: s.restoreDoneDetail,
        buttons: ['OK']
      });
      return { ok: true, path: res.filePaths[0], safetyCopy: safety };
    } catch (e) {
      // Never leave the app holding a closed handle: get the original back.
      try { closeDb(); } catch { /* already closed */ }
      try {
        dropWalSidecars(current);
        copyFileSync(safety, current);
        runMigrations(openCompany(current));
      } catch { /* the safety copy path is reported below */ }
      return { ok: false, error: (e as Error).message, safetyCopy: safety };
    }
  });
};

// ---------- Audit validators ----------

export const registerAuditReports = (): void => {
  ipcMain.handle('audit:run', () => {
    const issues: Array<{ severity: 'warn' | 'error'; entity: string; id?: number; message: string }> = [];

    // 1. Out-of-period transactions: any journal entry whose date falls inside an existing period_lock
    const oop = db().prepare(`SELECT je.id, je.date, pl.start_date, pl.end_date
                              FROM journal_entries je JOIN period_locks pl
                              ON date(je.date) BETWEEN date(pl.start_date) AND date(pl.end_date)
                              ORDER BY je.date`).all() as Array<{ id: number; date: string; start_date: string; end_date: string }>;
    for (const r of oop) {
      issues.push({ severity: 'warn', entity: 'journal', id: r.id, message: `Entry dated ${r.date} sits inside locked period (${r.start_date} → ${r.end_date})` });
    }

    // 2. Unbalanced journal entries
    const unbal = db().prepare(`SELECT entry_id,
                                       SUM(CAST(debit_minor AS REAL))  AS d,
                                       SUM(CAST(credit_minor AS REAL)) AS c
                                FROM journal_lines GROUP BY entry_id
                                HAVING ROUND(d,2) != ROUND(c,2)`).all() as Array<{ entry_id: number; d: number; c: number }>;
    for (const r of unbal) {
      issues.push({ severity: 'error', entity: 'journal', id: r.entry_id, message: `Entry #${r.entry_id} unbalanced (D=${r.d.toFixed(2)} vs C=${r.c.toFixed(2)})` });
    }

    // 3. Accounts whose balance contradicts their nature
    const wrongNature = db().prepare(`SELECT a.id, a.code, a.name, a.type,
                                              SUM(CAST(jl.debit_minor AS REAL) - CAST(jl.credit_minor AS REAL)) AS bal
                                       FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
                                       GROUP BY a.id
                                       HAVING (a.type IN ('asset','expense') AND bal < -1)
                                           OR (a.type IN ('liability','equity','revenue') AND bal > 1)`).all() as Array<{ id: number; code: string; name: string; type: string; bal: number }>;
    for (const r of wrongNature) {
      issues.push({ severity: 'warn', entity: 'account', id: r.id, message: `${r.code} ${r.name} (${r.type}) has unnatural balance ${(r.bal / 100).toFixed(2)}` });
    }

    // 4. Negative stock
    const negStock = db().prepare(`SELECT i.code, i.name, w.name AS wname, s.qty
                                    FROM item_stock s JOIN items i ON i.id = s.item_id JOIN warehouses w ON w.id = s.warehouse_id
                                    WHERE CAST(s.qty AS REAL) < 0`).all() as Array<{ code: string; name: string; wname: string; qty: string }>;
    for (const r of negStock) {
      issues.push({ severity: 'warn', entity: 'item', message: `${r.code} ${r.name} has negative stock (${r.qty}) at ${r.wname}` });
    }

    // 5. Parties without AR/AP routing
    const noRoute = db().prepare(`SELECT id, code, name, kind FROM parties
                                  WHERE (kind IN ('customer','both') AND ar_account_id IS NULL)
                                     OR (kind IN ('supplier','both') AND ap_account_id IS NULL)`).all() as Array<{ id: number; code: string; name: string; kind: string }>;
    for (const r of noRoute) {
      issues.push({ severity: 'error', entity: 'party', id: r.id, message: `${r.code} ${r.name} (${r.kind}) is missing AR/AP routing` });
    }

    return { issues, runAt: new Date().toISOString() };
  });
};

// ---------- Year rollover ----------

export const registerRollover = (): void => {
  ipcMain.handle('rollover:run', async (_e, args: { closeDate: string; openDate: string }): Promise<SaveResult> => {
    try {
      requirePeriodOpen(args.closeDate);
      // Compute closing balances for non-temp accounts (assets/liab/equity).
      // Net P/L from revenue - expense → push into Retained Earnings.
      const tb = db().prepare(`SELECT a.id, a.type,
                                      SUM(CAST(jl.debit_minor AS REAL) - CAST(jl.credit_minor AS REAL)) AS bal
                               FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
                               JOIN journal_entries je ON je.id = jl.entry_id
                               WHERE date(je.date) <= date(?)
                               GROUP BY a.id`).all(args.closeDate) as Array<{ id: number; type: string; bal: number }>;

      const retainedAcct = requireAcct('3200');
      let netIncome = 0;
      const closingLines: JournalLineDto[] = [];
      for (const r of tb) {
        if (r.type === 'revenue' && r.bal !== 0) {
          // Revenue normally credit balance => bal negative; close: Dr Revenue / Cr RE.
          closingLines.push({ accountId: r.id, debitMinor: Math.round(-r.bal).toString(), creditMinor: '0', currency: 'USD', memo: 'Year close' });
          netIncome += -r.bal;
        } else if (r.type === 'expense' && r.bal !== 0) {
          closingLines.push({ accountId: r.id, debitMinor: '0', creditMinor: Math.round(r.bal).toString(), currency: 'USD', memo: 'Year close' });
          netIncome -= r.bal;
        }
      }
      if (closingLines.length) {
        // Net income → Retained Earnings (credit if profit, debit if loss)
        if (netIncome > 0) {
          closingLines.push({ accountId: retainedAcct, debitMinor: '0', creditMinor: Math.round(netIncome).toString(), currency: 'USD', memo: 'Net income to RE' });
        } else if (netIncome < 0) {
          closingLines.push({ accountId: retainedAcct, debitMinor: Math.round(-netIncome).toString(), creditMinor: '0', currency: 'USD', memo: 'Net loss to RE' });
        }
        const pr = postJournal({ date: args.closeDate, reference: 'YEAR-CLOSE', memo: `Year-close ${args.closeDate}`, sourceType: 'rollover', sourceId: 0, lines: closingLines });
        if (!pr.ok) throw new Error('Closing post failed');
      }

      // Lock the closed period
      db().prepare(`INSERT INTO period_locks (start_date, end_date, reason) VALUES ('1900-01-01', ?, ?)`)
        .run(args.closeDate, `Year-end close at ${args.closeDate}`);

      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Banks ----------

interface BankInput {
  id?: number; code: string; name: string; nameEn?: string | null;
  branch?: string | null; address?: string | null; phone?: string | null;
  accountNo?: string | null; notes?: string | null; isActive?: number;
}

export const registerBanks = (): void => {
  ipcMain.handle('bank:list', () =>
    db().prepare(`SELECT id, code, name, name_en AS nameEn, branch, address, phone,
                          account_no AS accountNo, notes, is_active AS isActive
                   FROM banks ORDER BY code`).all()
  );
  ipcMain.handle('bank:save', (_e, b: BankInput): SaveResult => {
    if (b.id) {
      db().prepare(`UPDATE banks SET code=?, name=?, name_en=?, branch=?, address=?, phone=?, account_no=?, notes=?, is_active=? WHERE id=?`)
        .run(b.code, b.name, b.nameEn ?? null, b.branch ?? null, b.address ?? null, b.phone ?? null, b.accountNo ?? null, b.notes ?? null, b.isActive ?? 1, b.id);
      return { ok: true, id: b.id };
    }
    const r = db().prepare(`INSERT INTO banks (code, name, name_en, branch, address, phone, account_no, notes, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.code, b.name, b.nameEn ?? null, b.branch ?? null, b.address ?? null, b.phone ?? null, b.accountNo ?? null, b.notes ?? null, b.isActive ?? 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  ipcMain.handle('bank:delete', (_e, id: number): SaveResult => {
    try { db().prepare(`DELETE FROM banks WHERE id=?`).run(id); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });
};

// ---------- Debit / Credit notes ----------

type NoteKind = 'debit_customer' | 'credit_customer' | 'debit_supplier' | 'credit_supplier';

interface NoteInput {
  kind: NoteKind;
  date: string;
  partyId: number;
  accountId: number;     // offset account (revenue/expense/etc.)
  currency: string;
  amountMinor: string;
  notes?: string | null;
}

const NOTE_PREFIX: Record<NoteKind, string> = {
  debit_customer: 'DNC', credit_customer: 'CNC',
  debit_supplier: 'DNS', credit_supplier: 'CNS'
};

export const registerNotes = (): void => {
  ipcMain.handle('note:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE n.kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT n.id, n.kind, n.serial, n.date, n.party_id AS partyId,
                                n.account_id AS accountId, n.currency, n.amount_minor AS amountMinor,
                                n.notes, n.journal_id AS journalId,
                                (SELECT name FROM parties WHERE id = n.party_id) AS partyName,
                                (SELECT code || ' ' || name FROM accounts WHERE id = n.account_id) AS accountName
                         FROM notes_docs n ${where} ORDER BY n.date DESC, n.id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('note:save', (_e, n: NoteInput): SaveResult => {
    try {
      requirePeriodOpen(n.date);
      const serial = nextSerial(NOTE_PREFIX[n.kind]);
      const amount = BigInt(n.amountMinor);
      let nid = 0;
      let jid = 0;

      db().transaction(() => {
        const r = db().prepare(`INSERT INTO notes_docs (kind, serial, date, party_id, account_id, currency, amount_minor, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(n.kind, serial, n.date, n.partyId, n.accountId, n.currency, amount.toString(), n.notes ?? null);
        nid = Number(r.lastInsertRowid);

        // Look up party AR/AP
        const party = db().prepare(`SELECT ar_account_id AS ar, ap_account_id AS ap FROM parties WHERE id=?`).get(n.partyId) as
          { ar: number | null; ap: number | null } | undefined;
        if (!party) throw new Error('Party not found');

        const lines: JournalLineDto[] = [];
        // debit_customer: Dr customer AR / Cr offset account (extra charge billed to customer)
        // credit_customer: Dr offset / Cr customer AR (rebate / refund)
        // debit_supplier: Dr supplier AP / Cr offset (we charge back the supplier — reduces AP)
        // credit_supplier: Dr offset / Cr supplier AP (extra charge from supplier — increases AP)
        if (n.kind === 'debit_customer') {
          if (party.ar == null) throw new Error('Customer missing AR account');
          lines.push({ accountId: party.ar, debitMinor: amount.toString(), creditMinor: '0', currency: n.currency, memo: `Debit note ${serial}` });
          lines.push({ accountId: n.accountId, debitMinor: '0', creditMinor: amount.toString(), currency: n.currency, memo: `Debit note ${serial}` });
        } else if (n.kind === 'credit_customer') {
          if (party.ar == null) throw new Error('Customer missing AR account');
          lines.push({ accountId: n.accountId, debitMinor: amount.toString(), creditMinor: '0', currency: n.currency, memo: `Credit note ${serial}` });
          lines.push({ accountId: party.ar, debitMinor: '0', creditMinor: amount.toString(), currency: n.currency, memo: `Credit note ${serial}` });
        } else if (n.kind === 'debit_supplier') {
          if (party.ap == null) throw new Error('Supplier missing AP account');
          lines.push({ accountId: party.ap, debitMinor: amount.toString(), creditMinor: '0', currency: n.currency, memo: `Debit note ${serial}` });
          lines.push({ accountId: n.accountId, debitMinor: '0', creditMinor: amount.toString(), currency: n.currency, memo: `Debit note ${serial}` });
        } else if (n.kind === 'credit_supplier') {
          if (party.ap == null) throw new Error('Supplier missing AP account');
          lines.push({ accountId: n.accountId, debitMinor: amount.toString(), creditMinor: '0', currency: n.currency, memo: `Credit note ${serial}` });
          lines.push({ accountId: party.ap, debitMinor: '0', creditMinor: amount.toString(), currency: n.currency, memo: `Credit note ${serial}` });
        }

        const pr = postJournal({ date: n.date, reference: serial, memo: `${n.kind} ${serial}`, sourceType: 'note', sourceId: nid, lines });
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        jid = pr.entryId!;
        db().prepare(`UPDATE notes_docs SET journal_id=? WHERE id=?`).run(jid, nid);
      })();

      audit('create', 'note', nid, { kind: n.kind, serial });
      return { ok: true, id: nid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Multi-party vouchers ----------

interface MultiVoucherInput {
  kind: 'receipt' | 'payment';
  date: string;
  cashboxId: number;
  currency: string;
  notes?: string | null;
  lines: Array<{ partyId: number; amountMinor: string; memo?: string | null }>;
}

export const registerMultiVouchers = (): void => {
  ipcMain.handle('mvouch:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT id, kind, serial, date, cashbox_id AS cashboxId, currency,
                                total_minor AS totalMinor, notes, journal_id AS journalId,
                                (SELECT name FROM cashboxes WHERE id = cashbox_id) AS cashboxName
                         FROM multi_vouchers ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('mvouch:get', (_e, id: number) => {
    const v = db().prepare(`SELECT id, kind, serial, date, cashbox_id AS cashboxId, currency,
                                   total_minor AS totalMinor, notes, journal_id AS journalId
                            FROM multi_vouchers WHERE id=?`).get(id);
    if (!v) return undefined;
    const lines = db().prepare(`SELECT id, party_id AS partyId, amount_minor AS amountMinor, memo,
                                       (SELECT name FROM parties WHERE id = party_id) AS partyName
                                FROM multi_voucher_lines WHERE voucher_id=?`).all(id);
    return { ...v, lines };
  });

  ipcMain.handle('mvouch:save', (_e, v: MultiVoucherInput): SaveResult => {
    try {
      requirePeriodOpen(v.date);
      const cashbox = db().prepare(`SELECT account_id FROM cashboxes WHERE id=?`).get(v.cashboxId) as { account_id: number } | undefined;
      if (!cashbox) throw new Error('Cashbox missing');
      const serial = nextSerial(v.kind === 'receipt' ? 'MR' : 'MP');

      let total = 0n;
      const computed = v.lines.map(l => {
        const amt = BigInt(l.amountMinor);
        if (amt <= 0n) throw new Error('Invalid voucher line amount');
        total += amt;
        return { partyId: l.partyId, amount: amt, memo: l.memo ?? null };
      });
      if (computed.length === 0) throw new Error('At least one party line required');

      let vid = 0;
      let jid = 0;
      db().transaction(() => {
        const r = db().prepare(`INSERT INTO multi_vouchers (kind, serial, date, cashbox_id, currency, total_minor, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(v.kind, serial, v.date, v.cashboxId, v.currency, total.toString(), v.notes ?? null);
        vid = Number(r.lastInsertRowid);

        const insLine = db().prepare(`INSERT INTO multi_voucher_lines (voucher_id, party_id, amount_minor, memo) VALUES (?, ?, ?, ?)`);
        const lines: JournalLineDto[] = [];
        for (const l of computed) {
          insLine.run(vid, l.partyId, l.amount.toString(), l.memo);
          const party = db().prepare(`SELECT ar_account_id AS ar, ap_account_id AS ap FROM parties WHERE id=?`).get(l.partyId) as
            { ar: number | null; ap: number | null } | undefined;
          if (!party) throw new Error(`Party ${l.partyId} not found`);
          if (v.kind === 'receipt') {
            if (party.ar == null) throw new Error('Party missing AR account');
            lines.push({ accountId: party.ar, debitMinor: '0', creditMinor: l.amount.toString(), currency: v.currency, memo: l.memo ?? `Receipt ${serial}` });
          } else {
            if (party.ap == null) throw new Error('Party missing AP account');
            lines.push({ accountId: party.ap, debitMinor: l.amount.toString(), creditMinor: '0', currency: v.currency, memo: l.memo ?? `Payment ${serial}` });
          }
        }
        // Cash side as a single line
        if (v.kind === 'receipt') {
          lines.push({ accountId: cashbox.account_id, debitMinor: total.toString(), creditMinor: '0', currency: v.currency, memo: `Multi-receipt ${serial}` });
        } else {
          lines.push({ accountId: cashbox.account_id, debitMinor: '0', creditMinor: total.toString(), currency: v.currency, memo: `Multi-payment ${serial}` });
        }

        const pr = postJournal({ date: v.date, reference: serial, memo: `Multi-${v.kind} ${serial}`, sourceType: 'multi_voucher', sourceId: vid, lines });
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        jid = pr.entryId!;
        db().prepare(`UPDATE multi_vouchers SET journal_id=? WHERE id=?`).run(jid, vid);
      })();

      audit('create', 'multi_voucher', vid, { kind: v.kind, serial });
      return { ok: true, id: vid };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

// ---------- Extra reports ----------

export const registerExtraReports = (): void => {
  // Reorder alert: items where on-hand at default warehouse <= reorder_qty
  ipcMain.handle('reports:reorderAlert', () => {
    return db().prepare(`
      SELECT i.id, i.code, i.name,
             COALESCE(SUM(CAST(s.qty AS REAL)), 0) AS onHand,
             CAST(i.min_qty AS REAL) AS minQty,
             CAST(i.reorder_qty AS REAL) AS reorderQty,
             CAST(i.max_qty AS REAL) AS maxQty
      FROM items i LEFT JOIN item_stock s ON s.item_id = i.id
      GROUP BY i.id
      HAVING reorderQty > 0 AND onHand <= reorderQty
      ORDER BY (onHand - reorderQty) ASC
    `).all();
  });

  // Bank liquidity outlook:
  //  - cash on hand from cashboxes (sum of linked account balances)
  //  - expected inflows from cheques in (received|deposited) not yet cleared
  //  - expected outflows from cheques out (issued) not yet paid
  ipcMain.handle('reports:bankLiquidity', () => {
    const cashboxes = db().prepare(`
      SELECT cb.id, cb.name, cb.currency, a.code, a.name AS accountName,
             COALESCE(SUM(CAST(jl.debit_minor AS INTEGER) - CAST(jl.credit_minor AS INTEGER)), 0) AS balanceMinor
      FROM cashboxes cb JOIN accounts a ON a.id = cb.account_id
      LEFT JOIN journal_lines jl ON jl.account_id = cb.account_id
      GROUP BY cb.id ORDER BY cb.id
    `).all();

    const inflows = db().prepare(`
      SELECT status, currency, COUNT(*) AS n, SUM(CAST(amount_minor AS INTEGER)) AS amountMinor
      FROM cheques WHERE direction='in' AND status IN ('received','deposited')
      GROUP BY status, currency
    `).all();

    const outflows = db().prepare(`
      SELECT status, currency, COUNT(*) AS n, SUM(CAST(amount_minor AS INTEGER)) AS amountMinor
      FROM cheques WHERE direction='out' AND status IN ('issued')
      GROUP BY status, currency
    `).all();

    return { cashboxes, inflows, outflows };
  });

  // Drill-back support: get source doc info from a journal entry
  ipcMain.handle('reports:sourceDoc', (_e, journalId: number) => {
    const je = db().prepare(`SELECT id, source_type AS sourceType, source_id AS sourceId, reference, date, memo
                              FROM journal_entries WHERE id=?`).get(journalId);
    return je;
  });

  // Stock on-hand for an (item, warehouse) pair (used by Stock-count UI).
  ipcMain.handle('reports:stockOnHand', (_e, itemId: number, warehouseId: number) => {
    const r = db().prepare(`SELECT CAST(qty AS REAL) AS qty FROM item_stock WHERE item_id=? AND warehouse_id=?`).get(itemId, warehouseId) as { qty: number } | undefined;
    return { qty: r?.qty ?? 0 };
  });
};

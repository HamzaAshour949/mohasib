import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { ITEM_COLS, WAREHOUSE_COLS, CASHBOX_COLS } from '../services/columns';
import { baseCurrency } from '../services/settings';
import type { Item, Warehouse, Cashbox, SaveResult } from '@shared/types';

interface ItemRaw {
  id: number; code: string; barcode: string | null; name: string; nameEn: string | null; unit: string;
  salePrice1: string; salePrice2: string; salePrice3: string; salePrice4: string; salePrice5: string;
  purchasePrice1: string; purchasePrice2: string; purchasePrice3: string; purchasePrice4: string; purchasePrice5: string;
  currency: string; avgCostMinor: string; minQty: string; reorderQty: string; maxQty: string;
  itemType: 'stock' | 'service' | 'non_stock'; notes: string | null;
}

const mapItem = (r: ItemRaw): Item => ({
  id: r.id, code: r.code, barcode: r.barcode, name: r.name, nameEn: r.nameEn, unit: r.unit,
  salePrices: [r.salePrice1, r.salePrice2, r.salePrice3, r.salePrice4, r.salePrice5],
  purchasePrices: [r.purchasePrice1, r.purchasePrice2, r.purchasePrice3, r.purchasePrice4, r.purchasePrice5],
  currency: r.currency, minQty: r.minQty, reorderQty: r.reorderQty, maxQty: r.maxQty,
  itemType: r.itemType, notes: r.notes
});

interface ItemInput extends Partial<Item> { id?: number }

/** Refuse a delete that another table still points at, naming the table. */
const guardReferences = (id: number, references: Array<[string, string]>): SaveResult | null => {
  for (const [table, column] of references) {
    const row = db().prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).get(id);
    if (row) return { ok: false, error: `Still referenced by ${table} — cannot delete` };
  }
  return null;
};

export const registerItems = (): void => {
  ipcMain.handle('items:list', () => {
    const rows = db().prepare(`SELECT ${ITEM_COLS} FROM items ORDER BY code`).all() as ItemRaw[];
    return rows.map(mapItem);
  });

  ipcMain.handle('items:get', (_e, id: number) => {
    const r = db().prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?`).get(id) as ItemRaw | undefined;
    return r ? mapItem(r) : undefined;
  });

  ipcMain.handle('items:save', (_e, it: ItemInput): SaveResult => {
    const sp = it.salePrices ?? ['0','0','0','0','0'];
    const pp = it.purchasePrices ?? ['0','0','0','0','0'];
    if (it.id) {
      db().prepare(`UPDATE items SET code=?, barcode=?, name=?, name_en=?, unit=?,
        sale_price_1=?, sale_price_2=?, sale_price_3=?, sale_price_4=?, sale_price_5=?,
        purchase_price_1=?, purchase_price_2=?, purchase_price_3=?, purchase_price_4=?, purchase_price_5=?,
        currency=?, min_qty=?, reorder_qty=?, max_qty=?, item_type=?, notes=?
        WHERE id=?`).run(
        it.code, it.barcode ?? null, it.name, it.nameEn ?? null, it.unit ?? 'pcs',
        sp[0], sp[1], sp[2], sp[3], sp[4],
        pp[0], pp[1], pp[2], pp[3], pp[4],
        it.currency || baseCurrency(), it.minQty ?? '0', it.reorderQty ?? '0', it.maxQty ?? '0',
        it.itemType ?? 'stock', it.notes ?? null, it.id
      );
      audit('update', 'item', it.id, it);
      return { ok: true, id: it.id };
    }
    const r = db().prepare(`INSERT INTO items (code, barcode, name, name_en, unit,
      sale_price_1, sale_price_2, sale_price_3, sale_price_4, sale_price_5,
      purchase_price_1, purchase_price_2, purchase_price_3, purchase_price_4, purchase_price_5,
      currency, min_qty, reorder_qty, max_qty, item_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      it.code, it.barcode ?? null, it.name, it.nameEn ?? null, it.unit ?? 'pcs',
      sp[0], sp[1], sp[2], sp[3], sp[4],
      pp[0], pp[1], pp[2], pp[3], pp[4],
      it.currency || baseCurrency(), it.minQty ?? '0', it.reorderQty ?? '0', it.maxQty ?? '0',
      it.itemType ?? 'stock', it.notes ?? null
    );
    const id = Number(r.lastInsertRowid);
    audit('create', 'item', id, it);
    return { ok: true, id };
  });

  ipcMain.handle('items:delete', (_e, id: number): SaveResult => {
    // Only invoice_lines was checked. An item used on a quote, an order, a
    // stock movement or a manufacturing formula hit a raw foreign-key error,
    // and item_stock cascades — so an item with stock on hand deleted its own
    // stock rows and the inventory value silently dropped.
    const guard = guardReferences(id, [
      ['invoice_lines', 'item_id'],
      ['quote_lines', 'item_id'],
      ['order_lines', 'item_id'],
      ['stock_movement_lines', 'item_id'],
      ['manufacturing_formulas', 'output_item_id'],
      ['manufacturing_formula_lines', 'item_id']
    ]);
    if (guard) return guard;

    const onHand = db().prepare(
      `SELECT COALESCE(SUM(CAST(qty AS REAL)), 0) AS qty FROM item_stock WHERE item_id = ?`
    ).get(id) as { qty: number };
    if (Math.abs(onHand.qty) > 1e-9) return { ok: false, error: `Item still has ${onHand.qty} in stock — cannot delete` };

    try {
      db().prepare('DELETE FROM items WHERE id = ?').run(id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    audit('delete', 'item', id);
    return { ok: true };
  });

  ipcMain.handle('items:stock', () => {
    return db().prepare(`SELECT i.id AS itemId, i.code, i.name, i.unit, i.min_qty AS minQty, i.avg_cost_minor AS avgCostMinor,
                                COALESCE(SUM(CAST(s.qty AS REAL)), 0) AS qty
                         FROM items i
                         LEFT JOIN item_stock s ON s.item_id = i.id
                         GROUP BY i.id
                         ORDER BY i.code`).all();
  });
};

export const registerWarehouses = (): void => {
  ipcMain.handle('warehouses:list', () =>
    db().prepare(`SELECT ${WAREHOUSE_COLS} FROM warehouses ORDER BY code`).all() as Warehouse[]
  );

  ipcMain.handle('warehouses:save', (_e, w: Partial<Warehouse> & { id?: number }): SaveResult => {
    if (w.id) {
      db().prepare('UPDATE warehouses SET code=?, name=?, name_en=?, is_default=? WHERE id=?')
        .run(w.code, w.name, w.nameEn ?? null, w.isDefault ?? 0, w.id);
      return { ok: true, id: w.id };
    }
    const r = db().prepare('INSERT INTO warehouses (code, name, name_en, is_default) VALUES (?, ?, ?, ?)')
      .run(w.code, w.name, w.nameEn ?? null, w.isDefault ?? 0);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  // The preload exposed warehouses.delete and cashboxes.delete with no handler
  // behind either, so calling them rejected with 'No handler registered'.
  ipcMain.handle('warehouses:delete', (_e, id: number): SaveResult => {
    const guard = guardReferences(id, [
      ['invoices', 'warehouse_id'],
      ['orders', 'warehouse_id'],
      ['stock_movements', 'from_warehouse_id'],
      ['stock_movements', 'to_warehouse_id'],
      ['manufacturing_runs', 'warehouse_id']
    ]);
    if (guard) return guard;

    // item_stock cascades on delete, so a warehouse holding stock would take
    // the quantities with it and inventory value would drop with no trace.
    const stocked = db().prepare(
      `SELECT COALESCE(SUM(CAST(qty AS REAL)), 0) AS qty FROM item_stock WHERE warehouse_id = ?`
    ).get(id) as { qty: number };
    if (Math.abs(stocked.qty) > 1e-9) return { ok: false, error: 'Warehouse still holds stock — cannot delete' };

    try {
      db().prepare('DELETE FROM warehouses WHERE id = ?').run(id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    audit('delete', 'warehouse', id);
    return { ok: true };
  });
};

export const registerCashboxes = (): void => {
  ipcMain.handle('cashboxes:list', () =>
    db().prepare(`SELECT ${CASHBOX_COLS} FROM cashboxes ORDER BY code`).all() as Cashbox[]
  );

  ipcMain.handle('cashboxes:save', (_e, c: Partial<Cashbox> & { id?: number }): SaveResult => {
    if (c.id) {
      db().prepare('UPDATE cashboxes SET code=?, name=?, currency=?, account_id=?, is_default=? WHERE id=?')
        .run(c.code, c.name, c.currency, c.accountId, c.isDefault ?? 0, c.id);
      return { ok: true, id: c.id };
    }
    const r = db().prepare('INSERT INTO cashboxes (code, name, currency, account_id, is_default) VALUES (?, ?, ?, ?, ?)')
      .run(c.code, c.name, c.currency || baseCurrency(), c.accountId, c.isDefault ?? 0);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('cashboxes:delete', (_e, id: number): SaveResult => {
    const guard = guardReferences(id, [
      ['invoices', 'cashbox_id'],
      ['vouchers', 'cashbox_id'],
      ['cheques', 'cashbox_id'],
      ['multi_vouchers', 'cashbox_id']
    ]);
    if (guard) return guard;
    try {
      db().prepare('DELETE FROM cashboxes WHERE id = ?').run(id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    audit('delete', 'cashbox', id);
    return { ok: true };
  });
};

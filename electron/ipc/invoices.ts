import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { postJournal, nextSerial } from '../services/posting';
import { requirePeriodOpen } from '../services/period';
import { INVOICE_COLS, INVOICE_LINE_COLS } from '../services/columns';
import { valueOf, weightedAverage } from '@shared/domain/Inventory';
import { addDays, isIsoDate } from '@shared/domain/Dates';
import { AppError, toFailure } from '@shared/domain/errors';
import type { Invoice, InvoiceLine, JournalEntryDto, JournalLineDto, SaveResult } from '@shared/types';

interface InvoiceRow {
  id: number; kind: string; serial: string; date: string; partyId: number; warehouseId: number;
  paymentMode: 'cash'|'credit'; cashboxId: number | null; currency: string;
  subtotalMinor: string; invDiscountMinor: string; feesMinor: string; grandTotalMinor: string;
  notes: string | null; journalId: number | null;
}

const SERIAL_PREFIX: Record<string, string> = {
  sale: 'S', purchase: 'P', sale_return: 'SR', purchase_return: 'PR'
};

// Fetch a setting account by code; throws if missing.
const acctIdByCode = (code: string): number => {
  const r = db().prepare(`SELECT id FROM accounts WHERE code = ?`).get(code) as { id: number } | undefined;
  if (!r) throw new AppError('requiredAccountMissing', { code }, `Required account ${code} missing`);
  return r.id;
};

const partyAcct = (partyId: number, kind: 'ar'|'ap'): number => {
  const col = kind === 'ar' ? 'ar_account_id' : 'ap_account_id';
  const r = db().prepare(`SELECT ${col} AS id FROM parties WHERE id = ?`).get(partyId) as { id: number | null } | undefined;
  if (!r || r.id == null) throw new AppError(kind === 'ar' ? 'partyArAccountMissing' : 'partyApAccountMissing', {}, 'Party AR/AP account missing');
  return r.id;
};

const cashboxAcct = (cashboxId: number): number => {
  const r = db().prepare(`SELECT account_id FROM cashboxes WHERE id = ?`).get(cashboxId) as { account_id: number } | undefined;
  if (!r) throw new AppError('cashboxMissing', {}, 'Cashbox missing');
  return r.account_id;
};

// Adjust stock and weighted-average cost.
// qtyDelta: positive receives stock, negative issues it.
// Returns the cost of the movement in minor units — for an issue, the quantity
// valued at the average cost in force *before* the movement.
const moveStock = (
  itemId: number,
  warehouseId: number,
  qtyDelta: number,
  unitPriceMinor: bigint     // receipts only: the unit cost of the incoming stock
): bigint => {
  const item = db().prepare('SELECT avg_cost_minor FROM items WHERE id = ?').get(itemId) as { avg_cost_minor: string } | undefined;
  if (!item) throw new Error('Item missing');
  const stockRow = db().prepare('SELECT qty FROM item_stock WHERE item_id = ? AND warehouse_id = ?').get(itemId, warehouseId) as { qty: string } | undefined;
  const currentQty = parseFloat(stockRow?.qty ?? '0');
  const currentAvg = BigInt(item.avg_cost_minor || '0');

  let costOfMove: bigint;
  if (qtyDelta > 0) {
    // The average has to be computed from the quantity held *before* the
    // receipt. Reading it afterwards counts the incoming units twice.
    const newAvg = weightedAverage(currentQty, currentAvg, qtyDelta, unitPriceMinor);
    db().prepare('UPDATE items SET avg_cost_minor = ? WHERE id = ?').run(newAvg.toString(), itemId);
    costOfMove = valueOf(unitPriceMinor, qtyDelta);
  } else {
    costOfMove = valueOf(currentAvg, -qtyDelta);
  }

  const newQty = currentQty + qtyDelta;
  db().prepare(`INSERT INTO item_stock (item_id, warehouse_id, qty) VALUES (?, ?, ?)
                ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty = excluded.qty`)
    .run(itemId, warehouseId, String(newQty));
  return costOfMove;
};

export interface InvoiceInput extends Omit<Partial<Invoice>, 'lines'> {
  kind: Invoice['kind'];
  date: string;
  partyId: number;
  warehouseId: number;
  paymentMode: 'cash' | 'credit';
  cashboxId: number | null;
  currency: string;
  lines: Array<Partial<InvoiceLine> & { itemId: number; qty: string; unitPriceMinor: string; discountMinor?: string }>;
  invDiscountMinor?: string;
  feesMinor?: string;
  notes?: string | null;
  dueDate?: string | null;
}

export const saveInvoiceCore = (inv: InvoiceInput): SaveResult => {
  return invoiceSaveImpl(inv);
};

let invoiceSaveImpl: (inv: InvoiceInput) => SaveResult = () => ({ ok: false, error: 'invoices not registered' });

export const registerInvoices = (): void => {
  ipcMain.handle('invoices:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT ${INVOICE_COLS} FROM invoices ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('invoices:get', (_e, id: number) => {
    const inv = db().prepare(`SELECT ${INVOICE_COLS} FROM invoices WHERE id = ?`).get(id) as InvoiceRow | undefined;
    if (!inv) return undefined;
    const lines = db().prepare(`SELECT ${INVOICE_LINE_COLS}, (SELECT code FROM items WHERE id = item_id) AS itemCode,
                                 (SELECT name FROM items WHERE id = item_id) AS itemName
                                 FROM invoice_lines WHERE invoice_id = ?`).all(id);
    return { ...inv, lines };
  });

  invoiceSaveImpl = (inv: InvoiceInput): SaveResult => {
    try {
      requirePeriodOpen(inv.date);
      // Compute totals
      let subtotal = 0n;
      const computedLines = inv.lines.map(l => {
        const qty = parseFloat(l.qty);
        if (!l.itemId || !Number.isFinite(qty) || qty <= 0) throw new AppError('invalidLine', {}, 'Invalid invoice line');
        const unit = BigInt(l.unitPriceMinor || '0');
        const disc = BigInt(l.discountMinor || '0');
        const total = valueOf(unit, qty) - disc;
        subtotal += total;
        return { itemId: l.itemId, qty, unit, disc, total };
      });
      const invDisc = BigInt(inv.invDiscountMinor ?? '0');
      const fees = BigInt(inv.feesMinor ?? '0');
      const grand = subtotal - invDisc + fees;
      const prefix = SERIAL_PREFIX[inv.kind];
      if (!prefix) throw new Error(`Unknown invoice kind: ${inv.kind}`);
      if (!isIsoDate(inv.date)) throw new AppError('invalidDate', { date: String(inv.date) }, `Invalid invoice date: ${inv.date}`);

      // Credit-limit + due-date enforcement (sale on credit only)
      let dueDate: string | null = inv.dueDate ?? null;
      if (inv.kind === 'sale' && inv.paymentMode === 'credit') {
        const party = db().prepare(
          `SELECT credit_limit_minor AS lim, due_days AS dd, ar_account_id AS ar FROM parties WHERE id=?`
        ).get(inv.partyId) as { lim: string | null; dd: number | null; ar: number | null } | undefined;
        if (party) {
          if (party.lim && BigInt(party.lim) > 0n && party.ar != null) {
            const balRow = db().prepare(
              `SELECT COALESCE(SUM(CAST(debit_minor AS INTEGER) - CAST(credit_minor AS INTEGER)),0) AS bal
                 FROM journal_lines WHERE account_id=?`
            ).get(party.ar) as { bal: number };
            const newAr = BigInt(Math.round(balRow.bal)) + grand;
            if (newAr > BigInt(party.lim)) {
              throw new AppError(
                'creditLimitExceeded',
                { balance: (Number(newAr) / 100).toFixed(2), limit: (Number(BigInt(party.lim)) / 100).toFixed(2) },
                `Credit limit exceeded: new AR ${(Number(newAr) / 100).toFixed(2)} > limit ${(Number(BigInt(party.lim)) / 100).toFixed(2)}`
              );
            }
          }
          if (!dueDate && party.dd && party.dd > 0) {
            dueDate = addDays(inv.date, party.dd);
          }
        }
      }

      let invoiceId = 0;
      let journalId = 0;
      let serial = '';

      db().transaction(() => {
        // Inside the transaction: a serial burned by a failed post leaves a
        // permanent hole in an audited sequence.
        serial = nextSerial(prefix);
        const r = db().prepare(`INSERT INTO invoices
          (kind, serial, date, party_id, warehouse_id, payment_mode, cashbox_id, currency,
           subtotal_minor, inv_discount_minor, fees_minor, grand_total_minor, notes, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          inv.kind, serial, inv.date, inv.partyId, inv.warehouseId,
          inv.paymentMode, inv.paymentMode === 'cash' ? inv.cashboxId : null,
          inv.currency, subtotal.toString(), invDisc.toString(), fees.toString(), grand.toString(), inv.notes ?? null,
          dueDate
        );
        invoiceId = Number(r.lastInsertRowid);

        const insLine = db().prepare(`INSERT INTO invoice_lines
          (invoice_id, item_id, qty, unit_price_minor, discount_minor, total_minor)
          VALUES (?, ?, ?, ?, ?, ?)`);
        for (const l of computedLines) {
          insLine.run(invoiceId, l.itemId, String(l.qty), l.unit.toString(), l.disc.toString(), l.total.toString());
        }

        // Build JE
        const lines: JournalLineDto[] = [];
        const arOrCash = (): number => inv.paymentMode === 'cash'
          ? cashboxAcct(inv.cashboxId!)
          : partyAcct(inv.partyId, 'ar');
        const apOrCash = (): number => inv.paymentMode === 'cash'
          ? cashboxAcct(inv.cashboxId!)
          : partyAcct(inv.partyId, 'ap');

        const revenueAcct = acctIdByCode('4100');
        const salesReturnsAcct = acctIdByCode('4900');
        const inventoryAcct = acctIdByCode('1130');
        const cogsAcct = acctIdByCode('5100');
        const purchaseReturnsAcct = acctIdByCode('5900');

        if (inv.kind === 'sale') {
          // Dr AR/Cash; Cr Revenue
          lines.push({ accountId: arOrCash(), debitMinor: grand.toString(), creditMinor: '0', currency: inv.currency, memo: `Sale ${serial}` });
          lines.push({ accountId: revenueAcct, debitMinor: '0', creditMinor: grand.toString(), currency: inv.currency, memo: `Sale ${serial}` });
          // COGS: outgoing stock
          let cogs = 0n;
          for (const l of computedLines) cogs += moveStock(l.itemId, inv.warehouseId, -l.qty, 0n);
          if (cogs > 0n) {
            lines.push({ accountId: cogsAcct, debitMinor: cogs.toString(), creditMinor: '0', currency: inv.currency, memo: `COGS ${serial}` });
            lines.push({ accountId: inventoryAcct, debitMinor: '0', creditMinor: cogs.toString(), currency: inv.currency, memo: `COGS ${serial}` });
          }
        } else if (inv.kind === 'purchase') {
          // Dr Inventory; Cr AP/Cash
          for (const l of computedLines) moveStock(l.itemId, inv.warehouseId, l.qty, l.unit);
          // Inventory carries the grand total, so invoice-level fees and
          // discounts land in stock value rather than in a variance account.
          lines.push({ accountId: inventoryAcct, debitMinor: grand.toString(), creditMinor: '0', currency: inv.currency, memo: `Purchase ${serial}` });
          lines.push({ accountId: apOrCash(), debitMinor: '0', creditMinor: grand.toString(), currency: inv.currency, memo: `Purchase ${serial}` });
        } else if (inv.kind === 'sale_return') {
          // Dr Sales Returns; Cr AR/Cash
          lines.push({ accountId: salesReturnsAcct, debitMinor: grand.toString(), creditMinor: '0', currency: inv.currency, memo: `Sale return ${serial}` });
          lines.push({ accountId: arOrCash(), debitMinor: '0', creditMinor: grand.toString(), currency: inv.currency, memo: `Sale return ${serial}` });
          // Stock back IN at avg cost (use 0 to keep avg unchanged)
          let cogsBack = 0n;
          for (const l of computedLines) {
            // restore at the current avg cost
            const item = db().prepare('SELECT avg_cost_minor FROM items WHERE id = ?').get(l.itemId) as { avg_cost_minor: string };
            const avg = BigInt(item.avg_cost_minor || '0');
            // Returning at the current average leaves the average untouched,
            // which is what a return should do.
            moveStock(l.itemId, inv.warehouseId, l.qty, avg);
            cogsBack += valueOf(avg, l.qty);
          }
          if (cogsBack > 0n) {
            lines.push({ accountId: inventoryAcct, debitMinor: cogsBack.toString(), creditMinor: '0', currency: inv.currency, memo: `COGS reversal ${serial}` });
            lines.push({ accountId: cogsAcct, debitMinor: '0', creditMinor: cogsBack.toString(), currency: inv.currency, memo: `COGS reversal ${serial}` });
          }
        } else if (inv.kind === 'purchase_return') {
          // Dr AP/Cash; Cr Purchase Returns; outgoing stock at avg cost
          lines.push({ accountId: apOrCash(), debitMinor: grand.toString(), creditMinor: '0', currency: inv.currency, memo: `Purchase return ${serial}` });
          lines.push({ accountId: purchaseReturnsAcct, debitMinor: '0', creditMinor: grand.toString(), currency: inv.currency, memo: `Purchase return ${serial}` });
          let costOut = 0n;
          for (const l of computedLines) costOut += moveStock(l.itemId, inv.warehouseId, -l.qty, 0n);
          if (costOut !== grand && costOut > 0n) {
            // adjust inventory side to match cost outflow
            lines.push({ accountId: inventoryAcct, debitMinor: '0', creditMinor: costOut.toString(), currency: inv.currency, memo: `Stock out ${serial}` });
            lines.push({ accountId: purchaseReturnsAcct, debitMinor: costOut.toString(), creditMinor: '0', currency: inv.currency, memo: `Stock out ${serial}` });
          }
        }

        const je: JournalEntryDto = {
          date: inv.date,
          reference: serial,
          memo: `${inv.kind} invoice ${serial}`,
          sourceType: 'invoice',
          sourceId: invoiceId,
          lines
        };
        const pr = postJournal(je);
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        journalId = pr.entryId!;
        db().prepare('UPDATE invoices SET journal_id = ? WHERE id = ?').run(journalId, invoiceId);
      })();

      audit('create', 'invoice', invoiceId, { serial, kind: inv.kind });
      return { ok: true, id: invoiceId };
    } catch (e) {
      return toFailure(e);
    }
  };
  ipcMain.handle('invoices:save', (_e, inv: InvoiceInput) => invoiceSaveImpl(inv));
};

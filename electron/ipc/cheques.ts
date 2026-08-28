import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { postJournal, nextSerial } from '../services/posting';
import { requirePeriodOpen } from '../services/period';
import { CHEQUE_COLS } from '../services/columns';
import type { Cheque, ChequeStatus, JournalEntryDto, SaveResult } from '@shared/types';

interface ChequeInput extends Partial<Cheque> {
  number: string;
  bank?: string | null;
  date: string;
  dueDate: string;
  partyId: number;
  cashboxId?: number | null;
  direction: 'in' | 'out';
  currency: string;
  amountMinor: string;
  notes?: string | null;
}

const partyAcct = (partyId: number, kind: 'ar' | 'ap'): number => {
  const col = kind === 'ar' ? 'ar_account_id' : 'ap_account_id';
  const r = db().prepare(`SELECT ${col} AS id FROM parties WHERE id = ?`).get(partyId) as { id: number | null } | undefined;
  if (!r || r.id == null) throw new Error('Party AR/AP account missing');
  return r.id;
};

const cashboxAcct = (cashboxId: number): number => {
  const r = db().prepare(`SELECT account_id FROM cashboxes WHERE id = ?`).get(cashboxId) as { account_id: number } | undefined;
  if (!r) throw new Error('Cashbox missing');
  return r.account_id;
};

const acctIdByCode = (code: string): number => {
  const r = db().prepare(`SELECT id FROM accounts WHERE code = ?`).get(code) as { id: number } | undefined;
  if (!r) throw new Error(`Required account ${code} missing`);
  return r.id;
};

/** Once a cheque reaches one of these, its money has moved and it is closed. */
const TERMINAL_STATUSES = new Set<string>(['cleared', 'returned', 'paid', 'cancelled']);

export const registerCheques = (): void => {
  ipcMain.handle('cheques:list', (_e, status?: string) => {
    const where = status ? 'WHERE status = ?' : '';
    const args = status ? [status] : [];
    return db().prepare(`SELECT ${CHEQUE_COLS} FROM cheques ${where} ORDER BY due_date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('cheques:save', (_e, c: ChequeInput): SaveResult => {
    try {
      requirePeriodOpen(c.date);
      const initialStatus: ChequeStatus = c.direction === 'in' ? 'received' : 'issued';
      const amount = BigInt(c.amountMinor);
      if (amount <= 0n) throw new Error('Cheque amount must be positive');
      let chequeId = 0;
      let serial = '';

      db().transaction(() => {
        serial = nextSerial(c.direction === 'in' ? 'CHI' : 'CHO');
        const r = db().prepare(`INSERT INTO cheques
          (serial, number, bank, date, due_date, party_id, cashbox_id, direction, status, currency, amount_minor, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          serial, c.number, c.bank ?? null, c.date, c.dueDate, c.partyId, c.cashboxId ?? null,
          c.direction, initialStatus, c.currency, amount.toString(), c.notes ?? null
        );
        chequeId = Number(r.lastInsertRowid);

        // Initial JE: in -> Cheques Under Collection (1140) Dr / Customer AR Cr
        // out -> Supplier AP Dr / Cheques Payable (2140) Cr
        const lines = c.direction === 'in'
          ? [
              { accountId: acctIdByCode('1140'), debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque IN ${serial}` },
              { accountId: partyAcct(c.partyId, 'ar'), debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque IN ${serial}` }
            ]
          : [
              { accountId: partyAcct(c.partyId, 'ap'), debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque OUT ${serial}` },
              { accountId: acctIdByCode('2140'), debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque OUT ${serial}` }
            ];
        const je: JournalEntryDto = {
          date: c.date,
          reference: serial,
          memo: `Cheque ${c.direction === 'in' ? 'received' : 'issued'} ${serial}`,
          sourceType: 'cheque',
          sourceId: chequeId,
          lines
        };
        const pr = postJournal(je);
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
      })();

      audit('create', 'cheque', chequeId, { serial });
      return { ok: true, id: chequeId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // State transitions: cleared / returned / endorsed / cancelled / paid
  ipcMain.handle('cheques:transition', (_e, args: { id: number; toStatus: ChequeStatus; date: string }): SaveResult => {
    try {
      const c = db().prepare(`SELECT ${CHEQUE_COLS} FROM cheques WHERE id = ?`).get(args.id) as Cheque | undefined;
      if (!c) return { ok: false, error: 'Cheque not found' };
      requirePeriodOpen(args.date);
      // Settled cheques are done. Without this, transitioning an already
      // cleared cheque to 'cleared' again posted the settlement entry a
      // second time and doubled the cash.
      if (TERMINAL_STATUSES.has(c.status)) {
        return { ok: false, error: `Cheque is already ${c.status}` };
      }
      if (c.status === args.toStatus) return { ok: false, error: `Cheque is already ${c.status}` };

      db().transaction(() => {
        const amount = BigInt(c.amountMinor);
        const lines = (() => {
          // Incoming cheques
          if (c.direction === 'in') {
            if (args.toStatus === 'cleared') {
              if (!c.cashboxId) throw new Error('Cashbox required to clear cheque');
              return [
                { accountId: cashboxAcct(c.cashboxId), debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque cleared ${c.serial}` },
                { accountId: acctIdByCode('1140'),     debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque cleared ${c.serial}` }
              ];
            }
            if (args.toStatus === 'returned') {
              return [
                { accountId: partyAcct(c.partyId, 'ar'), debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque returned ${c.serial}` },
                { accountId: acctIdByCode('1140'),       debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque returned ${c.serial}` }
              ];
            }
          } else {
            if (args.toStatus === 'paid') {
              if (!c.cashboxId) throw new Error('Cashbox required to mark cheque paid');
              return [
                { accountId: acctIdByCode('2140'),     debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque paid ${c.serial}` },
                { accountId: cashboxAcct(c.cashboxId), debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque paid ${c.serial}` }
              ];
            }
            if (args.toStatus === 'cancelled') {
              return [
                { accountId: acctIdByCode('2140'),       debitMinor: amount.toString(), creditMinor: '0', currency: c.currency, memo: `Cheque cancelled ${c.serial}` },
                { accountId: partyAcct(c.partyId, 'ap'), debitMinor: '0', creditMinor: amount.toString(), currency: c.currency, memo: `Cheque cancelled ${c.serial}` }
              ];
            }
          }
          return null;
        })();

        if (lines) {
          const pr = postJournal({
            date: args.date,
            reference: c.serial,
            memo: `Cheque ${args.toStatus}`,
            sourceType: 'cheque',
            sourceId: args.id,
            lines
          });
          if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        }
        db().prepare('UPDATE cheques SET status = ? WHERE id = ?').run(args.toStatus, args.id);
      })();

      audit('transition', 'cheque', args.id, { to: args.toStatus });
      return { ok: true, id: args.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { postJournal, nextSerial } from '../services/posting';
import { requirePeriodOpen } from '../services/period';
import { VOUCHER_COLS } from '../services/columns';
import type { Voucher, JournalEntryDto, SaveResult } from '@shared/types';

interface VoucherInput extends Partial<Voucher> {
  kind: 'receipt' | 'payment';
  date: string;
  partyId: number;
  cashboxId: number;
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

export const registerVouchers = (): void => {
  ipcMain.handle('vouchers:list', (_e, kind?: string) => {
    const where = kind ? 'WHERE kind = ?' : '';
    const args = kind ? [kind] : [];
    return db().prepare(`SELECT ${VOUCHER_COLS} FROM vouchers ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...args);
  });

  ipcMain.handle('vouchers:save', (_e, v: VoucherInput): SaveResult => {
    try {
      requirePeriodOpen(v.date);
      const serial = nextSerial(v.kind === 'receipt' ? 'R' : 'PV');
      const amount = BigInt(v.amountMinor);
      let voucherId = 0;
      let journalId = 0;

      db().transaction(() => {
        const r = db().prepare(`INSERT INTO vouchers (kind, serial, date, party_id, cashbox_id, currency, amount_minor, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          v.kind, serial, v.date, v.partyId, v.cashboxId, v.currency, amount.toString(), v.notes ?? null
        );
        voucherId = Number(r.lastInsertRowid);

        const cashAcct = cashboxAcct(v.cashboxId);
        const lines = v.kind === 'receipt'
          ? [
              { accountId: cashAcct, debitMinor: amount.toString(), creditMinor: '0', currency: v.currency, memo: `Receipt ${serial}` },
              { accountId: partyAcct(v.partyId, 'ar'), debitMinor: '0', creditMinor: amount.toString(), currency: v.currency, memo: `Receipt ${serial}` }
            ]
          : [
              { accountId: partyAcct(v.partyId, 'ap'), debitMinor: amount.toString(), creditMinor: '0', currency: v.currency, memo: `Payment ${serial}` },
              { accountId: cashAcct, debitMinor: '0', creditMinor: amount.toString(), currency: v.currency, memo: `Payment ${serial}` }
            ];

        const je: JournalEntryDto = {
          date: v.date,
          reference: serial,
          memo: `${v.kind} voucher ${serial}`,
          sourceType: 'voucher',
          sourceId: voucherId,
          lines
        };
        const pr = postJournal(je);
        if (!pr.ok) throw new Error('Posting failed: ' + (pr.errors ?? []).join('; '));
        journalId = pr.entryId!;
        db().prepare('UPDATE vouchers SET journal_id = ? WHERE id = ?').run(journalId, voucherId);
      })();

      audit('create', 'voucher', voucherId, { serial, kind: v.kind });
      return { ok: true, id: voucherId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

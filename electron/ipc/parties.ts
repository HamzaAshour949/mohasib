import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { checkText } from '@shared/domain/Compliance';
import { complianceFailure, complianceWarning } from '../services/compliance-result';
import { baseCurrency } from '../services/settings';
import { PARTY_COLS } from '../services/columns';
import type { Party, SaveResult } from '@shared/types';

const policyMode = (): 'strict' | 'warn' => {
  const r = db().prepare(`SELECT value FROM settings WHERE key='policy_mode'`).get() as { value: string } | undefined;
  return r?.value === 'warn' ? 'warn' : 'strict';
};

const ensurePartyAccount = (
  partyId: number,
  partyCode: string,
  partyName: string,
  kind: 'ar' | 'ap'
): number => {
  const parentCode = kind === 'ar' ? '1110' : '2110';
  const accountType = kind === 'ar' ? 'asset' : 'liability';
  const code = `${parentCode}-${partyCode}`;
  const existing = db().prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db().prepare(`INSERT INTO accounts (code, name, name_en, type, parent_code, currency, is_party, party_id)
                          VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(code, partyName, partyName, accountType, parentCode, baseCurrency(), partyId);
  return Number(r.lastInsertRowid);
};

/**
 * Point a party at the AR/AP sub-accounts its kind implies, creating whichever
 * are missing.
 *
 * Exported for the fallback "miscellaneous" party that an expense voucher
 * creates when no supplier is named. That party was inserted straight into the
 * table with no routing at all, so the audit report flagged it as an error and
 * the first payment voucher raised against it failed on a missing AP account.
 * Calling this covers parties an older version already left unrouted, too.
 */
export const ensurePartyRouting = (partyId: number): void => {
  const p = db().prepare(
    'SELECT code, name, kind, ar_account_id AS ar, ap_account_id AS ap FROM parties WHERE id = ?'
  ).get(partyId) as { code: string; name: string; kind: string; ar: number | null; ap: number | null } | undefined;
  if (!p) throw new Error(`Party ${partyId} not found`);
  const wantsAr = p.kind === 'customer' || p.kind === 'both';
  const wantsAp = p.kind === 'supplier' || p.kind === 'both';
  const arId = wantsAr ? ensurePartyAccount(partyId, p.code, p.name, 'ar') : p.ar;
  const apId = wantsAp ? ensurePartyAccount(partyId, p.code, p.name, 'ap') : p.ap;
  db().prepare('UPDATE parties SET ar_account_id = ?, ap_account_id = ? WHERE id = ?').run(arId, apId, partyId);
};

interface PartyInput extends Partial<Party> { id?: number }

export const registerParties = (): void => {
  ipcMain.handle('parties:list', (_e, kind?: string) => {
    const where = kind && kind !== 'all' ? `WHERE kind = ? OR kind = 'both'` : '';
    const args = where ? [kind] : [];
    return db().prepare(`SELECT ${PARTY_COLS} FROM parties ${where} ORDER BY name`).all(...args) as Party[];
  });

  ipcMain.handle('parties:get', (_e, id: number) =>
    db().prepare(`SELECT ${PARTY_COLS} FROM parties WHERE id = ?`).get(id) as Party | undefined
  );

  ipcMain.handle('parties:save', (_e, p: PartyInput): SaveResult => {
    const c = checkText(p.name ?? '', policyMode());
    if (c.blocked) return complianceFailure(c);

    return db().transaction(() => {
      let id: number;
      if (p.id) {
        db().prepare(`UPDATE parties SET code=?, name=?, name_en=?, kind=?, phone=?, email=?, address=?, notes=? WHERE id=?`)
          .run(p.code, p.name, p.nameEn ?? null, p.kind, p.phone ?? null, p.email ?? null, p.address ?? null, p.notes ?? null, p.id);
        id = p.id;
      } else {
        const r = db().prepare(`INSERT INTO parties (code, name, name_en, kind, phone, email, address, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(p.code, p.name, p.nameEn ?? null, p.kind, p.phone ?? null, p.email ?? null, p.address ?? null, p.notes ?? null);
        id = Number(r.lastInsertRowid);
      }

      // Auto-create AR/AP sub-accounts.
      const wantsAr = p.kind === 'customer' || p.kind === 'both';
      const wantsAp = p.kind === 'supplier' || p.kind === 'both';
      const existing = db().prepare('SELECT ar_account_id AS ar, ap_account_id AS ap FROM parties WHERE id = ?')
        .get(id) as { ar: number | null; ap: number | null };

      // Changing a customer to a supplier used to null out ar_account_id.
      // If that sub-account still carried a balance, the receivable stayed in
      // the ledger with nothing pointing at it and the party statement lost
      // sight of it. Keep the link whenever the account has been posted to.
      const keepIfPosted = (accountId: number | null): number | null => {
        if (accountId == null) return null;
        const posted = db().prepare('SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1').get(accountId);
        return posted ? accountId : null;
      };

      const arId = wantsAr ? ensurePartyAccount(id, p.code!, p.name!, 'ar') : keepIfPosted(existing.ar);
      const apId = wantsAp ? ensurePartyAccount(id, p.code!, p.name!, 'ap') : keepIfPosted(existing.ap);
      db().prepare('UPDATE parties SET ar_account_id = ?, ap_account_id = ? WHERE id = ?')
        .run(arId, apId, id);

      audit(p.id ? 'update' : 'create', 'party', id, p);
      return { ok: true, id, ...complianceWarning(c.matched ? c : null) } as SaveResult;
    })();
  });

  ipcMain.handle('parties:delete', (_e, id: number): SaveResult => {
    // Only invoices were checked, so deleting a party with vouchers, cheques
    // or notes surfaced a raw 'FOREIGN KEY constraint failed' instead of an
    // explanation — or, where the reference was nullable, quietly detached the
    // document from its party.
    const references: Array<[string, string]> = [
      ['invoices', 'party_id'],
      ['vouchers', 'party_id'],
      ['cheques', 'party_id'],
      ['quotes', 'party_id'],
      ['orders', 'party_id'],
      ['notes_docs', 'party_id'],
      ['multi_voucher_lines', 'party_id'],
      ['employees', 'party_id']
    ];
    for (const [table, column] of references) {
      const row = db().prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).get(id);
      if (row) return { ok: false, error: `Party is referenced by ${table} — cannot delete` };
    }
    const posted = db().prepare(
      `SELECT 1 FROM journal_lines jl
         JOIN parties p ON p.ar_account_id = jl.account_id OR p.ap_account_id = jl.account_id
        WHERE p.id = ? LIMIT 1`
    ).get(id);
    if (posted) return { ok: false, error: 'Party has ledger entries — cannot delete' };

    try {
      db().prepare('DELETE FROM parties WHERE id = ?').run(id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    audit('delete', 'party', id);
    return { ok: true };
  });
};

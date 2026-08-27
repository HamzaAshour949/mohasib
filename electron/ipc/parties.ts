import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { checkText } from '@shared/domain/Compliance';
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
    .run(code, partyName, partyName, accountType, parentCode, 'USD', partyId);
  return Number(r.lastInsertRowid);
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
    if (c.blocked) return { ok: false, error: c.warning };

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

      // Auto-create AR/AP sub-account
      const wantsAr = p.kind === 'customer' || p.kind === 'both';
      const wantsAp = p.kind === 'supplier' || p.kind === 'both';
      let arId: number | null = null;
      let apId: number | null = null;
      if (wantsAr) arId = ensurePartyAccount(id, p.code!, p.name!, 'ar');
      if (wantsAp) apId = ensurePartyAccount(id, p.code!, p.name!, 'ap');
      db().prepare('UPDATE parties SET ar_account_id = ?, ap_account_id = ? WHERE id = ?')
        .run(arId, apId, id);

      audit(p.id ? 'update' : 'create', 'party', id, p);
      return { ok: true, id, warning: c.warning } as SaveResult;
    })();
  });

  ipcMain.handle('parties:delete', (_e, id: number): SaveResult => {
    const used = db().prepare('SELECT COUNT(*) AS n FROM invoices WHERE party_id = ?').get(id) as { n: number };
    if (used.n > 0) return { ok: false, error: 'Party has invoices — cannot delete' };
    db().prepare('DELETE FROM parties WHERE id = ?').run(id);
    audit('delete', 'party', id);
    return { ok: true };
  });
};

import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { checkText } from '@shared/domain/Compliance';
import { ACCOUNT_COLS } from '../services/columns';
import type { Account, SaveResult, AppSettings } from '@shared/types';

const policyMode = (): 'strict' | 'warn' => {
  const r = db().prepare(`SELECT value FROM settings WHERE key='policy_mode'`).get() as { value: string } | undefined;
  return r?.value === 'warn' ? 'warn' : 'strict';
};

interface AccountInput extends Partial<Account> { id?: number }

export const registerAccounts = (): void => {
  ipcMain.handle('accounts:list', () =>
    db().prepare(`SELECT ${ACCOUNT_COLS} FROM accounts ORDER BY code`).all() as Account[]
  );

  ipcMain.handle('accounts:tree', () => {
    const all = db().prepare(`SELECT ${ACCOUNT_COLS} FROM accounts ORDER BY code`).all() as Account[];
    const byParent = new Map<string | null, Account[]>();
    for (const a of all) {
      const p = a.parentCode ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(a);
    }
    interface Node extends Account { children: Node[] }
    const build = (parent: string | null): Node[] =>
      (byParent.get(parent) || []).map(a => ({ ...a, children: build(a.code) }));
    return build(null);
  });

  ipcMain.handle('accounts:byType', (_e, type: string) =>
    db().prepare(`SELECT ${ACCOUNT_COLS} FROM accounts WHERE type = ? AND is_active = 1 ORDER BY code`).all(type) as Account[]
  );

  ipcMain.handle('accounts:save', (_e, a: AccountInput): SaveResult => {
    const c1 = checkText(a.name ?? '', policyMode());
    const c2 = checkText(a.nameEn ?? '', policyMode());
    if (c1.blocked) return { ok: false, error: c1.warning };
    if (c2.blocked) return { ok: false, error: c2.warning };
    const warning = c1.warning ?? c2.warning;

    if (a.id) {
      db().prepare(`UPDATE accounts
                    SET code=?, name=?, name_en=?, type=?, parent_code=?, currency=?, is_active=?
                    WHERE id=?`)
        .run(a.code, a.name, a.nameEn ?? null, a.type, a.parentCode ?? null, a.currency || 'USD', a.isActive ?? 1, a.id);
      audit('update', 'account', a.id, a);
      return { ok: true, id: a.id, warning };
    }
    const r = db().prepare(`INSERT INTO accounts (code, name, name_en, type, parent_code, currency, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(a.code, a.name, a.nameEn ?? null, a.type, a.parentCode ?? null, a.currency || 'USD', a.isActive ?? 1);
    const id = Number(r.lastInsertRowid);
    audit('create', 'account', id, a);
    return { ok: true, id, warning };
  });

  ipcMain.handle('accounts:delete', (_e, id: number): SaveResult => {
    const used = db().prepare('SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = ?').get(id) as { n: number };
    if (used.n > 0) return { ok: false, error: 'Account is used in journal entries — cannot delete' };
    db().prepare('DELETE FROM accounts WHERE id = ?').run(id);
    audit('delete', 'account', id);
    return { ok: true };
  });
};

export const registerSettings = (): void => {
  ipcMain.handle('settings:get', (): AppSettings => {
    const rows = db().prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const m = new Map(rows.map(r => [r.key, r.value]));
    return {
      companyName: m.get('company_name') ?? 'My Company',
      companyNameEn: m.get('company_name_en') ?? 'My Company',
      defaultCurrency: m.get('default_currency') ?? 'USD',
      language: (m.get('language') === 'en' ? 'en' : 'ar'),
      policyMode: (m.get('policy_mode') === 'warn' ? 'warn' : 'strict'),
      fiscalYearStart: m.get('fiscal_year_start') ?? '01-01',
      logoPath: m.get('logo_path') ?? null,
      groupNotes: m.get('group_notes') ?? ''
    };
  });

  ipcMain.handle('settings:save', (_e, s: Partial<AppSettings>) => {
    const stmt = db().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const map: Array<[string, unknown]> = [
      ['company_name', s.companyName],
      ['company_name_en', s.companyNameEn],
      ['default_currency', s.defaultCurrency],
      ['language', s.language],
      ['policy_mode', s.policyMode],
      ['fiscal_year_start', s.fiscalYearStart],
      ['logo_path', s.logoPath],
      ['group_notes', s.groupNotes]
    ];
    db().transaction(() => {
      for (const [k, v] of map) if (v !== undefined && v !== null) stmt.run(k, String(v));
    })();
    return { ok: true };
  });

  ipcMain.handle('settings:checkText', (_e, text: string) => checkText(text, policyMode()));
};

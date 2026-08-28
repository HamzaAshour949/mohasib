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
    const codes = new Set(all.map(a => a.code));
    const byParent = new Map<string | null, Account[]>();
    for (const a of all) {
      // An account whose parent_code names a row that no longer exists used to
      // disappear from the tree entirely — the only place the chart of
      // accounts is browsed — while still holding a balance. Treat it as a
      // root so it stays visible.
      const parent = a.parentCode && codes.has(a.parentCode) ? a.parentCode : null;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(a);
    }

    interface Node extends Account { children: Node[] }
    // parent_code is a free-text column with no constraint stopping a cycle
    // (A's parent is B, B's parent is A). The recursive build had no guard, so
    // one bad edit hung the main process on an infinite descent, taking the
    // whole app with it.
    const seen = new Set<string>();
    const build = (parent: string | null): Node[] =>
      (byParent.get(parent) ?? [])
        .filter(a => !seen.has(a.code))
        .map(a => {
          seen.add(a.code);
          return { ...a, children: build(a.code) };
        });
    return build(null);
  });

  ipcMain.handle('accounts:byType', (_e, type: string) =>
    db().prepare(`SELECT ${ACCOUNT_COLS} FROM accounts WHERE type = ? AND is_active = 1 ORDER BY code`).all(type) as Account[]
  );

  ipcMain.handle('accounts:save', (_e, a: AccountInput): SaveResult => {
    if (!a.code?.trim()) return { ok: false, error: 'Account code is required' };
    if (!a.name?.trim()) return { ok: false, error: 'Account name is required' };
    if (!a.type) return { ok: false, error: 'Account type is required' };
    if (a.parentCode && a.parentCode === a.code) return { ok: false, error: 'An account cannot be its own parent' };

    const clash = db().prepare('SELECT id FROM accounts WHERE code = ? AND id IS NOT ?').get(a.code, a.id ?? null) as { id: number } | undefined;
    if (clash) return { ok: false, error: `Account code ${a.code} is already used` };

    if (a.parentCode) {
      const parent = db().prepare('SELECT code FROM accounts WHERE code = ?').get(a.parentCode) as { code: string } | undefined;
      if (!parent) return { ok: false, error: `Parent account ${a.parentCode} does not exist` };
      // Walk up from the proposed parent: if we come back to this account, the
      // edit would create a cycle and make the tree unbuildable.
      if (a.id) {
        const ancestors = new Set<string>();
        let cursor: string | null = a.parentCode;
        while (cursor && !ancestors.has(cursor)) {
          if (cursor === a.code) return { ok: false, error: 'That parent would make the account its own ancestor' };
          ancestors.add(cursor);
          const row = db().prepare('SELECT parent_code AS parentCode FROM accounts WHERE code = ?').get(cursor) as { parentCode: string | null } | undefined;
          cursor = row?.parentCode ?? null;
        }
      }
    }

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
    const account = db().prepare('SELECT code FROM accounts WHERE id = ?').get(id) as { code: string } | undefined;
    if (!account) return { ok: false, error: 'Account not found' };

    const used = db().prepare('SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = ?').get(id) as { n: number };
    if (used.n > 0) return { ok: false, error: 'Account is used in journal entries — cannot delete' };

    // Deleting a parent left its children pointing at a code that no longer
    // exists, which used to drop them out of the account tree silently.
    const child = db().prepare('SELECT code FROM accounts WHERE parent_code = ? LIMIT 1').get(account.code) as { code: string } | undefined;
    if (child) return { ok: false, error: `Account has sub-accounts (${child.code}) — cannot delete` };

    // Masters point at accounts with plain REFERENCES, so without these checks
    // the delete surfaced a raw foreign-key error.
    const references: Array<[string, string]> = [
      ['parties', 'ar_account_id'],
      ['parties', 'ap_account_id'],
      ['cashboxes', 'account_id'],
      ['expense_categories', 'account_id'],
      ['employees', 'payable_account_id'],
      ['account_budgets', 'account_id']
    ];
    for (const [table, column] of references) {
      const row = db().prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).get(id);
      if (row) return { ok: false, error: `Account is referenced by ${table} — cannot delete` };
    }

    try {
      db().prepare('DELETE FROM accounts WHERE id = ?').run(id);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
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

import { ipcMain } from 'electron';
import { db } from '../services/db';
import { audit } from '../services/audit';
import { postJournal, reverseJournal } from '../services/posting';
import { requirePeriodOpen } from '../services/period';
import { JOURNAL_COLS, JLINE_COLS } from '../services/columns';
import type { JournalEntryDto, SaveResult } from '@shared/types';

export const registerJournal = (): void => {
  ipcMain.handle('journal:list', (_e, fromDate?: string, toDate?: string) => {
    const where: string[] = [];
    const args: unknown[] = [];
    if (fromDate) { where.push('date >= ?'); args.push(fromDate); }
    if (toDate)   { where.push('date <= ?'); args.push(toDate);   }
    const sql = `SELECT ${JOURNAL_COLS} FROM journal_entries
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY date DESC, id DESC LIMIT 1000`;
    return db().prepare(sql).all(...args);
  });

  ipcMain.handle('journal:get', (_e, id: number) => {
    const e = db().prepare(`SELECT ${JOURNAL_COLS} FROM journal_entries WHERE id = ?`).get(id);
    if (!e) return undefined;
    const lines = db().prepare(`SELECT ${JLINE_COLS},
                                 (SELECT code FROM accounts WHERE id = account_id) AS accountCode,
                                 (SELECT name FROM accounts WHERE id = account_id) AS accountName
                                 FROM journal_lines WHERE entry_id = ?`).all(id);
    return { ...e as object, lines };
  });

  ipcMain.handle('journal:save', (_e, je: JournalEntryDto): SaveResult => {
    try { requirePeriodOpen(je.date); } catch (e) { return { ok: false, error: (e as Error).message }; }
    const r = postJournal(je);
    if (!r.ok) return { ok: false, error: (r.errors ?? []).join('; ') };
    audit('create', 'journal', r.entryId!, { ref: je.reference });
    return { ok: true, id: r.entryId };
  });

  ipcMain.handle('journal:reverse', (_e, args: { id: number; date: string; memo?: string }): SaveResult => {
    // A reversal is a posting like any other, and it was the one posting path
    // that skipped the period check — so a locked period could still be
    // written to by reversing an entry into it.
    try { requirePeriodOpen(args.date); } catch (e) { return { ok: false, error: (e as Error).message }; }

    const already = db().prepare(
      `SELECT id FROM journal_entries WHERE source_type='reversal' AND source_id=? LIMIT 1`
    ).get(args.id) as { id: number } | undefined;
    if (already) return { ok: false, error: `Entry #${args.id} was already reversed by #${already.id}` };

    const r = reverseJournal(args.id, args.date, args.memo);
    if (!r.ok) return { ok: false, error: (r.errors ?? []).join('; ') };
    audit('reverse', 'journal', args.id, { newEntryId: r.entryId });
    return { ok: true, id: r.entryId };
  });
};

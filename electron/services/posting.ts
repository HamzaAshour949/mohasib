import { db } from './db';
import { baseCurrency } from './settings';
import type { JournalEntryDto } from '@shared/types';
import { validate, type JournalEntry } from '@shared/domain/Posting';

/**
 * Allocate the next serial for `prefix`.
 *
 * Read-then-update was not atomic, and every caller ran it *before* opening
 * its transaction, so a document that failed to post still consumed its number
 * and left a permanent hole in an audited sequence. Callers now invoke this
 * inside their transaction, and the reservation is a single statement that
 * rolls back with everything else.
 */
export const nextSerial = (prefix: string): string => {
  if (!prefix) throw new Error('Serial prefix is required');
  const d = db();
  d.prepare('INSERT INTO serials(prefix, next_value) VALUES (?, 1) ON CONFLICT(prefix) DO NOTHING').run(prefix);
  const row = d.prepare('UPDATE serials SET next_value = next_value + 1 WHERE prefix = ? RETURNING next_value - 1 AS allocated')
    .get(prefix) as { allocated: number } | undefined;
  if (!row) throw new Error(`Could not allocate a serial for ${prefix}`);
  return `${prefix}-${String(row.allocated).padStart(6, '0')}`;
};

export interface PostResult {
  ok: boolean;
  entryId?: number;
  errors?: string[];
}

export const postJournal = (e: JournalEntryDto): PostResult => {
  // Convert DTO -> domain entry (bigint)
  const domain: JournalEntry = {
    date: e.date,
    reference: e.reference,
    memo: e.memo,
    lines: e.lines.map(l => ({
      accountId: l.accountId,
      debitMinor: BigInt(l.debitMinor || '0'),
      creditMinor: BigInt(l.creditMinor || '0'),
      currency: l.currency,
      memo: l.memo
    }))
  };
  const v = validate(domain);
  if (!v.ok) return { ok: false, errors: v.errors };

  const d = db();
  let totalAbs = 0n;
  for (const ln of domain.lines) totalAbs += ln.debitMinor; // sum of debit side

  const insE = d.prepare(`INSERT INTO journal_entries (date, reference, memo, source_type, source_id, total_minor, currency)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insL = d.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit_minor, credit_minor, currency, memo)
                          VALUES (?, ?, ?, ?, ?, ?)`);

  let entryId = 0;
  d.transaction(() => {
    const r = insE.run(
      e.date,
      e.reference ?? null,
      e.memo ?? null,
      e.sourceType ?? 'manual',
      e.sourceId ?? null,
      totalAbs.toString(),
      domain.lines[0]?.currency ?? baseCurrency()
    );
    entryId = Number(r.lastInsertRowid);
    for (const ln of domain.lines) {
      insL.run(entryId, ln.accountId, ln.debitMinor.toString(), ln.creditMinor.toString(), ln.currency, ln.memo ?? null);
    }
  })();

  return { ok: true, entryId };
};

export const reverseJournal = (entryId: number, date: string, memo?: string): PostResult => {
  const d = db();
  const orig = d.prepare('SELECT * FROM journal_entries WHERE id = ?').get(entryId) as { id: number; reference: string | null; memo: string | null; currency: string } | undefined;
  if (!orig) return { ok: false, errors: ['Entry not found'] };
  const lines = d.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(entryId) as Array<{
    account_id: number; debit_minor: string; credit_minor: string; currency: string; memo: string | null;
  }>;
  const reversed: JournalEntryDto = {
    date,
    reference: `REV-${orig.reference ?? entryId}`,
    memo: memo ?? `Reversal of #${entryId}`,
    sourceType: 'reversal',
    sourceId: entryId,
    lines: lines.map(l => ({
      accountId: l.account_id,
      debitMinor: l.credit_minor,
      creditMinor: l.debit_minor,
      currency: l.currency,
      memo: l.memo ?? undefined
    }))
  };
  return postJournal(reversed);
};

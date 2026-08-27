import { db } from './db';
import type { JournalEntryDto } from '@shared/types';
import { validate, type JournalEntry } from '@shared/domain/Posting';

export const nextSerial = (prefix: string): string => {
  const d = db();
  const row = d.prepare('SELECT next_value FROM serials WHERE prefix = ?').get(prefix) as { next_value: number } | undefined;
  let n = 1;
  if (row) {
    n = row.next_value;
    d.prepare('UPDATE serials SET next_value = next_value + 1 WHERE prefix = ?').run(prefix);
  } else {
    d.prepare('INSERT INTO serials(prefix, next_value) VALUES (?, ?)').run(prefix, 2);
  }
  return `${prefix}-${String(n).padStart(6, '0')}`;
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
      domain.lines[0]?.currency ?? 'USD'
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

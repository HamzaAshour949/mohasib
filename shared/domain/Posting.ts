// Double-entry posting validator. Pure: no I/O.

export interface JournalLine {
  accountId: number;
  debitMinor: bigint;   // >= 0
  creditMinor: bigint;  // >= 0
  currency: string;
  memo?: string;
}

export interface JournalEntry {
  date: string;        // 'YYYY-MM-DD'
  reference?: string;
  memo?: string;
  lines: JournalLine[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const validate = (e: JournalEntry): ValidationResult => {
  const errors: string[] = [];
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push('Invalid date');
  if (!e.lines || e.lines.length < 2) errors.push('Entry must have at least 2 lines');

  const perCurrency = new Map<string, bigint>();

  for (let i = 0; i < (e.lines?.length || 0); i++) {
    const ln = e.lines[i];
    if (!ln.accountId || ln.accountId <= 0) errors.push(`Line ${i + 1}: account required`);
    if (ln.debitMinor < 0n || ln.creditMinor < 0n) errors.push(`Line ${i + 1}: amounts must be non-negative`);
    if (ln.debitMinor > 0n && ln.creditMinor > 0n) errors.push(`Line ${i + 1}: only debit OR credit, not both`);
    if (ln.debitMinor === 0n && ln.creditMinor === 0n) errors.push(`Line ${i + 1}: amount required`);
    const cur = ln.currency || 'USD';
    perCurrency.set(cur, (perCurrency.get(cur) ?? 0n) + ln.debitMinor - ln.creditMinor);
  }

  for (const [cur, diff] of perCurrency) {
    if (diff !== 0n) errors.push(`Unbalanced in ${cur}: diff = ${diff.toString()} minor units`);
  }

  return { ok: errors.length === 0, errors };
};

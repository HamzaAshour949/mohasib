// Shared period-lock validation used by invoice, voucher, journal save handlers.
import { db } from './db';

export const requirePeriodOpen = (date: string): void => {
  const lock = db().prepare(
    `SELECT id, start_date, end_date, reason FROM period_locks
     WHERE date(?) BETWEEN date(start_date) AND date(end_date) LIMIT 1`
  ).get(date) as { id: number; start_date: string; end_date: string; reason: string | null } | undefined;
  if (lock) throw new Error(`Period locked (${lock.start_date} → ${lock.end_date})${lock.reason ? `: ${lock.reason}` : ''}`);
};

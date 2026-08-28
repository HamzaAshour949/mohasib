// Shared period-lock validation used by invoice, voucher, journal save handlers.
import { db } from './db';
import { AppError } from '@shared/domain/errors';

export const requirePeriodOpen = (date: string): void => {
  const lock = db().prepare(
    `SELECT id, start_date, end_date, reason FROM period_locks
     WHERE date(?) BETWEEN date(start_date) AND date(end_date) LIMIT 1`
  ).get(date) as { id: number; start_date: string; end_date: string; reason: string | null } | undefined;
  if (lock) {
    throw new AppError(
      'periodLocked',
      // Pre-formatted so the message reads correctly with or without a reason.
      { start: lock.start_date, end: lock.end_date, reason: lock.reason ? `: ${lock.reason}` : '' },
      `Period locked (${lock.start_date} → ${lock.end_date})${lock.reason ? `: ${lock.reason}` : ''}`
    );
  }
};

// File-level operations on a SQLite database. Deliberately free of any
// `electron` import so the WAL-replacement behaviour can be tested directly.

import Database from 'better-sqlite3';
import { copyFileSync, rmSync } from 'node:fs';

/** Write-ahead-log sidecars that live alongside a database file. */
export const WAL_SIDECARS = ['-wal', '-shm'] as const;

/**
 * Delete the write-ahead log and shared-memory files belonging to `target`.
 *
 * Only safe once every connection to `target` is closed. Leaving them in place
 * while replacing the main file is the bug this exists to prevent: the stale
 * -wal describes the *old* database, and SQLite replays it over the new pages
 * on the next open, so the replacement silently reverts.
 */
export const dropWalSidecars = (target: string): void => {
  for (const suffix of WAL_SIDECARS) rmSync(target + suffix, { force: true });
};

/**
 * Replace the database at `target` with the file at `source`.
 * The caller must have closed every connection to `target` first.
 */
export const replaceDatabaseFile = (target: string, source: string): void => {
  dropWalSidecars(target);
  copyFileSync(source, target);
};

/**
 * Throw unless `file` is a readable SQLite database that carries Mohasib's core
 * tables. Guards restore, which otherwise copies whatever the user picked
 * straight over the ledger.
 */
export const assertRestorableDatabase = (file: string): void => {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const check = probe.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error(String(check));
    const found = probe.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
        WHERE type='table' AND name IN ('accounts','journal_entries','journal_lines','settings')`
    ).get() as { n: number };
    if (found.n < 4) throw new Error('missing core tables');
  } finally {
    try { probe?.close(); } catch { /* nothing to release */ }
  }
};

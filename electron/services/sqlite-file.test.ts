import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertRestorableDatabase, dropWalSidecars, replaceDatabaseFile } from './sqlite-file';

const CORE_SCHEMA = `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, code TEXT);
  CREATE TABLE journal_entries (id INTEGER PRIMARY KEY, date TEXT);
  CREATE TABLE journal_lines (id INTEGER PRIMARY KEY, entry_id INTEGER);
`;

let dir: string;

const makeDb = (path: string, marker: string): Database.Database => {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(CORE_SCHEMA);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('marker', marker);
  return db;
};

const readMarker = (path: string): string | undefined => {
  const db = new Database(path);
  try {
    return (db.prepare(`SELECT value FROM settings WHERE key='marker'`).get() as { value: string } | undefined)?.value;
  } finally {
    db.close();
  }
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mohasib-restore-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('replaceDatabaseFile', () => {
  it('is what a restore needs: copying over an open WAL database loses the restore', () => {
    // This is the failure the old restore path shipped with, pinned so it
    // cannot come back. The live database stays open (as it did in the app),
    // the chosen backup is copied over the main file, and the stale -wal is
    // left behind.
    const live = join(dir, 'live.db');
    const backup = join(dir, 'backup.db');

    const liveDb = makeDb(live, 'current-data');
    // Force a checkpointable WAL with content the main file does not yet hold.
    liveDb.prepare(`UPDATE settings SET value='current-data-v2' WHERE key='marker'`).run();

    const backupDb = makeDb(backup, 'restored-data');
    backupDb.close();

    copyFileSync(backup, live); // no close, no sidecar cleanup — the old code
    expect(existsSync(`${live}-wal`)).toBe(true);
    liveDb.close(); // checkpoints the stale WAL back over the restored pages

    expect(readMarker(live)).not.toBe('restored-data');
  });

  it('replaces the database once the sidecars are gone', () => {
    const live = join(dir, 'live.db');
    const backup = join(dir, 'backup.db');

    const liveDb = makeDb(live, 'current-data');
    liveDb.prepare(`UPDATE settings SET value='current-data-v2' WHERE key='marker'`).run();
    const backupDb = makeDb(backup, 'restored-data');
    backupDb.close();

    liveDb.close();
    replaceDatabaseFile(live, backup);

    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(existsSync(`${live}-shm`)).toBe(false);
    expect(readMarker(live)).toBe('restored-data');
  });

  it('dropWalSidecars tolerates a database that has none', () => {
    const solo = join(dir, 'solo.db');
    makeDb(solo, 'x').close();
    expect(() => dropWalSidecars(solo)).not.toThrow();
    expect(() => dropWalSidecars(join(dir, 'missing.db'))).not.toThrow();
  });
});

describe('assertRestorableDatabase', () => {
  it('accepts a Mohasib database', () => {
    const good = join(dir, 'good.db');
    makeDb(good, 'x').close();
    expect(() => assertRestorableDatabase(good)).not.toThrow();
  });

  it('rejects a SQLite file that is not this app', () => {
    const other = join(dir, 'other.db');
    const db = new Database(other);
    db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    db.close();
    expect(() => assertRestorableDatabase(other)).toThrow(/core tables/);
  });

  it('rejects a file that is not a database at all', () => {
    const junk = join(dir, 'junk.db');
    writeFileSync(junk, 'this is not a database');
    expect(() => assertRestorableDatabase(junk)).toThrow();
  });

  it('rejects a missing file rather than creating one', () => {
    const missing = join(dir, 'nope.db');
    expect(() => assertRestorableDatabase(missing)).toThrow();
    expect(existsSync(missing)).toBe(false);
  });
});

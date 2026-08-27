import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let _db: Database.Database | null = null;
let _path = '';

export const dbPath = (): string => _path;

export const openCompany = (companyFile?: string): Database.Database => {
  const dir = join(app.getPath('userData'), 'companies');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _path = companyFile ?? join(dir, 'default.db');

  if (_db) {
    try { _db.close(); } catch { /* noop */ }
  }
  _db = new Database(_path);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');
  return _db;
};

export const db = (): Database.Database => {
  if (!_db) throw new Error('Database not opened');
  return _db;
};

export const closeDb = (): void => {
  if (_db) {
    try { _db.close(); } catch { /* noop */ }
    _db = null;
  }
};

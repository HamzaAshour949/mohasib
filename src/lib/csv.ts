// CSV export. Fields are quoted when they contain a comma, quote, semicolon or
// newline; internal quotes are doubled.
//
// Writing happens in the main process behind a native save dialog. The old
// blob-URL `<a download>` route dropped the file into the default downloads
// directory with no dialog and no indication of where it went, and it is
// exactly the kind of implicit filesystem access the sandbox exists to stop.

import { api } from './ipc';

export interface CsvCol<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const escapeCell = (raw: string | number | null | undefined): string => {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = <T,>(rows: T[], cols: CsvCol<T>[]): string => {
  const head = cols.map(c => escapeCell(c.header)).join(',');
  const body = rows.map(r => cols.map(c => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
};

export const saveCsv = async (filename: string, csv: string): Promise<string | null> => {
  const suggestedName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const result = await api.app.saveTextFile({
    suggestedName,
    contents: csv,
    filter: { name: 'CSV', extensions: ['csv'] }
  });
  if (result.ok) return result.path ?? null;
  if (result.error && result.error !== 'cancelled') throw new Error(result.error);
  return null;
};

export const exportRows = <T,>(filename: string, rows: T[], cols: CsvCol<T>[]): void => {
  void saveCsv(filename, toCsv(rows, cols)).catch((e: Error) => alert(e.message));
};

// CSV export with Excel-friendly UTF-8 BOM.
// Field rules: wrap in double quotes if contains comma, quote, or newline; double up internal quotes.

export interface CsvCol<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const escapeCell = (raw: string | number | null | undefined): string => {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export const toCsv = <T,>(rows: T[], cols: CsvCol<T>[]): string => {
  const head = cols.map(c => escapeCell(c.header)).join(',');
  const body = rows.map(r => cols.map(c => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
};

export const downloadCsv = (filename: string, csv: string): void => {
  const BOM = '\uFEFF'; // Excel UTF-8 detection
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportRows = <T,>(filename: string, rows: T[], cols: CsvCol<T>[]): void => {
  downloadCsv(filename, toCsv(rows, cols));
};

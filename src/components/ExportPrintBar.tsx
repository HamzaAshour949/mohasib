import { useTranslation } from 'react-i18next';
import { exportRows, type CsvCol } from '../lib/csv';
import { printHtml, escapeHtml } from '../lib/print';
import { useViewActions } from '../lib/view-actions';

interface Props<T> {
  filename: string;
  title: string;
  rows: T[];
  cols: CsvCol<T>[];
  /** Optional rendered head/foot HTML for print (totals etc) */
  printSummary?: string;
}

export function ExportPrintBar<T>({ filename, title, rows, cols, printSummary }: Props<T>): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const onCsv = (): void => exportRows(filename, rows, cols);

  const onPrint = (): void => {
    const head = `<tr>${cols.map(c => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>`;
    const body = rows.map(r =>
      `<tr>${cols.map(c => `<td>${escapeHtml(c.value(r))}</td>`).join('')}</tr>`
    ).join('');
    const html = `
      <div class="header">
        <div><h2>${escapeHtml(title)}</h2><div class="meta">${new Date().toLocaleString(lang)}</div></div>
      </div>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>
      ${printSummary ?? ''}
      <div class="footer">${lang === 'ar' ? 'مُحاسب — تطبيق محاسبة بدون ربا أو ضرائب' : 'Mohasib — Riba-free, tax-free accounting'}</div>
    `;
    printHtml(title, html, lang);
  };

  // Makes the File menu's Export and Print items act on this page.
  useViewActions({ onExport: onCsv, onPrint });

  return (
    <div className="flex gap-2 mb-3">
      <button onClick={onCsv}
        className="px-3 py-1.5 rounded-md text-sm border border-line bg-bg2 text-fg hover:bg-panel">
        {t('exportCsv')}
      </button>
      <button onClick={onPrint}
        className="px-3 py-1.5 rounded-md text-sm border border-line bg-bg2 text-fg hover:bg-panel">
        {t('print')}
      </button>
    </div>
  );
}

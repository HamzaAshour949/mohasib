// Print helpers. Renders an HTML document inside a hidden iframe and triggers print().
// Avoids window.open which is blocked under strict CSP in Electron.

export const printHtml = (title: string, bodyHtml: string, lang: 'ar' | 'en' = 'ar'): void => {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const css = `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'SF Arabic','Geeza Pro','Noto Naskh Arabic',Amiri,system-ui,sans-serif;
           color: #111; direction: ${dir}; margin: 0; padding: 0; font-size: 12px; }
    h1,h2,h3 { margin: 0 0 6px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start;
              border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px; }
    .meta { font-size: 11px; color: #444; }
    table { width:100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
    th { background:#eee; }
    .num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; text-align: end; }
    .totals { margin-top: 10px; width: 50%; ${dir === 'rtl' ? 'margin-left:auto;' : 'margin-right:auto;'} }
    .totals td { border: none; padding: 2px 6px; }
    .totals .label { color:#555; }
    .footer { margin-top: 18px; font-size: 10px; color: #666; text-align: center; }
    @media print { .noprint { display:none !important; } }
  `;
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
    <title>${title}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  // Allow layout to settle.
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1500);
  }, 200);
};

export const escapeHtml = (s: string | number | null | undefined): string => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

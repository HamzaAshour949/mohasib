/**
 * Convert Gregorian date to Hijri (Umm al-Qura) using Intl, zero deps.
 * Returns a localized Arabic Islamic date string, e.g. "٢٢ ربيع الآخر ١٤٤٧ هـ".
 */
export function gregorianToHijri(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  return fmt.format(date);
}

/** Short numeric form yyyy/mm/dd in Umm al-Qura. */
export function gregorianToHijriShort(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(date);
}

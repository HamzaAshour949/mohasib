// Display helpers for bigint-string minor units.
// Storage is always integer minor (cents). Display uses Intl.NumberFormat.

const SCALE = 100n; // 2 decimals everywhere for v1

export const minorToMajor = (minorStr: string | bigint): string => {
  const n = typeof minorStr === 'string' ? BigInt(minorStr || '0') : minorStr;
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
};

export const formatMoney = (
  minorStr: string | bigint,
  currency = 'USD',
  locale = document.documentElement.lang === 'ar' ? 'ar' : 'en'
): string => {
  const major = minorToMajor(minorStr);
  const num = Number(major);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(num);
  } catch {
    return `${major} ${currency}`;
  }
};

export const majorToMinor = (s: string): string => {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return '0';
  const neg = cleaned.startsWith('-');
  const abs = neg ? cleaned.slice(1) : cleaned;
  const [w = '0', f = ''] = abs.split('.');
  const frac = (f + '00').slice(0, 2);
  const minor = BigInt(w) * SCALE + BigInt(frac || '0');
  return (neg ? -minor : minor).toString();
};

export const today = (): string => new Date().toISOString().slice(0, 10);

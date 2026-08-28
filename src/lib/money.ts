// Display helpers for bigint-string minor units.
// Storage is always integer minor units (cents); display uses Intl.NumberFormat.
//
// These run inside render — line totals are recomputed from the raw input on
// every keystroke — so they have to be total functions. `BigInt('abc')` throws
// a SyntaxError, and a throw from render unmounts the tree: typing a letter
// into a quantity or price field made the whole editor vanish, taking the
// half-entered document with it.

const SCALE = 100n;

/** Optional sign, digits, optional single decimal point. Nothing else. */
const DECIMAL = /^-?\d*(?:\.\d*)?$/;

export const minorToMajor = (minorStr: string | bigint): string => {
  let n: bigint;
  if (typeof minorStr === 'bigint') {
    n = minorStr;
  } else {
    const cleaned = String(minorStr ?? '').trim();
    if (!/^-?\d+$/.test(cleaned)) return '0.00';
    n = BigInt(cleaned);
  }
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
    // An unknown or malformed currency code makes Intl throw; showing the
    // number with the raw code beats showing nothing.
    return `${major} ${currency}`;
  }
};

/**
 * Parse a user-typed major-unit amount into minor units.
 * Anything that is not a plain decimal number yields '0' rather than throwing.
 */
export const majorToMinor = (s: string): string => {
  const cleaned = String(s ?? '').replace(/[,\s]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return '0';
  if (!DECIMAL.test(cleaned)) return '0';
  const neg = cleaned.startsWith('-');
  const abs = neg ? cleaned.slice(1) : cleaned;
  const [whole = '0', fraction = ''] = abs.split('.');
  const frac = (fraction + '00').slice(0, 2);
  const minor = BigInt(whole || '0') * SCALE + BigInt(frac || '0');
  return (neg ? -minor : minor).toString();
};

/** Parse a user-typed quantity. Never returns NaN or Infinity. */
export const parseQty = (s: string | number | null | undefined): number => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const cleaned = String(s ?? '').replace(/[,\s]/g, '').trim();
  if (!DECIMAL.test(cleaned)) return 0;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

/** Today in the user's own calendar, not UTC's. */
export const today = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

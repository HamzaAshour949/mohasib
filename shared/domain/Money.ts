// Money in integer minor units (bigint). 1 major = 100 minor.
// No floats anywhere in posting paths.

export type Currency = string; // e.g. 'USD', 'JOD', 'SAR'

export interface Money {
  minor: bigint;
  currency: Currency;
}

export const zero = (currency: Currency = 'USD'): Money => ({ minor: 0n, currency });

export const fromMajor = (major: number | string, currency: Currency): Money => {
  const s = String(major).trim();
  if (!s) return zero(currency);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  const minor = BigInt(intPart || '0') * 100n + BigInt(frac || '0');
  return { minor: neg ? -minor : minor, currency };
};

export const fromMinor = (minor: bigint | number, currency: Currency): Money => ({
  minor: typeof minor === 'bigint' ? minor : BigInt(minor),
  currency
});

export const add = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) throw new Error(`currency mismatch ${a.currency} vs ${b.currency}`);
  return { minor: a.minor + b.minor, currency: a.currency };
};

export const sub = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) throw new Error(`currency mismatch ${a.currency} vs ${b.currency}`);
  return { minor: a.minor - b.minor, currency: a.currency };
};

export const neg = (a: Money): Money => ({ minor: -a.minor, currency: a.currency });

export const isZero = (a: Money): boolean => a.minor === 0n;

// Format minor units as fixed-2 string ("1234.56"), no currency.
export const toText = (m: Money): string => {
  const negSign = m.minor < 0n ? '-' : '';
  const abs = m.minor < 0n ? -m.minor : m.minor;
  const major = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, '0');
  return `${negSign}${major.toString()}.${fracStr}`;
};

// Locale-aware display, e.g. "1,234.56 USD" or "١٬٢٣٤٫٥٦ USD".
export const toDisplay = (m: Money, locale = 'en-US'): string => {
  const major = Number(m.minor) / 100;
  const fmt = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(major);
  return `${fmt} ${m.currency}`;
};

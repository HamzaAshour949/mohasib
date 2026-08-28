// Riba/tax compliance keyword filter with Arabic normalization.
// Strict mode rejects; Warn mode returns warning but allows the save.

export type PolicyMode = 'strict' | 'warn';

export interface ComplianceResult {
  ok: boolean;
  blocked: boolean; // true if strict mode rejected
  /** Translation key under `errors`, paired with `matched` as its parameter. */
  code?: 'prohibitedTerm';
  matched?: string;
}

const PROHIBITED = [
  // English
  'interest', 'usury', 'riba', 'apr', 'compound interest',
  'vat', 'sales tax', 'income tax', 'value added tax', 'gst',
  // Arabic (in normalized form — see normalize())
  'ربا', 'فائده', 'فوائد', 'فائده ربويه', 'ضريبه', 'ضريبه القيمه المضافه',
  'القيمه المضافه', 'ضريبه الدخل', 'ضريبه المبيعات', 'فاءده', 'فاءدة'
];

// Arabic normalization:
// - hamza variants (أإآ) -> ا
// - ة -> ه
// - ى -> ي
// - remove tatweel ـ
// - remove diacritics (fatha, damma, kasra, sukun, shadda, tanwin)
// - lower-case latin
const normalize = (s: string): string => {
  return s
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // diacritics + tatweel
    .toLowerCase()
    .trim();
};

const NORM_PROHIBITED = PROHIBITED.map(normalize);

// Word-boundary check for normalized text.
// - Latin chars (a-z, 0-9, _) are word chars.
// - Arabic letters (\u0621-\u064A after normalization) are word chars.
// - The match position must NOT be in the middle of a word, so:
//     prev char must be word-edge (start of string or non-word), AND
//     next char must be word-edge.
// - Special-case Arabic definite article "ال" prefix: that's allowed before
//   an Arabic banned term (e.g. "الربا" still matches "ربا").
const ARABIC = /[\u0621-\u064A]/;
const LATIN_WORD = /[a-z0-9_]/;
const isWordChar = (c: string | undefined): boolean =>
  !!c && (ARABIC.test(c) || LATIN_WORD.test(c));

const wordBoundaryIncludes = (haystack: string, needle: string): boolean => {
  if (!needle) return false;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const prev = i > 0 ? haystack[i - 1] : undefined;
    const next = i + needle.length < haystack.length ? haystack[i + needle.length] : undefined;
    let leftOk = !isWordChar(prev);
    // Allow Arabic "ال" prefix
    if (!leftOk && i >= 2 && haystack[i - 2] === 'ا' && haystack[i - 1] === 'ل') {
      const before = i >= 3 ? haystack[i - 3] : undefined;
      leftOk = !isWordChar(before);
    }
    const rightOk = !isWordChar(next);
    if (leftOk && rightOk) return true;
    from = i + 1;
  }
};

export const checkText = (text: string, mode: PolicyMode = 'strict'): ComplianceResult => {
  if (!text) return { ok: true, blocked: false };
  const norm = normalize(text);
  for (let i = 0; i < NORM_PROHIBITED.length; i++) {
    const kw = NORM_PROHIBITED[i];
    if (kw && wordBoundaryIncludes(norm, kw)) {
      // The message used to be a hardcoded Arabic-and-English sentence built
      // here, which meant the renderer showed both languages at once and
      // neither could be adjusted without editing domain code.
      return { ok: mode === 'warn', blocked: mode === 'strict', code: 'prohibitedTerm', matched: PROHIBITED[i] };
    }
  }
  return { ok: true, blocked: false };
};

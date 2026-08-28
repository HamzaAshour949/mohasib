import { describe, expect, it } from 'vitest';
import { majorToMinor, minorToMajor, parseQty } from './money';

describe('majorToMinor', () => {
  it('parses ordinary amounts', () => {
    expect(majorToMinor('12.34')).toBe('1234');
    expect(majorToMinor('0.5')).toBe('50');
    expect(majorToMinor('100')).toBe('10000');
    expect(majorToMinor('-7.25')).toBe('-725');
  });

  it('strips thousands separators and spaces', () => {
    expect(majorToMinor('1,234.50')).toBe('123450');
    expect(majorToMinor(' 12.34 ')).toBe('1234');
  });

  it('truncates beyond two decimals rather than rounding money up', () => {
    expect(majorToMinor('1.999')).toBe('199');
  });

  it('returns zero for anything that is not a plain decimal', () => {
    // These run inside render, so throwing here unmounted the whole editor and
    // took the half-entered document with it. Typing a letter into a price
    // field was enough.
    for (const input of ['abc', '1a', '--', '1.2.3', '1e5', '', ' ', '.', '-', '-.', 'NaN', '0x10', '١٢']) {
      expect(() => majorToMinor(input)).not.toThrow();
      expect(majorToMinor(input)).toBe('0');
    }
  });

  it('survives a partially typed number', () => {
    // What the field holds mid-keystroke.
    expect(majorToMinor('1.')).toBe('100');
    expect(majorToMinor('-0.')).toBe('0');
  });
});

describe('parseQty', () => {
  it('parses decimals', () => {
    expect(parseQty('2.5')).toBe(2.5);
    expect(parseQty('0.125')).toBe(0.125);
    expect(parseQty(3)).toBe(3);
  });

  it('never returns NaN or Infinity', () => {
    for (const input of ['abc', '1a', '', ' ', '.', '-', '1.2.3', 'Infinity', null, undefined, Number.NaN]) {
      const result = parseQty(input as string);
      expect(Number.isFinite(result)).toBe(true);
    }
    expect(parseQty('abc')).toBe(0);
  });
});

describe('minorToMajor', () => {
  it('formats minor units', () => {
    expect(minorToMajor('1234')).toBe('12.34');
    expect(minorToMajor('-5')).toBe('-0.05');
    expect(minorToMajor(0n)).toBe('0.00');
  });

  it('does not throw on a malformed stored value', () => {
    expect(minorToMajor('not a number')).toBe('0.00');
    expect(minorToMajor('')).toBe('0.00');
  });

  it('keeps precision past the float range', () => {
    expect(minorToMajor('900719925474099100')).toBe('9007199254740991.00');
  });
});

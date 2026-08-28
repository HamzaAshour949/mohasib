import { describe, expect, it, afterEach } from 'vitest';
import { addDays, isIsoDate } from './Dates';

const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-01-15', 30)).toBe('2026-02-14');
  });

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-20', 20)).toBe('2027-01-09');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('subtracts', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives the same answer regardless of the local timezone', () => {
    // The previous implementation mixed a UTC-parsed date with local-time
    // getDate/setDate, so every user west of UTC got a due date one day early.
    const answers = new Set<string>();
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Amman']) {
      process.env.TZ = tz;
      answers.add(addDays('2026-01-15', 30));
    }
    expect([...answers]).toEqual(['2026-02-14']);
  });

  it('rejects malformed input rather than producing a wrong date', () => {
    expect(() => addDays('15/01/2026', 1)).toThrow(/Invalid date/);
    expect(() => addDays('2026-13-01', 1)).toThrow(/Invalid date/);
    expect(() => addDays('2026-01-15', 1.5)).toThrow(/Invalid day count/);
  });
});

describe('isIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('not a date')).toBe(false);
    expect(isIsoDate(20260228)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

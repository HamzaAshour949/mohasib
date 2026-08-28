import { describe, expect, it } from 'vitest';
import { scaleQty, valueOf, weightedAverage } from './Inventory';

describe('weightedAverage', () => {
  it('averages two receipts at different prices', () => {
    // 1 @ 10.00 then 1 @ 20.00 must average 15.00, not 10.00.
    // The shipped version divided before multiplying the scale back in, so
    // 3000/2000 truncated to 1 and the average came out at 10.00 — the whole
    // fractional part of the division was thrown away on every receipt.
    expect(weightedAverage(1, 1000n, 1, 2000n)).toBe(1500n);
  });

  it('weights by quantity, not by number of receipts', () => {
    // 9 @ 1.00 + 1 @ 11.00 = 20.00 over 10 units = 2.00
    expect(weightedAverage(9, 100n, 1, 1100n)).toBe(200n);
  });

  it('keeps three decimal places of quantity', () => {
    // 0.5 @ 10.00 + 0.25 @ 4.00 = 5.00 + 1.00 = 6.00 over 0.75 = 8.00
    expect(weightedAverage(0.5, 1000n, 0.25, 400n)).toBe(800n);
  });

  it('takes the incoming cost when there was nothing on hand', () => {
    expect(weightedAverage(0, 0n, 4, 2500n)).toBe(2500n);
    expect(weightedAverage(0, 9999n, 4, 2500n)).toBe(2500n);
  });

  it('keeps the last known cost when the receipt leaves nothing on hand', () => {
    expect(weightedAverage(0, 1234n, 0, 5000n)).toBe(1234n);
  });

  it('does not average against a negative position', () => {
    expect(weightedAverage(-5, 1000n, 2, 3000n)).toBe(3000n);
  });

  it('stays exact over a long receipt history', () => {
    // Ten receipts of 1 unit at 1.00 .. 10.00: mean 5.50.
    let qty = 0;
    let avg = 0n;
    for (let i = 1; i <= 10; i++) {
      avg = weightedAverage(qty, avg, 1, BigInt(i * 100));
      qty += 1;
    }
    expect(avg).toBe(550n);
  });

  it('handles large positions without overflowing', () => {
    const avg = weightedAverage(1_000_000, 999_999n, 1_000_000, 1_000_001n);
    expect(avg).toBe(1_000_000n);
  });
});

describe('valueOf', () => {
  it('values a fractional quantity', () => {
    expect(valueOf(1000n, 2.5)).toBe(2500n);
    expect(valueOf(333n, 3)).toBe(999n);
  });

  it('truncates sub-minor-unit remainders rather than inventing money', () => {
    // 0.001 units at 1.00 is a tenth of a cent; there is no coin for it.
    expect(valueOf(100n, 0.001)).toBe(0n);
  });

  it('handles a zero cost and a zero quantity', () => {
    expect(valueOf(0n, 5)).toBe(0n);
    expect(valueOf(5000n, 0)).toBe(0n);
  });
});

describe('scaleQty', () => {
  it('rounds to three decimals', () => {
    expect(scaleQty(1.2345)).toBe(1235n);
    expect(scaleQty(-2.5)).toBe(-2500n);
  });

  it('rejects values that cannot be represented', () => {
    expect(() => scaleQty(Number.NaN)).toThrow(/Invalid quantity/);
    expect(() => scaleQty(Number.POSITIVE_INFINITY)).toThrow(/Invalid quantity/);
    expect(() => scaleQty(1e16)).toThrow(/out of range/);
  });
});

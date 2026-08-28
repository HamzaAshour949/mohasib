// Inventory costing. Pure: no I/O.
//
// Quantities are decimal (0.5 kg, 2.25 m) but money is integer minor units, so
// every quantity is scaled to a bigint before it touches a cost. Ordering
// matters: multiply first, divide last. Dividing early throws away the whole
// fractional part of an integer division and the error is not small.

/** Quantities are tracked to three decimal places. */
export const QTY_SCALE = 1000n;

/** Largest quantity that still survives the scaling without losing precision. */
const MAX_QTY = Number.MAX_SAFE_INTEGER / 1000;

export const scaleQty = (qty: number): bigint => {
  if (!Number.isFinite(qty)) throw new Error(`Invalid quantity: ${qty}`);
  if (Math.abs(qty) > MAX_QTY) throw new Error(`Quantity out of range: ${qty}`);
  return BigInt(Math.round(qty * Number(QTY_SCALE)));
};

/** Value of `qty` units at `unitCostMinor` each, in minor units. */
export const valueOf = (unitCostMinor: bigint, qty: number): bigint =>
  (unitCostMinor * scaleQty(qty)) / QTY_SCALE;

/**
 * Weighted-average unit cost after receiving `incomingQty` units at
 * `incomingUnitCostMinor` each.
 *
 * `currentQty` is the quantity on hand *before* the receipt. Passing the
 * post-receipt quantity counts the incoming units twice and drags the average
 * toward the incoming price.
 */
export const weightedAverage = (
  currentQty: number,
  currentAvgMinor: bigint,
  incomingQty: number,
  incomingUnitCostMinor: bigint
): bigint => {
  const current = scaleQty(currentQty);
  const incoming = scaleQty(incomingQty);
  const total = current + incoming;

  // Averaging against a negative position produces a nonsense unit cost (the
  // shortfall is valued at the old average and cancels part of the receipt),
  // so the incoming price is the only honest answer. Checked before the
  // empty-position case, which a negative position would otherwise swallow.
  if (current < 0n) return incomingUnitCostMinor;
  // Nothing on hand afterwards: there is no meaningful average, keep the last
  // one we knew.
  if (total <= 0n) return currentAvgMinor;

  const totalValue = currentAvgMinor * current + incomingUnitCostMinor * incoming;
  return totalValue / total;
};

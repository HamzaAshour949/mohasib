// Calendar arithmetic on 'YYYY-MM-DD' strings.
//
// `new Date('2026-01-15')` parses as UTC midnight but `getDate`/`setDate`
// operate in local time, so the round trip through `toISOString()` lands on the
// previous day everywhere west of UTC. Due dates were a day early for every
// user in the Americas. Staying in UTC throughout avoids the whole class.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Date rolls impossible days over rather than rejecting them — 2026-02-30
  // parses happily as 2026-03-02 — so only a round trip proves it was real.
  return parsed.toISOString().slice(0, 10) === value;
};

export const addDays = (date: string, days: number): string => {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  if (!Number.isInteger(days)) throw new Error(`Invalid day count: ${days}`);
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

/** Today in the user's own calendar, not UTC's. */
export const today = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

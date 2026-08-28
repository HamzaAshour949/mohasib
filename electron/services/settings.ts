import { db } from './db';

/**
 * The company's base currency. Journal lines used to be hardcoded to 'USD' on
 * every path the user could not pick a currency on — stock adjustments,
 * manufacturing, depreciation, year-end close — which silently split the
 * ledger in two for anyone not running in dollars: the posting validator
 * balances per currency, so those entries balanced among themselves and
 * against nothing else.
 */
export const baseCurrency = (): string => {
  const row = db().prepare(`SELECT value FROM settings WHERE key='default_currency'`).get() as { value?: string } | undefined;
  const value = row?.value?.trim();
  return value && value.length > 0 ? value : 'USD';
};

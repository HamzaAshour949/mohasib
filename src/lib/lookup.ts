import { useMemo } from 'react';

/**
 * Index rows by id once per data change, instead of scanning the array again
 * for every cell that needs a name.
 *
 * Table cell renderers called `parties.find(p => p.id === row.partyId)` per
 * row, which is O(rows × parties) per render — 500 invoices against a few
 * hundred parties is six figures of comparisons on every keystroke that
 * touches the page.
 *
 * `key` is assumed to be a pure accessor, so only `rows` drives the rebuild.
 */
export const useIndexById = <T, K extends string | number>(
  rows: readonly T[],
  key: (row: T) => K
): ReadonlyMap<K, T> =>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    const index = new Map<K, T>();
    for (const row of rows) index.set(key(row), row);
    return index;
  }, [rows]);

/** Index rows by `id` and read a display name off them. */
export const useNamesById = <T extends { id?: number | null }>(
  rows: readonly T[],
  name: (row: T) => string
): ((id: number | null | undefined) => string) => {
  const index = useIndexById(rows, (row) => Number(row.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (id) => {
    if (id === null || id === undefined) return '';
    const row = index.get(Number(id));
    return row ? name(row) : '';
  }, [index]);
};

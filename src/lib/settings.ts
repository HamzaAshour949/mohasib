import { useQuery } from '@tanstack/react-query';
import { api } from './ipc';
import type { AppSettings } from '@shared/types';

export const useSettings = (): AppSettings | undefined => {
  const { data } = useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => api.settings.get() as Promise<AppSettings>,
    staleTime: 60_000
  });
  return data;
};

/**
 * The company's base currency.
 *
 * Every editor opened with a hardcoded 'USD' and the dashboard formatted every
 * figure as dollars, so a company running in JOD or SAR had to correct the
 * currency on each document and saw the wrong symbol on its own dashboard.
 */
export const useBaseCurrency = (): string => useSettings()?.defaultCurrency ?? 'USD';

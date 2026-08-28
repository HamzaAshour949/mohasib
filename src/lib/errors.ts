import type { TFunction } from 'i18next';

/**
 * Turn an IPC result into a message in the user's language.
 *
 * Main-process failures are user-facing text, but the main process has no
 * access to this bundle, so it sends a code and its parameters instead. Codes
 * it does not have — internal invariants, SQLite messages — fall through to the
 * raw string, which is better than a blank alert.
 */
export interface IpcOutcome {
  error?: string;
  errorCode?: string;
  errorParams?: Record<string, string | number>;
  warning?: string;
  warningCode?: string;
  warningParams?: Record<string, string | number>;
}

const translate = (
  t: TFunction,
  code: string | undefined,
  params: Record<string, string | number> | undefined,
  fallback: string | undefined
): string | undefined => {
  if (code) {
    const key = `errors.${code}`;
    const translated = t(key, { ...params, defaultValue: '' });
    if (translated) return translated;
  }
  return fallback;
};

export const describeError = (t: TFunction, result: IpcOutcome | undefined): string =>
  translate(t, result?.errorCode, result?.errorParams, result?.error) ?? t('error');

export const describeWarning = (t: TFunction, result: IpcOutcome | undefined): string | undefined =>
  translate(t, result?.warningCode, result?.warningParams, result?.warning);

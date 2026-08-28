// Error codes crossing the IPC boundary.
//
// Failures from the main process are shown to the user, so they are
// user-facing strings — but the main process cannot reach the renderer's i18n
// bundle. Sending a code plus its parameters lets the renderer translate them
// like anything else, instead of showing English to an Arabic user.
//
// Not every throw is a code. Internal invariants ("Database not opened",
// "Serial prefix is required") indicate a bug rather than something the user
// did, and inventing a translated phrase for them would only make a bug report
// harder to read. Those still surface verbatim; the codes below cover what
// normal use produces.

export type ErrorParams = Record<string, string | number>;

export class AppError extends Error {
  constructor(public readonly code: string, public readonly params: ErrorParams = {}, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export interface Failure {
  ok: false;
  error: string;
  errorCode?: string;
  errorParams?: ErrorParams;
}

/** Normalise any thrown value into a Failure the renderer can translate. */
export const toFailure = (e: unknown): Failure => {
  if (e instanceof AppError) {
    return { ok: false, error: e.message, errorCode: e.code, errorParams: e.params };
  }
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
};

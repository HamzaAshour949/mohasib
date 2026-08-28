import type { ComplianceResult } from '@shared/domain/Compliance';
import type { SaveResult } from '@shared/types';

/** Turn a blocking compliance hit into a failure the renderer can translate. */
export const complianceFailure = (result: ComplianceResult): SaveResult => ({
  ok: false,
  error: `Contains prohibited term «${result.matched ?? ''}»`,
  errorCode: result.code ?? 'prohibitedTerm',
  errorParams: { term: result.matched ?? '' }
});

/** Same, for warn mode, where the save goes through. */
export const complianceWarning = (result: ComplianceResult | null): Pick<SaveResult, 'warning' | 'warningCode' | 'warningParams'> =>
  result?.matched
    ? {
        warning: `Contains prohibited term «${result.matched}»`,
        warningCode: result.code ?? 'prohibitedTerm',
        warningParams: { term: result.matched }
      }
    : {};

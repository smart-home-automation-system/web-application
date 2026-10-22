import { ApiError, toApiError } from '../../core/api/api-error';
import { MessageKey } from '../../i18n/messages';

/** A change of the house that did not end as asked, with the sentence that comes first. */
export interface ChangeFailure {
  readonly error: ApiError;
  readonly summary: MessageKey;
}

/**
 * Why a change failed - and a change that got no answer may have been carried out all the same,
 * which is not "failed": it gets the sentence `unanswered`. The editors of the schedules of the
 * blinds (HAS-253) and of the rules of the lights (HAS-267) word their saves and removals so.
 */
export function changeFailureOf(
  failure: unknown,
  failed: MessageKey,
  unanswered: MessageKey,
): ChangeFailure {
  const error = toApiError(failure);
  return { error, summary: error.kind === 'network' ? unanswered : failed };
}

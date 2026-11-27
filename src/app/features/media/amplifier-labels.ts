import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of `media-service` (`AmplifierError`, whose names are wire contract there), each with a sentence
 * of our own. A new code needs a text here - the test of this file lists them.
 */
export const AMPLIFIER_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  AMPLIFIER_REFUSED: 'amplifier.error.refused',
  AMPLIFIER_UNAVAILABLE: 'amplifier.error.unavailable',
  AMPLIFIER_TIMEOUT: 'amplifier.error.timeout',
  UNLOCK_IN_PROGRESS: 'amplifier.error.inProgress',
  UNKNOWN_MEMBER: 'amplifier.error.unknownMember',
  REGISTRY_UNAVAILABLE: 'amplifier.error.registryUnavailable',
};

/**
 * A failed unlock in words - told from the answer of the `POST` itself: the amplifier has no state to read back
 * (HAS-515), the one exception to "the answer of a write is never used". A call without an answer may have been
 * carried out all the same; a refusal with a code has its sentence, one without what `describeApiError` says.
 */
export function describeUnlockError(error: ApiError): DisplayText {
  if (error.kind === 'network') {
    return { key: 'amplifier.noAnswer' };
  }
  const named = Object.entries(AMPLIFIER_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

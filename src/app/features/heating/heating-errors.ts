import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of a write of a heating schedule (`HeatingErrorId` of `heating-service`, whose
 * constant names are wire contract there, pinned by `HeatingErrorIdTest`), each with a sentence of
 * our own. A new or renamed code of the service needs a text here - the test of this file lists
 * them. `INVALID_SCHEDULE` carries the reason in English in its details, which never reach the
 * screen: every rule is checked by the editor first.
 */
export const HEATING_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  INVALID_SCHEDULE: 'heating.error.invalidSchedule',
  NOT_FOUND_SCHEDULE: 'heating.error.scheduleNotFound',
  NOT_FOUND_HEATER: 'heating.error.heaterNotFound',
  NOT_FOUND_ROOM: 'heating.error.roomNotFound',
};

/**
 * Why a write of a schedule failed: a refusal with a code the service names reads in the language
 * of the interface; anything else is told like every other failed call.
 */
export function describeHeatingError(error: ApiError): DisplayText {
  const named = Object.entries(HEATING_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

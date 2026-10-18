import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of `blinds-service` (`BlindsError`, whose constant names are wire contract
 * there, pinned by `BlindsErrorTest`), each with a sentence of our own. A new or renamed code of
 * the service needs a text here - the test of this file lists them.
 */
export const BLINDS_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_BLINDS: 'blinds.error.notFound',
  UNSUPPORTED_POSITION: 'blinds.error.unsupportedPosition',
  PROTECTION_ACTIVE: 'blinds.error.protectionActive',
  DEVICE_FAILED: 'blinds.error.deviceFailed',
  REGISTRY_UNAVAILABLE: 'blinds.error.registryUnavailable',
  INVALID_SCHEDULE: 'blinds.error.invalidSchedule',
  NOT_FOUND_SCHEDULE: 'blinds.error.scheduleNotFound',
};

/**
 * Why a command or a read of the blinds failed. A refusal with a code the service names reads in
 * the language of the interface - also a 502 (`DEVICE_FAILED`, `REGISTRY_UNAVAILABLE`), whose
 * code is all the service says; anything else is told like every other failed call.
 */
export function describeBlindsError(error: ApiError): DisplayText {
  const named = Object.entries(BLINDS_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** The words for the code of a blind a room command skipped; a code this version does not know as it came. */
export function skippedReason(code: string | undefined): DisplayText | undefined {
  if (code === undefined) {
    return undefined;
  }
  return Object.hasOwn(BLINDS_ERROR_TEXTS, code)
    ? { key: BLINDS_ERROR_TEXTS[code] }
    : { literal: code };
}

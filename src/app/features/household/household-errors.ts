import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of the household registry (`CustomErrorDescription` of `database-service`,
 * whose constant names are wire contract), each with a sentence of our own. Two of them stand
 * for two causes the registry tells apart only in its English message - the form has checked
 * both before sending, so the sentence names both.
 */
export const HOUSEHOLD_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_HOUSEHOLD_MEMBER: 'household.error.memberNotFound',
  HOUSEHOLD_CONFLICT: 'household.error.memberConflict',
  INVALID_HOUSEHOLD_MEMBER: 'household.error.memberInvalid',
  DEVICE_EXIST: 'household.error.deviceExists',
  NOT_FOUND_MEMBER_DEVICE: 'household.error.deviceNotFound',
};

/**
 * Why the registry did not carry a change out. A refusal with a code it names reads in the
 * language of the interface; anything else is told like every other failed call.
 */
export function describeHouseholdError(error: ApiError): DisplayText {
  const named = Object.entries(HOUSEHOLD_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/**
 * What to say first about a change that failed. One that got no answer may have been carried
 * out all the same: that is not "was not carried out".
 */
export function changeSummary(error: ApiError): MessageKey {
  return error.kind === 'network' ? 'household.change.noAnswer' : 'household.change.failed';
}

import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of the device registry (`CustomErrorDescription` of `database-service`,
 * whose constant names are wire contract), each with a sentence of our own. The registry says
 * which rule a device broke, and which binding is taken, only in its English `details`; the
 * form has checked every one of them before sending, so the sentence names the kinds of cause.
 */
export const DEVICE_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_DEVICE: 'devices.error.notFound',
  INVALID_DEVICE: 'devices.error.invalid',
  DEVICE_CONFLICT: 'devices.error.conflict',
};

/**
 * Why the registry did not carry a change out. A refusal with a code it names reads in the
 * language of the interface; anything else is told like every other failed call.
 */
export function describeDeviceError(error: ApiError): DisplayText {
  const named = Object.entries(DEVICE_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/**
 * What to say first about a change that failed. One that got no answer may have been carried
 * out all the same: that is not "was not carried out".
 */
export function changeSummary(error: ApiError): MessageKey {
  return error.kind === 'network' ? 'devices.change.noAnswer' : 'devices.change.failed';
}

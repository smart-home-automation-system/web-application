import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of `water-service` (`WaterError`, whose constant names are wire contract there) the water page
 * meets, each with a sentence of our own. A new or renamed code of the service needs a text here - the test of this
 * file lists them. `REGISTRY_UNAVAILABLE` is a 503 whose own words never reach the screen; its code does.
 */
export const WATER_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_VALVE: 'water.error.valveNotFound',
  REGISTRY_UNAVAILABLE: 'water.error.registryUnavailable',
  INVALID_RANGE: 'water.error.invalidRange',
  // the bills and the command of the valve (HAS-323)
  INVALID_BILL: 'water.error.billInvalid',
  NOT_FOUND_BILL: 'water.error.billNotFound',
  INVALID_COMMAND: 'water.error.commandInvalid',
  DEVICE_FAILED: 'water.error.deviceFailed',
};

/** A failed call of the water page: a code of the service in our words, anything else as usual. */
export function describeWaterError(error: ApiError): DisplayText {
  const named = Object.entries(WATER_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

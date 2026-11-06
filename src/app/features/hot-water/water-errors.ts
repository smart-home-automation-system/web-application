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
  // the circulation pump (HAS-404): the tank below the minimum of the service
  TANK_COLD: 'water.error.tankCold',
};

/**
 * The refusals of a start of the circulation pump: `DEVICE_FAILED` is shared with the valve in `water-service`, so
 * the pump has its own words for it.
 */
const CIRCULATION_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  ...WATER_ERROR_TEXTS,
  DEVICE_FAILED: 'hotWater.circulation.deviceFailed',
};

/** A failed call of the water page: a code of the service in our words, anything else as usual. */
export function describeWaterError(error: ApiError): DisplayText {
  return describeWith(WATER_ERROR_TEXTS, error);
}

/** A failed start of the circulation pump, the pump named where the service's code is shared with the valve. */
export function describeCirculationError(error: ApiError): DisplayText {
  return describeWith(CIRCULATION_ERROR_TEXTS, error);
}

function describeWith(texts: Readonly<Record<string, MessageKey>>, error: ApiError): DisplayText {
  const named = Object.entries(texts).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

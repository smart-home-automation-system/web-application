import { ApiError } from '../../core/api/api-error';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The named refusals of `energy-service` (`EnergyError`, whose constant names are wire contract
 * there), each with a sentence of our own. A new or renamed code of the service needs a text here -
 * the test of this file lists them. `REGISTRY_UNAVAILABLE` is a 503 whose own words never reach the
 * screen; its code does.
 */
export const ENERGY_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_INVERTER: 'energy.error.inverterNotFound',
  REGISTRY_UNAVAILABLE: 'energy.error.registryUnavailable',
  INVALID_RANGE: 'energy.error.invalidRange',
  UNKNOWN_METRIC: 'energy.error.unknownMetric',
};

/** A failed call of the energy page: a code of the service in our words, anything else as usual. */
export function describeEnergyError(error: ApiError): DisplayText {
  const named = Object.entries(ENERGY_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

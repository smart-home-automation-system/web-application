import { ApiError } from '../../core/api/api-error';
import { CommandState } from '../../core/api/device-commands';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';

/**
 * The named refusals of the lights in `light-service` (`LightError`, whose constant names are wire
 * contract there, pinned by `LightErrorTest`), each with a sentence of our own - the codes of a
 * command and, since the editor of the rules (HAS-267), of a rule. `INVALID_RULE` carries its reason
 * in `details` only, which never reaches the screen: its text says that the service refused what this
 * page could not check. A new or renamed code needs a text here - the test of this file lists them.
 */
export const LIGHT_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_LIGHT: 'lights.error.notFound',
  UNSUPPORTED_CAPABILITY: 'lights.error.unsupportedCapability',
  DEVICE_FAILED: 'lights.error.deviceFailed',
  REGISTRY_UNAVAILABLE: 'lights.error.registryUnavailable',
  INVALID_RULE: 'lights.error.invalidRule',
  NOT_FOUND_RULE: 'lights.error.notFoundRule',
};

/**
 * Why a command or a read of the lights failed. A refusal with a code the service names reads in
 * the language of the interface - also a 502 (`DEVICE_FAILED`, `REGISTRY_UNAVAILABLE`), whose code
 * is all the service says; anything else is told like every other failed call.
 */
export function describeLightError(error: ApiError): DisplayText {
  const named = Object.entries(LIGHT_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** A failed command in words: one that got no answer may have been carried out all the same. */
export function lightFailureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'lights.commandFailed' }
    : describeLightError(error);
}

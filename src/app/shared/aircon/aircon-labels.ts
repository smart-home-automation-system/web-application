import { ApiError } from '../../core/api/api-error';
import { CommandState } from '../../core/api/device-commands';
import { AirconFanSpeed, AirconMode, AirconUnit } from '../../data-access/aircon/aircon-api';
import { CommandProblem } from '../../data-access/aircon/aircon-command-rules';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';

/** The words of the modes of `aircon-service` (HAS-394); a word this version does not know is printed as it came. */
export const AIRCON_MODE_LABELS: Readonly<Record<AirconMode, MessageKey>> = {
  auto: 'aircon.mode.auto',
  cool: 'aircon.mode.cool',
  dry: 'aircon.mode.dry',
  fan: 'aircon.mode.fan',
  heat: 'aircon.mode.heat',
};

export const AIRCON_FAN_LABELS: Readonly<Record<AirconFanSpeed, MessageKey>> = {
  auto: 'aircon.fan.auto',
  low: 'aircon.fan.low',
  'medium-low': 'aircon.fan.mediumLow',
  medium: 'aircon.fan.medium',
  'medium-high': 'aircon.fan.mediumHigh',
  high: 'aircon.fan.high',
};

/** The word of a mode, or the word itself when this version does not know it. */
export function modeText(mode: string): DisplayText {
  const key = (AIRCON_MODE_LABELS as Readonly<Record<string, MessageKey>>)[mode];
  return key === undefined ? { literal: mode } : { key };
}

export function fanText(fan: string): DisplayText {
  const key = (AIRCON_FAN_LABELS as Readonly<Record<string, MessageKey>>)[fan];
  return key === undefined ? { literal: fan } : { key };
}

/** On, off, or not known - a unit that never reported its power is never off. */
export type AirconState = 'on' | 'off' | 'unknown';

export function airconStateOf(unit: AirconUnit): AirconState {
  if (unit.power === undefined) {
    return 'unknown';
  }
  return unit.power ? 'on' : 'off';
}

export const AIRCON_STATE_LABELS: Readonly<Record<AirconState, MessageKey>> = {
  on: 'aircon.state.on',
  off: 'aircon.state.off',
  unknown: 'aircon.state.unknown',
};

/**
 * The named refusals of `aircon-service` (`AirconError`, whose names are wire contract there, pinned by
 * `AirconErrorTest`) that a card meets, each with a sentence of our own. The English reason of
 * `INVALID_COMMAND` never reaches the screen: the card checks a copy of `CommandRules` first. A new
 * code needs a text here - the test of this file lists them.
 */
export const AIRCON_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_AIRCON: 'aircon.error.notFound',
  INVALID_COMMAND: 'aircon.error.invalidCommand',
  DEVICE_FAILED: 'aircon.error.deviceFailed',
  REGISTRY_UNAVAILABLE: 'aircon.error.registryUnavailable',
};

export function describeAirconError(error: ApiError): DisplayText {
  const named = Object.entries(AIRCON_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** A failed command in words: one that got no answer may have been carried out all the same. */
export function airconFailureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'aircon.commandFailed' }
    : describeAirconError(error);
}

/** Why the card does not send a command, in the words of the rules of `aircon-service`. */
export const COMMAND_PROBLEM_TEXTS: Readonly<Record<CommandProblem, MessageKey>> = {
  targetRange: 'aircon.problem.targetRange',
  coolingMinimum: 'aircon.problem.coolingMinimum',
  boostMode: 'aircon.problem.boostMode',
};

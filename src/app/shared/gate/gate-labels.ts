import { ApiError } from '../../core/api/api-error';
import { CommandState } from '../../core/api/device-commands';
import { GarageAlert, GarageGate, GarageState, GateEvent } from '../../data-access/gate/gate-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';

/**
 * The named refusals of `gate-service` (`GateError`, whose names are wire contract there, pinned by `GateErrorTest`),
 * each with a sentence of our own. A new code needs a text here - the test of this file lists them.
 */
export const GATE_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  UNKNOWN_MEMBER: 'gate.error.unknownMember',
  OPEN_TOO_SOON: 'gate.error.openTooSoon',
  DEVICE_FAILED: 'gate.error.deviceFailed',
  GATE_UNAVAILABLE: 'gate.error.gateUnavailable',
  REGISTRY_UNAVAILABLE: 'gate.error.registryUnavailable',
  INVALID_RANGE: 'gate.error.invalidRange',
  NOT_FOUND_GATE: 'gate.error.notFoundGate',
};

export function describeGateError(error: ApiError): DisplayText {
  const named = Object.entries(GATE_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** A failed press in words: one that got no answer may have moved the gate all the same. */
export function gateFailureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'gate.commandFailed' }
    : describeGateError(error);
}

/** Open, closed, or not known - a state the gate does not send, or a word this version does not know, is never closed. */
export function garageStateOf(gate: GarageGate): GarageState {
  return gate.state === 'open' || gate.state === 'closed' ? gate.state : 'unknown';
}

export const GARAGE_STATE_LABELS: Readonly<Record<GarageState, MessageKey>> = {
  open: 'gate.garage.state.open',
  closed: 'gate.garage.state.closed',
  unknown: 'gate.garage.state.unknown',
};

/**
 * The one button of a garage gate (owner, 2026-11-18): what a pulse does from the state the gate is in - it opens a
 * closed gate, closes an open one; not known, it only runs the drive.
 */
export const GARAGE_BUTTON_LABELS: Readonly<Record<GarageState, MessageKey>> = {
  open: 'gate.garage.close',
  closed: 'gate.garage.open',
  unknown: 'gate.garage.run',
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long something lasted, in whole minutes: under a minute, minutes, hours and minutes, days and hours. */
export function durationText(ms: number): DisplayText {
  if (ms < MINUTE_MS) {
    return { key: 'gate.duration.underMinute' };
  }
  if (ms < HOUR_MS) {
    return { key: 'gate.duration.minutes', params: { minutes: Math.floor(ms / MINUTE_MS) } };
  }
  if (ms < DAY_MS) {
    return {
      key: 'gate.duration.hours',
      params: { hours: Math.floor(ms / HOUR_MS), minutes: Math.floor((ms % HOUR_MS) / MINUTE_MS) },
    };
  }
  return {
    key: 'gate.duration.days',
    params: { days: Math.floor(ms / DAY_MS), hours: Math.floor((ms % DAY_MS) / HOUR_MS) },
  };
}

/** The kinds of the alarms of a garage gate (HAS-475), the words of `gate-service`. */
export const GARAGE_ALERT_LABELS: Readonly<Record<string, MessageKey>> = {
  cold: 'gate.alert.cold',
  'empty house': 'gate.alert.emptyHouse',
  long: 'gate.alert.long',
};

/** What an alarm is about, or the word itself when this version does not know it. */
export function alertText(alert: GarageAlert): DisplayText {
  const key = alert.kind === undefined ? undefined : GARAGE_ALERT_LABELS[alert.kind];
  return key !== undefined ? { key } : { literal: alert.kind ?? '?' };
}

/** An alarm, or a warning - a level not known reads as an alarm, the louder of the two. */
export function isWarning(alert: GarageAlert): boolean {
  return alert.level === 'warning';
}

/**
 * One line of the timeline: what happened in our words, and the words from outside printed beside them as they are -
 * the garage gate it was about (its name) and the member who pressed (their name). Never a translation parameter.
 */
export interface EventLine {
  readonly what: DisplayText;
  readonly gate?: string;
  readonly member?: string;
  /** How long a garage gate stood open, for a closing. */
  readonly lasted?: DisplayText;
}

const COMMAND_TEXTS: Readonly<Record<string, MessageKey>> = {
  opened: 'gate.event.opened',
  pulsed: 'gate.event.pulsed',
  failed: 'gate.event.failed',
  'too soon': 'gate.event.tooSoon',
  unavailable: 'gate.event.unavailable',
};

/** The words of one item of the timeline; `gateName` names a garage gate by its id. */
export function eventLine(
  event: GateEvent,
  gateName: (id: number) => string | undefined,
): EventLine {
  const gate = event.gate === undefined ? undefined : (gateName(event.gate) ?? `#${event.gate}`);
  switch (event.kind) {
    case 'ring':
      return { what: { key: 'gate.event.ring' } };
    case 'dismissed':
      return { what: { key: 'gate.event.dismissed' } };
    case 'unlock':
      return {
        what: {
          key: event.unlockType === 'HOUSEHOLDER' ? 'gate.event.unlockScreen' : 'gate.event.unlock',
        },
      };
    case 'command': {
      // the screen opens the driveway gate by the unlock of the door station: no member, its own words
      const key =
        event.source === 'screen' && event.outcome === 'opened'
          ? 'gate.event.openedScreen'
          : event.outcome === undefined
            ? undefined
            : COMMAND_TEXTS[event.outcome];
      return {
        what: key !== undefined ? { key } : { literal: event.outcome ?? '?' },
        ...(gate === undefined ? {} : { gate }),
        ...(event.member === undefined ? {} : { member: event.member }),
      };
    }
    case 'garage':
      return {
        what: {
          key: event.state === 'open' ? 'gate.event.garageOpened' : 'gate.event.garageClosed',
        },
        ...(gate === undefined ? {} : { gate }),
        ...(event.state !== 'open' && event.openForSeconds !== undefined
          ? { lasted: durationText(event.openForSeconds * 1_000) }
          : {}),
      };
    default:
      return { what: { literal: event.kind ?? '?' } };
  }
}

/** Where an opening of the driveway gate came from: the indoor screen, the dashboard, or a word not known. */
export function openingSourceText(source: string | undefined): DisplayText {
  if (source === 'screen') {
    return { key: 'gate.driveway.fromScreen' };
  }
  if (source === 'dashboard') {
    return { key: 'gate.driveway.fromDashboard' };
  }
  return { literal: source ?? '?' };
}

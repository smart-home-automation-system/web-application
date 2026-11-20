import { ApiError } from '../../core/api/api-error';
import { CommandState } from '../../core/api/device-commands';
import {
  BaseStatus,
  Detector,
  SafetyBase,
  SafetyFlag,
  SafetyReaction,
  SafetyRead,
} from '../../data-access/safety/safety-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';
import { FLOORS, OTHER_FLOOR } from '../floors/floors';

/**
 * The named refusals of `safety-service` (its `SafetyError`, whose names are wire contract there), each with a
 * sentence of our own. A new code needs a text here - the test of this file lists them.
 */
export const SAFETY_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_DETECTOR: 'safety.error.notFoundDetector',
  COMMAND_TOO_SOON: 'safety.error.commandTooSoon',
  INVALID_AUTOMATION: 'safety.error.invalidAutomation',
  REGISTRY_UNAVAILABLE: 'safety.error.registryUnavailable',
  NOT_FOUND_ROOM: 'safety.error.notFoundRoom',
  INVALID_RANGE: 'safety.error.invalidRange',
};

export function describeSafetyError(error: ApiError): DisplayText {
  const named = Object.entries(SAFETY_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** A failed command in words: one that got no answer may have been carried out all the same. */
export function commandFailureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'safety.commandFailed' }
    : describeSafetyError(error);
}

/** A flag the answer leaves out - whole, or its value - is not known: never false. */
export type FlagValue = 'yes' | 'no' | 'unknown';

export function flagOf(flag: SafetyFlag | undefined): FlagValue {
  if (flag?.value === true) {
    return 'yes';
  }
  return flag?.value === false ? 'no' : 'unknown';
}

/**
 * The state of a detector in a word: an alarm first, then muted, then off the base; all right only when the answer
 * says so of the alarm, the base and the mute alike - a flag left out is "not known", never all right.
 */
export const DETECTOR_STATES = ['alarm', 'muted', 'offline', 'ok', 'unknown'] as const;
export type DetectorState = (typeof DETECTOR_STATES)[number];

export function detectorStateOf(detector: Detector): DetectorState {
  const alarm = flagOf(detector.alarm);
  const muted = flagOf(detector.muted);
  const online = flagOf(detector.online);
  if (alarm === 'yes') {
    return 'alarm';
  }
  if (muted === 'yes') {
    return 'muted';
  }
  if (online === 'no') {
    return 'offline';
  }
  return alarm === 'no' && muted === 'no' && online === 'yes' ? 'ok' : 'unknown';
}

export const DETECTOR_STATE_LABELS: Readonly<Record<DetectorState, MessageKey>> = {
  alarm: 'safety.state.alarm',
  muted: 'safety.state.muted',
  offline: 'safety.state.offline',
  ok: 'safety.state.ok',
  unknown: 'safety.state.unknown',
};

/** The icon beside the word - the colour is never the only sign. */
export const DETECTOR_STATE_ICONS: Readonly<Record<DetectorState, string>> = {
  alarm: 'local_fire_department',
  muted: 'notifications_off',
  offline: 'wifi_off',
  ok: 'check_circle',
  unknown: 'help',
};

/** The kind of a detector in words, or the word itself for a kind this version does not know. */
export function detectorKindText(kind: string | undefined): DisplayText {
  switch (kind) {
    case 'smoke detector':
      return { key: 'safety.kind.smoke' };
    case 'co detector':
      return { key: 'safety.kind.co' };
    case 'heat detector':
      return { key: 'safety.kind.heat' };
    default:
      return kind === undefined ? { key: 'safety.kind.unknown' } : { literal: kind };
  }
}

/** The name of a detector as the registry gives it, or its id. */
export function detectorName(detector: { readonly name?: string; readonly id?: number }): string {
  return detector.name ?? `#${detector.id ?? '?'}`;
}

/** The detectors of an answer with an id; `undefined` while there is no answer yet. */
export function detectorsOf(read: SafetyRead | null | undefined): readonly Detector[] | undefined {
  if (read === undefined) {
    return undefined;
  }
  const detectors = read?.detectors;
  return Array.isArray(detectors) ? detectors.filter((detector) => detector.id !== undefined) : [];
}

/** The detectors in alarm - the banner of every page. */
export function detectorsInAlarm(read: SafetyRead | null | undefined): readonly Detector[] {
  return (detectorsOf(read) ?? []).filter((detector) => flagOf(detector.alarm) === 'yes');
}

/** The detectors of one room, by name - the card of My room. */
export function detectorsOfRoom(
  read: SafetyRead | null | undefined,
  room: string,
): readonly Detector[] | undefined {
  const all = detectorsOf(read);
  return all
    ?.filter((detector) => detector.room === room)
    .sort((a, b) => detectorName(a).localeCompare(detectorName(b)));
}

/** Whether a detector needs a look: off its base, a low battery, its end of life, a fault. */
export function inTrouble(detector: Detector): boolean {
  return (
    flagOf(detector.online) === 'no' ||
    flagOf(detector.batteryLow) === 'yes' ||
    flagOf(detector.endOfLife) === 'yes' ||
    flagOf(detector.fault) === 'yes'
  );
}

/** Whether anything that decides "all right" is left out of the answer. */
function partlyUnknown(detector: Detector): boolean {
  return (
    detectorStateOf(detector) === 'unknown' ||
    [detector.batteryLow, detector.endOfLife, detector.fault].some(
      (flag) => flagOf(flag) === 'unknown',
    )
  );
}

/** What the tile of the overview says of the house: an alarm, a detector in trouble, not known, or all right. */
export type SafetyHouseState = 'alarm' | 'trouble' | 'unknown' | 'ok';

export interface SafetySummary {
  readonly state: SafetyHouseState;
  readonly total: number;
  /** The names of the detectors in alarm, joined in TypeScript (`preserveWhitespaces` adds a space before a comma). */
  readonly inAlarm: string;
  /** The names of the detectors in trouble. */
  readonly inTrouble: string;
  /** How many detectors the answer says too little of. */
  readonly unknown: number;
}

export function summariseSafety(read: SafetyRead | null | undefined): SafetySummary | undefined {
  const detectors = detectorsOf(read);
  if (detectors === undefined) {
    return undefined;
  }
  const alarm = detectors.filter((detector) => detectorStateOf(detector) === 'alarm');
  const trouble = detectors.filter(
    (detector) => detectorStateOf(detector) !== 'alarm' && inTrouble(detector),
  );
  const unknown = detectors.filter(
    (detector) =>
      detectorStateOf(detector) !== 'alarm' && !inTrouble(detector) && partlyUnknown(detector),
  );
  let state: SafetyHouseState = 'ok';
  if (alarm.length > 0) {
    state = 'alarm';
  } else if (trouble.length > 0) {
    state = 'trouble';
  } else if (unknown.length > 0) {
    state = 'unknown';
  }
  return {
    state,
    total: detectors.length,
    inAlarm: alarm.map(detectorName).join(', '),
    inTrouble: trouble.map(detectorName).join(', '),
    unknown: unknown.length,
  };
}

/** The detectors of one room on the page. */
export interface RoomDetectors {
  /** The identifier of the room as the registry has it; empty for a detector without one. */
  readonly room: string;
  readonly detectors: readonly Detector[];
}

/** A part of the house with the rooms that have a detector. */
export interface FloorDetectors {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly RoomDetectors[];
}

/**
 * The detectors by floor and room in the order of the house (`FLOORS`) - only the rooms that have one; a room `FLOORS`
 * does not know, and a detector without a room, go into the last group. Within a room by name.
 */
export function detectorsByFloor(detectors: readonly Detector[]): FloorDetectors[] {
  const byRoom = new Map<string, Detector[]>();
  for (const detector of detectors) {
    const room = detector.room ?? '';
    byRoom.set(room, [...(byRoom.get(room) ?? []), detector]);
  }
  const roomOf = (room: string): RoomDetectors[] => {
    const here = byRoom.get(room);
    return here === undefined
      ? []
      : [
          {
            room,
            detectors: [...here].sort((a, b) => detectorName(a).localeCompare(detectorName(b))),
          },
        ];
  };
  const placed = new Set(FLOORS.flatMap((floor) => floor.rooms));
  const elsewhere = [...byRoom.keys()]
    .filter((room) => !placed.has(room))
    .sort((a, b) => a.localeCompare(b));
  return [
    ...FLOORS.map(({ id, label, rooms }): FloorDetectors => ({
      id,
      label,
      rooms: rooms.flatMap(roomOf),
    })),
    { ...OTHER_FLOOR, rooms: elsewhere.flatMap(roomOf) },
  ].filter((floor) => floor.rooms.length > 0);
}

/** A base on the page: what `GET /safety` and the technical monitor say of it, joined by its serial. */
export interface BaseView {
  readonly stationSerial?: string;
  readonly reachable?: boolean;
  readonly wifiSsid?: string;
  readonly wifiRssi?: number;
  readonly lastHeardAt?: string;
  readonly silent?: boolean;
}

/**
 * The bases of the technical monitor with the Wi-Fi network of the same base from `GET /safety`; `undefined` while
 * the monitor has not answered. A base only one of the two names is kept too.
 */
export function baseViews(
  status: readonly BaseStatus[] | undefined,
  bases: readonly SafetyBase[] | undefined,
): readonly BaseView[] | undefined {
  if (status === undefined) {
    return undefined;
  }
  const known = new Map((bases ?? []).map((base) => [base.stationSerial, base]));
  const listed = new Set(status.map((base) => base.stationSerial));
  return [
    ...status.map((base) => joinedBase(base, known.get(base.stationSerial))),
    ...(bases ?? []).filter((base) => !listed.has(base.stationSerial)).map(unmonitoredBase),
  ];
}

/** A base of the monitor with what `GET /safety` adds: its network, and its signal and last word where the monitor has none. */
function joinedBase(base: BaseStatus, read: SafetyBase | undefined): BaseView {
  return {
    ...base,
    ...withValue('wifiSsid', read?.wifiSsid),
    ...withValue('wifiRssi', base.wifiRssi ?? read?.wifiRssi),
    ...withValue('lastHeardAt', base.lastHeardAt ?? read?.lastHeardAt),
  };
}

/** A base only `GET /safety` names. */
function unmonitoredBase(base: SafetyBase): BaseView {
  return {
    ...withValue('stationSerial', base.stationSerial),
    ...withValue('reachable', base.online?.value),
    ...withValue('wifiSsid', base.wifiSsid),
    ...withValue('wifiRssi', base.wifiRssi),
    ...withValue('lastHeardAt', base.lastHeardAt),
  };
}

/** A field set only when there is a value - a field left out is "not known", never sent as `undefined`. */
function withValue<K extends keyof BaseView>(
  key: K,
  value: BaseView[K] | undefined,
): Partial<BaseView> {
  return value === undefined ? {} : ({ [key]: value } as Partial<BaseView>);
}

/** The bases the technical monitor calls silent - the banner of the administrator. */
export function silentBases(status: readonly BaseStatus[] | null | undefined): readonly string[] {
  return (status ?? [])
    .filter((base) => base.silent === true)
    .map((base) => base.stationSerial ?? '?');
}

/** The words of a switch of the reactions (HAS-468). */
export const REACTION_LABELS: Readonly<Record<SafetyReaction, MessageKey>> = {
  lightsOn: 'safety.automation.lightsOn',
  blindsUp: 'safety.automation.blindsUp',
  airconOff: 'safety.automation.airconOff',
};

/** A reaction of a run in words, or the word itself when this version does not know it. */
export function reactionText(reaction: string | undefined): DisplayText {
  const key =
    reaction !== undefined && Object.hasOwn(REACTION_LABELS, reaction)
      ? REACTION_LABELS[reaction as SafetyReaction]
      : undefined;
  return key === undefined ? { literal: reaction ?? '?' } : { key };
}

import { Light, Occupancy } from '../../data-access/light/light-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { LIGHT_ERROR_TEXTS } from './light-errors';

/**
 * The words of the lights (HAS-266) for the values of `light-service`. Every one of them is the
 * service's word: a value this version does not know is printed as it came (a `literal`), never
 * read as one it knows - a Shelly device names the source of a change in its own words
 * (`HTTP_in`, `button`).
 */

function textOf(
  labels: Readonly<Record<string, MessageKey>>,
  value: string | undefined,
  missing: MessageKey,
): DisplayText {
  if (value === undefined) {
    return { key: missing };
  }
  return Object.hasOwn(labels, value) ? { key: labels[value] } : { literal: value };
}

const SOURCES: Readonly<Record<string, MessageKey>> = {
  dashboard: 'lights.source.dashboard',
  rule: 'lights.source.rule',
  'empty-house': 'lights.source.emptyHouse',
  external: 'lights.source.external',
  switch: 'lights.source.switch',
  button: 'lights.source.button',
};

/** Who changed a light last: this application, the rules, the empty house, or the device's word. */
export function lightSourceText(source: string | undefined): DisplayText {
  return textOf(SOURCES, source, 'lights.source.unknown');
}

const REASONS: Readonly<Record<string, MessageKey>> = {
  'auto-off': 'lights.reason.autoOff',
  'motion-on': 'lights.reason.motionOn',
  'motion-off': 'lights.reason.motionOff',
  'empty-house': 'lights.reason.emptyHouse',
  'presence-simulation': 'lights.reason.presenceSimulation',
};

/** Why the engine sent a command (`light_rule_run`). */
export function runReasonText(reason: string | undefined): DisplayText {
  return textOf(REASONS, reason, 'lights.reason.unknown');
}

/** What the engine sent: on or off. */
export function runActionText(action: string | undefined): DisplayText {
  return textOf(
    { on: 'lights.action.on', off: 'lights.action.off' },
    action,
    'lights.action.unknown',
  );
}

/** The word of a Presence for the light in a room. */
export function illuminationText(illumination: string): DisplayText {
  return textOf(
    {
      dark: 'lights.illumination.dark',
      twilight: 'lights.illumination.twilight',
      bright: 'lights.illumination.bright',
    },
    illumination,
    'lights.illumination.dark',
  );
}

/** Whether anybody is at home, as the empty house of the service judges it. */
export function houseText(house: string | undefined): DisplayText {
  return textOf(
    {
      empty: 'lights.emptyHouse.house.empty',
      occupied: 'lights.emptyHouse.house.occupied',
      unknown: 'lights.emptyHouse.house.unknown',
    },
    house,
    'lights.emptyHouse.house.unknown',
  );
}

/** The phase of the night the presence simulation is in. */
export function phaseText(phase: string): DisplayText {
  return textOf(
    {
      evening: 'lights.emptyHouse.phase.evening',
      night: 'lights.emptyHouse.phase.night',
      morning: 'lights.emptyHouse.phase.morning',
    },
    phase,
    'lights.emptyHouse.phase.night',
  );
}

/** The kind of a sensor of the occupancy, in the words of the device registry. */
export function sensorKindText(kind: string | undefined): DisplayText {
  return textOf(
    {
      'presence sensor': 'devices.kind.presenceSensor',
      'motion sensor': 'devices.kind.motionSensor',
    },
    kind,
    'lights.sensor.kindUnknown',
  );
}

/** Why a light did not take a command of the engine: the code of `LightError`, in our words where we have them. */
export function runErrorText(code: string): DisplayText {
  return Object.hasOwn(LIGHT_ERROR_TEXTS, code)
    ? { key: LIGHT_ERROR_TEXTS[code] }
    : { literal: code };
}

/** Whether a light is on as the service reports it - `unknown` when it says nothing, never off. */
export type LightState = 'on' | 'off' | 'unknown';

export function stateOf(light: Light | undefined): LightState {
  const on = light?.on;
  return on === true ? 'on' : on === false ? 'off' : 'unknown';
}

export const LIGHT_STATE_LABELS: Readonly<Record<LightState, MessageKey>> = {
  on: 'lights.state.on',
  off: 'lights.state.off',
  unknown: 'lights.state.unknown',
};

/** Whether a light takes a brightness: a dimmer or an rgbw light. */
export function dims(light: Light): boolean {
  return light.kind === 'dimmer' || light.kind === 'rgbw';
}

/** Whether a room is occupied: occupied, empty, or not known - never empty for want of a sensor. */
export type OccupancyState = 'occupied' | 'empty' | 'unknown';

export function occupancyOf(occupancy: Occupancy | undefined): OccupancyState {
  const occupied = occupancy?.occupied;
  return occupied === true ? 'occupied' : occupied === false ? 'empty' : 'unknown';
}

export const OCCUPANCY_LABELS: Readonly<Record<OccupancyState, MessageKey>> = {
  occupied: 'lights.occupancy.occupied',
  empty: 'lights.occupancy.empty',
  unknown: 'lights.occupancy.unknown',
};

/** The three parts of a color as a CSS color, or `undefined` when they are not three bytes. */
export function cssColorOf(rgb: readonly number[] | undefined): string | undefined {
  if (
    !Array.isArray(rgb) ||
    rgb.length !== 3 ||
    !rgb.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    return undefined;
  }
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** A number of lux: 0 is a reading, anything that is not a number is none. */
export function isLux(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

import { MotionPeriod, RoomRuleBody } from '../../../data-access/light/light-api';
import { MessageKey } from '../../../i18n/messages';

/**
 * The rules of the rule of a room - a copy of `RoomRuleRules` of `light-service` 0.9.x, which
 * answers `INVALID_RULE` with the first rule a body breaks (the reason only in `details`, which
 * never reaches the screen). The editor checks every one of them before it sends, field by field,
 * so that a refusal says which field it is about; the service checks them again. **A rule changed
 * there is changed here** (the test of this file pins the numbers).
 *
 * Two halves, as in the service: `ruleProblem` reads the body alone, `roomProblem` what the device
 * registry knows of the room - its lights and its presence and motion sensors.
 *
 * A rule answers the key of the sentence that says what is wrong, or `undefined`.
 */

export const MIN_DELAY_MINUTES = 1;
export const MAX_DELAY_MINUTES = 180;
export const MIN_LUX = 1;
export const MAX_LUX = 100_000;
export const MAX_PERIODS = 12;
export const MIN_BRIGHTNESS = 1;
export const MAX_BRIGHTNESS = 100;
export const MAX_CHANNEL = 255;

const MINUTES_OF_A_DAY = 24 * 60;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WHOLE = /^\d+$/;

/** A whole number typed in a field: `undefined` for a text that is none. */
export function wholeOf(text: string): number | undefined {
  const value = text.trim();
  return WHOLE.test(value) ? Number(value) : undefined;
}

/**
 * The minutes of a delay or of the hold: a whole number, 1 to 180. `required` - a delay of a rule
 * that is off may be left out (the service keeps it for later), never one outside the range.
 */
export function minutesProblem(text: string, required: boolean): MessageKey | undefined {
  if (text.trim() === '') {
    return required ? 'lights.editor.problem.minutesMissing' : undefined;
  }
  const minutes = wholeOf(text);
  if (minutes === undefined) {
    return 'lights.editor.problem.wholeNumber';
  }
  return minutes < MIN_DELAY_MINUTES || minutes > MAX_DELAY_MINUTES
    ? 'lights.editor.problem.minutesRange'
    : undefined;
}

/** The lux below which a motion lights the room: optional, a whole number, 1 to 100 000. */
export function luxProblem(text: string): MessageKey | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const lux = wholeOf(text);
  if (lux === undefined) {
    return 'lights.editor.problem.wholeNumber';
  }
  return lux < MIN_LUX || lux > MAX_LUX ? 'lights.editor.problem.luxRange' : undefined;
}

/** `HH:mm`, local time of the house - what a time field of the browser gives. Both ends are needed. */
export function timeProblem(text: string): MessageKey | undefined {
  if (text.trim() === '') {
    return 'lights.editor.problem.timeMissing';
  }
  return TIME.test(text.trim()) ? undefined : 'lights.editor.problem.timeInvalid';
}

/** The brightness of a period: optional - a light comes on as it keeps itself - 1 to 100. */
export function brightnessProblem(text: string): MessageKey | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const value = wholeOf(text);
  if (value === undefined) {
    return 'lights.editor.problem.wholeNumber';
  }
  return value < MIN_BRIGHTNESS || value > MAX_BRIGHTNESS
    ? 'lights.editor.problem.brightnessRange'
    : undefined;
}

/** The white of a period: optional, 0 to 255. */
export function whiteProblem(text: string): MessageKey | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const value = wholeOf(text);
  if (value === undefined) {
    return 'lights.editor.problem.wholeNumber';
  }
  return value > MAX_CHANNEL ? 'lights.editor.problem.whiteRange' : undefined;
}

const isChannel = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_CHANNEL;

/** Red, green and blue, 0 to 255 each - what the service accepts as `rgb`. */
export function isRgb(rgb: unknown): rgb is readonly [number, number, number] {
  return Array.isArray(rgb) && rgb.length === 3 && rgb.every(isChannel);
}

/** A period whose times are both valid, as the minutes of a day it covers - from included, to not. */
function pieces(period: MotionPeriod): readonly (readonly [number, number])[] | undefined {
  if (!TIME.test(period.from ?? '') || !TIME.test(period.to ?? '')) {
    return undefined;
  }
  const from = minutesOf(period.from!);
  const to = minutesOf(period.to!);
  if (from === to) {
    return [[0, MINUTES_OF_A_DAY]];
  }
  // one that crosses midnight is two pieces
  return from < to
    ? [[from, to]]
    : [
        [from, MINUTES_OF_A_DAY],
        [0, to],
      ];
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Whether two periods share a minute. One may end where the next starts; a period whose from and
 * to are the same is the whole day; one with a time not yet valid overlaps nothing.
 */
export function overlap(first: MotionPeriod, second: MotionPeriod): boolean {
  const one = pieces(first);
  const other = pieces(second);
  if (one === undefined || other === undefined) {
    return false;
  }
  return one.some(([from, to]) => other.some(([start, end]) => from < end && start < to));
}

/** The first two periods that overlap, by their place in the list - or `undefined`. */
export function overlapping(
  periods: readonly MotionPeriod[],
): readonly [number, number] | undefined {
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      if (overlap(periods[i], periods[j])) {
        return [i, j];
      }
    }
  }
  return undefined;
}

/** A period whose `rgb` or `white` is set: it needs an rgbw light. */
export function colored(period: MotionPeriod): boolean {
  return period.rgb !== undefined || period.white !== undefined;
}

/**
 * The first rule a whole body breaks, in the order of the service - for the mock API, which refuses
 * what `light-service` refuses, and for the editor as the last check before a save.
 */
export function ruleProblem(rule: RoomRuleBody): MessageKey | undefined {
  if (typeof rule.autoOffEnabled !== 'boolean' || typeof rule.motionOnEnabled !== 'boolean') {
    return 'lights.editor.problem.invalid';
  }
  const delay = (minutes: unknown, enabled: boolean) =>
    minutes === undefined || minutes === null
      ? enabled
        ? 'lights.editor.problem.minutesMissing'
        : undefined
      : minutesProblem(String(minutes), true);
  const periods = Array.isArray(rule.periods) ? rule.periods : undefined;
  return (
    delay(rule.autoOffDelayMinutes, rule.autoOffEnabled) ??
    delay(rule.motionOffAfterMinutes, rule.motionOnEnabled) ??
    (typeof rule.manualHoldMinutes !== 'number'
      ? 'lights.editor.problem.minutesMissing'
      : minutesProblem(String(rule.manualHoldMinutes), true)) ??
    (rule.onlyBelowLux === undefined ? undefined : luxProblem(String(rule.onlyBelowLux))) ??
    (periods === undefined || periods.length > MAX_PERIODS
      ? 'lights.editor.problem.invalid'
      : undefined) ??
    (periods ?? []).map(periodProblem).find((problem) => problem !== undefined) ??
    (overlapping(periods ?? []) ? 'lights.editor.problem.overlap' : undefined) ??
    (rule.motionOnEnabled && (periods ?? []).length === 0
      ? 'lights.editor.problem.noPeriod'
      : undefined)
  );
}

function periodProblem(period: MotionPeriod | null | undefined): MessageKey | undefined {
  if (period === null || typeof period !== 'object') {
    return 'lights.editor.problem.invalid';
  }
  return (
    timeProblem(period.from ?? '') ??
    timeProblem(period.to ?? '') ??
    (period.brightness === undefined ? undefined : brightnessProblem(String(period.brightness))) ??
    (period.rgb === undefined || isRgb(period.rgb) ? undefined : 'lights.editor.problem.invalid') ??
    (period.white === undefined ? undefined : whiteProblem(String(period.white)))
  );
}

/** What the device registry knows of a room, as the service judges a rule by it. */
export interface RoomDevices {
  /** Its lights with a `lightKind` - a light without one is no light of the service. */
  readonly lights: readonly { readonly lightKind?: string }[];
  /** Its presence and motion sensors. */
  readonly sensors: readonly RoomSensor[];
}

export interface RoomSensor {
  /** `presence sensor` or `motion sensor`. */
  readonly kind?: string;
  /** An Eaton PIR does not count: the halls on Eaton PIRs stay in NetLinx (owner, HAS-262). */
  readonly eaton: boolean;
}

/** Whether a room has sensors and every one is an Eaton PIR - no rule may be written for it. */
export function eatonOnly(devices: RoomDevices): boolean {
  return devices.sensors.length > 0 && devices.sensors.every((sensor) => sensor.eaton);
}

/**
 * The first rule the room breaks for the rule, in the order of `checkRoom` of the service: lights
 * to switch, a sensor of another kind than an Eaton PIR, the sensors each enabled rule listens to,
 * a light that dims for a brightness and an rgbw light for a colour.
 */
export function roomProblem(rule: RoomRuleBody, devices: RoomDevices): MessageKey | undefined {
  const heard = devices.sensors.filter((sensor) => !sensor.eaton);
  const kinds = devices.lights.map((light) => light.lightKind);
  const periods = Array.isArray(rule.periods) ? rule.periods : [];
  if (kinds.length === 0) {
    return 'lights.editor.problem.noLight';
  }
  if (eatonOnly(devices)) {
    return 'lights.editor.problem.eatonOnly';
  }
  if (rule.autoOffEnabled === true && heard.length === 0) {
    return 'lights.editor.problem.autoOffNoSensor';
  }
  if (rule.motionOnEnabled === true && !heard.some((sensor) => sensor.kind === 'motion sensor')) {
    return 'lights.editor.problem.motionOnNoSensor';
  }
  if (
    periods.some((period) => period.brightness !== undefined) &&
    !kinds.some((kind) => kind === 'dimmer' || kind === 'rgbw')
  ) {
    return 'lights.editor.problem.brightnessNoDimmer';
  }
  return periods.some(colored) && !kinds.includes('rgbw')
    ? 'lights.editor.problem.colorNoRgbw'
    : undefined;
}

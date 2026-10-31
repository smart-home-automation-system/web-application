import { HeaterScheduleBody } from '../../../data-access/heating/heating-api';
import { MessageKey } from '../../../i18n/messages';

/**
 * The rules of a period of a heater - a copy of `ScheduleRules` of `heating-service` 1.14.0
 * (HAS-356), which answers `INVALID_SCHEDULE` with the first rule a body breaks. The editor checks
 * every one of them before it sends, field by field; the service checks them again. **A rule
 * changed there is changed here** (the test of this file pins the numbers and the cases of the
 * test of the service).
 *
 * A rule answers the key of the sentence that says what is wrong, or `undefined`.
 */

export const MIN_TEMPERATURE = 5;
export const MAX_TEMPERATURE = 30;
export const TEMPERATURE_STEP = 0.5;

/** The constant names of the days the service takes, Monday first - the index is the day. */
export const DAY_NAMES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A period by minutes since midnight and days by their index - what the overlap is judged on. */
export interface PeriodWindow {
  readonly days: readonly number[];
  readonly start: number;
  readonly end: number;
}

export function daysProblem(days: readonly number[]): MessageKey | undefined {
  return days.length === 0 ? 'heating.editor.rule.noDays' : undefined;
}

/** `HH:mm`, as the service takes it - `24:00` and `8:00` are not. */
export function timeProblem(text: string): MessageKey | undefined {
  return TIME.test(text) ? undefined : 'heating.editor.rule.time';
}

/** `HH:mm` as minutes since midnight; `undefined` for a text that is not one. */
export function minutesOf(text: string): number | undefined {
  return TIME.test(text) ? Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5)) : undefined;
}

/** Minutes since midnight as `HH:mm`. */
export function timeText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The start before the end: a period never runs across midnight. */
export function orderProblem(start: number, end: number): MessageKey | undefined {
  return start < end ? undefined : 'heating.editor.rule.order';
}

/**
 * The temperature as typed - a comma or a dot - read into a number; `undefined` for anything
 * that is not one.
 */
export function temperatureOf(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return undefined;
  }
  return Number(trimmed);
}

export function temperatureProblem(value: number | undefined): MessageKey | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return 'heating.editor.rule.temperatureMissing';
  }
  if (value < MIN_TEMPERATURE || value > MAX_TEMPERATURE) {
    return 'heating.editor.rule.temperatureRange';
  }
  // a whole number of half degrees, judged on the tenths - 20.25 is refused as the service refuses it
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
    ? undefined
    : 'heating.editor.rule.temperatureStep';
}

/**
 * The first other period of the heater the window meets on a day in common - a switched-off one
 * included, so that switching it on never makes two of them meet. Periods that touch
 * (08:00-17:00 and 17:00-22:00) do not meet: both ends are exclusive.
 */
export function overlapping<T extends PeriodWindow>(
  window: PeriodWindow,
  others: readonly T[],
): T | undefined {
  return others.find(
    (other) =>
      other.days.some((day) => window.days.includes(day)) &&
      window.start < other.end &&
      other.start < window.end,
  );
}

/**
 * The first rule a whole body breaks, in the service's words - for the mock API, which refuses
 * what the service refuses; the editor checks field by field instead.
 */
export function scheduleProblem(
  body: unknown,
  others: readonly (PeriodWindow & { readonly id: number })[],
): string | undefined {
  const value = (body ?? {}) as Partial<Record<keyof HeaterScheduleBody, unknown>>;
  if (!Array.isArray(value.days) || value.days.length === 0) {
    return 'days are required - at least one';
  }
  const days: number[] = [];
  for (const day of value.days) {
    const index = DAY_NAMES.indexOf(day as (typeof DAY_NAMES)[number]);
    if (index < 0) {
      return `day ${String(day)} is not a day of the week`;
    }
    if (days.includes(index)) {
      return `day ${String(day)} is listed twice`;
    }
    days.push(index);
  }
  for (const name of ['startTime', 'endTime'] as const) {
    if (typeof value[name] !== 'string' || timeProblem(value[name]) !== undefined) {
      return `${name} must be HH:mm`;
    }
  }
  const start = minutesOf(value.startTime as string)!;
  const end = minutesOf(value.endTime as string)!;
  if (orderProblem(start, end) !== undefined) {
    return 'startTime must be before endTime - a window never runs across midnight';
  }
  const temperature = typeof value.temperature === 'number' ? value.temperature : undefined;
  if (temperature === undefined) {
    return 'temperature is required';
  }
  const problem = temperatureProblem(temperature);
  if (problem === 'heating.editor.rule.temperatureRange') {
    return 'temperature must be from 5 to 30 degrees';
  }
  if (problem === 'heating.editor.rule.temperatureStep') {
    return 'temperature must be in steps of 0.5 degrees';
  }
  const met = overlapping({ days, start, end }, others);
  return met === undefined ? undefined : `the window overlaps schedule ${met.id}`;
}

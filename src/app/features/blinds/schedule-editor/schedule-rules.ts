import { BlindSchedule, WindowEnd } from '../../../data-access/blinds/blind-schedule';
import { MessageKey } from '../../../i18n/messages';

/**
 * The rules of a schedule of the blinds - a copy of `ScheduleRules` of `blinds-service` 0.9.x,
 * which answers `INVALID_SCHEDULE` with the first rule a body breaks. The editor checks every one
 * of them before it sends, field by field, so that a refusal says which field it is about; the
 * service checks them again. **A rule changed there is changed here** (the test of this file
 * pins the numbers).
 *
 * A rule answers the key of the sentence that says what is wrong, or `undefined`.
 */

export const MIN_NAME_CHARACTERS = 3;
export const MAX_NAME_CHARACTERS = 60;
export const MAX_OFFSET_MINUTES = 180;
export const MAX_HOLD_MINUTES = 120;
export const MAX_TARGETS = 30;
export const MAX_CONDITIONS = 10;

export const DAY_TYPES = ['workday', 'day off', 'any'] as const;
export const WINDOW_KINDS = ['clock', 'sunrise', 'sunset'] as const;
export const ACTIONS = ['open', 'close', 'position'] as const;

/**
 * A metric compared with a threshold: what the weather station can report, with room to spare,
 * and `step`, the finest it reports by - for the hint of the thresholds that can be met.
 */
export interface MetricRange {
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly step: number;
}

/**
 * Every metric of a condition, in the order the editor offers them: the three with a range are
 * compared `lt` / `gt` with a threshold, the two without one `is` a truth.
 */
export const METRIC_RANGES: Readonly<Record<string, MetricRange | null>> = {
  illuminance: { min: 0, max: 200_000, unit: 'lx', step: 1 },
  'outside temperature': { min: -50, max: 60, unit: '°C', step: 0.1 },
  'wind gust': { min: 0, max: 100, unit: 'm/s', step: 0.1 },
  raining: null,
  'window closed': null,
};

export const METRICS = Object.keys(METRIC_RANGES);

/** Whether a metric is compared with a truth (`is`) rather than with a threshold. */
export function isTruth(metric: string): boolean {
  return Object.hasOwn(METRIC_RANGES, metric) && METRIC_RANGES[metric] === null;
}

export function rangeOf(metric: string): MetricRange | undefined {
  return Object.hasOwn(METRIC_RANGES, metric) ? (METRIC_RANGES[metric] ?? undefined) : undefined;
}

/**
 * The thresholds of a metric that can be met by its operator: the service compares strictly, so
 * `lt` at the least of a range and `gt` at the most are never true (HAS-294 - illuminance lt 0
 * kept a door open all night). For the hint: the darkest dusk that can be met is lt 1 lx.
 */
export function reachableRange(
  metric: string,
  operator: string,
): { readonly min: number; readonly max: number } | undefined {
  const range = rangeOf(metric);
  if (range === undefined) {
    return undefined;
  }
  // rounded: -50 + 0.1 is -49.9, not -49.900000000000006
  const shift = (value: number) => Math.round(value * 10) / 10;
  return operator === 'lt'
    ? { min: shift(range.min + range.step), max: range.max }
    : { min: range.min, max: shift(range.max - range.step) };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// "+30" is thirty minutes after: the field says plus is after
const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^-?\d+([.,]\d+)?$/;

/** The name as it is sent: the service refuses a space at either end, so none is kept. */
export function normaliseName(text: string): string {
  return text.trim();
}

/** Counted in characters, as the service counts them - not in the units of a string. */
export function nameProblem(text: string): MessageKey | undefined {
  const name = normaliseName(text);
  if (name === '') {
    return 'blinds.editor.problem.nameMissing';
  }
  const characters = [...name].length;
  return characters < MIN_NAME_CHARACTERS || characters > MAX_NAME_CHARACTERS
    ? 'blinds.editor.problem.nameLength'
    : undefined;
}

/** `HH:mm`, local time of the house - what a time field of the browser gives. */
export function timeProblem(text: string, required: boolean): MessageKey | undefined {
  if (text.trim() === '') {
    return required ? 'blinds.editor.problem.timeMissing' : undefined;
  }
  return TIME.test(text.trim()) ? undefined : 'blinds.editor.problem.timeInvalid';
}

/** Minutes the sunrise or the sunset is moved by: a whole number, -180 to 180. */
export function offsetProblem(text: string): MessageKey | undefined {
  const value = text.trim();
  if (value === '') {
    return 'blinds.editor.problem.offsetMissing';
  }
  if (!INTEGER.test(value)) {
    return 'blinds.editor.problem.wholeMinutes';
  }
  return Math.abs(Number(value)) > MAX_OFFSET_MINUTES
    ? 'blinds.editor.problem.offsetRange'
    : undefined;
}

/** How long a condition has to hold: a whole number of minutes, 0 to 120. */
export function holdProblem(text: string): MessageKey | undefined {
  const value = text.trim();
  if (value === '') {
    return 'blinds.editor.problem.holdMissing';
  }
  if (!INTEGER.test(value)) {
    return 'blinds.editor.problem.wholeMinutes';
  }
  const minutes = Number(value);
  return minutes < 0 || minutes > MAX_HOLD_MINUTES ? 'blinds.editor.problem.holdRange' : undefined;
}

/**
 * A number typed in either language: a phone set to Polish offers a comma. `undefined` for a text
 * that is no number.
 */
export function decimalOf(text: string): number | undefined {
  const value = text.trim();
  return DECIMAL.test(value) ? Number(value.replace(',', '.')) : undefined;
}

/**
 * The threshold of a metric with a range: a number with at most one decimal, inside the range,
 * and one its operator can cross - `lt` above the least, `gt` below the most, as the service
 * wants it (`illuminance lt 0 is never true`).
 */
export function thresholdProblem(
  text: string,
  metric: string,
  operator: string,
): MessageKey | undefined {
  if (text.trim() === '') {
    return 'blinds.editor.problem.thresholdMissing';
  }
  const value = decimalOf(text);
  if (value === undefined) {
    return 'blinds.editor.problem.thresholdNumber';
  }
  const decimals = text.trim().split(/[.,]/)[1]?.replace(/0+$/, '') ?? '';
  if (decimals.length > 1) {
    return 'blinds.editor.problem.thresholdDecimal';
  }
  const range = rangeOf(metric);
  if (range === undefined) {
    return undefined;
  }
  if (value < range.min || value > range.max) {
    return 'blinds.editor.problem.thresholdRange';
  }
  if (operator === 'lt' && value <= range.min) {
    return 'blinds.editor.problem.thresholdNeverBelow';
  }
  return operator === 'gt' && value >= range.max
    ? 'blinds.editor.problem.thresholdNeverAbove'
    : undefined;
}

/** Both ends held between two times: the latest is after the earliest. */
export function boundsProblem(earliest: string, latest: string): MessageKey | undefined {
  return TIME.test(earliest) && TIME.test(latest) && latest <= earliest
    ? 'blinds.editor.problem.latestBeforeEarliest'
    : undefined;
}

/**
 * A window of two clock times is not empty; an end before the start is the next day (a night,
 * 21:00 to 06:00). With a time of the sun the order is known only on the day.
 */
export function windowProblem(
  from: WindowEnd | undefined,
  to: WindowEnd | undefined,
): MessageKey | undefined {
  return from?.kind === 'clock' &&
    to?.kind === 'clock' &&
    from.time !== undefined &&
    from.time !== '' &&
    from.time === to.time
    ? 'blinds.editor.problem.windowEmpty'
    : undefined;
}

export function targetsProblem(count: number): MessageKey | undefined {
  if (count === 0) {
    return 'blinds.editor.problem.targetsMissing';
  }
  return count > MAX_TARGETS ? 'blinds.editor.problem.targetsTooMany' : undefined;
}

/**
 * The first rule a whole schedule breaks, in the order of the service - for the mock API, which
 * refuses what `blinds-service` refuses. The editor checks field by field instead.
 */
export function scheduleProblem(schedule: BlindSchedule): MessageKey | undefined {
  const window = schedule.window;
  const ends = [window?.from, window?.to];
  const targets = Array.isArray(schedule.targets) ? schedule.targets : [];
  const conditions = Array.isArray(schedule.conditions) ? schedule.conditions : undefined;
  const seen = new Set(targets.map((target) => `${target.room ?? ''}/${target.deviceId ?? ''}`));
  return (
    (typeof schedule.name !== 'string' || schedule.name !== normaliseName(schedule.name)
      ? 'blinds.editor.problem.nameMissing'
      : nameProblem(schedule.name)) ??
    (typeof schedule.enabled !== 'boolean' ? 'blinds.editor.problem.invalid' : undefined) ??
    (!DAY_TYPES.some((one) => one === schedule.dayType)
      ? 'blinds.editor.problem.dayTypeMissing'
      : undefined) ??
    ends.map(endProblem).find((problem) => problem !== undefined) ??
    windowProblem(window?.from, window?.to) ??
    targetsProblem(targets.length) ??
    (targets.some((target) => (target.room === undefined) === (target.deviceId === undefined)) ||
    seen.size !== targets.length
      ? 'blinds.editor.problem.invalid'
      : undefined) ??
    (conditions === undefined || conditions.length > MAX_CONDITIONS
      ? 'blinds.editor.problem.invalid'
      : conditions
          .map((condition) => {
            const metric = condition.metric ?? '';
            if (!Object.hasOwn(METRIC_RANGES, metric)) {
              return 'blinds.editor.problem.invalid';
            }
            const hold = holdProblem(String(condition.holdMinutes ?? ''));
            if (hold) {
              return hold;
            }
            if (isTruth(metric)) {
              return condition.operator === 'is' &&
                typeof condition.value === 'boolean' &&
                condition.threshold === undefined
                ? undefined
                : 'blinds.editor.problem.invalid';
            }
            return condition.operator !== 'lt' && condition.operator !== 'gt'
              ? 'blinds.editor.problem.invalid'
              : thresholdProblem(String(condition.threshold ?? ''), metric, condition.operator);
          })
          .find((problem) => problem !== undefined)) ??
    actionProblem(schedule.action, schedule.position)
  );
}

function endProblem(end: WindowEnd | undefined): MessageKey | undefined {
  if (end === undefined || !WINDOW_KINDS.some((kind) => kind === end.kind)) {
    return 'blinds.editor.problem.invalid';
  }
  if (end.kind === 'clock') {
    return end.offsetMinutes !== undefined || end.earliest !== undefined || end.latest !== undefined
      ? 'blinds.editor.problem.invalid'
      : timeProblem(end.time ?? '', true);
  }
  if (end.time !== undefined) {
    return 'blinds.editor.problem.invalid';
  }
  return (
    offsetProblem(String(end.offsetMinutes ?? '')) ??
    timeProblem(end.earliest ?? '', false) ??
    timeProblem(end.latest ?? '', false) ??
    boundsProblem(end.earliest ?? '', end.latest ?? '')
  );
}

function actionProblem(action: string | undefined, position: number | undefined) {
  if (!ACTIONS.some((one) => one === action)) {
    return 'blinds.editor.problem.actionMissing';
  }
  if (action === 'position') {
    return typeof position === 'number' &&
      Number.isInteger(position) &&
      position >= 0 &&
      position <= 100
      ? undefined
      : 'blinds.editor.problem.invalid';
  }
  return position === undefined ? undefined : 'blinds.editor.problem.invalid';
}

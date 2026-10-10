import { houseDay, houseWeekMinute } from './house-date-time';

/**
 * The range a history is asked for: local date-times of the house without an offset
 * (`2026-10-09T00:00:00`), the start included and the end not. The services refuse more than
 * 31 days.
 */
export interface HistoryRange {
  readonly from: string;
  readonly to: string;
}

/** How far back a chart looks. */
export type HistoryPreset = 'day' | 'week' | 'month';

export const HISTORY_PRESETS: readonly HistoryPreset[] = ['day', 'week', 'month'];

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

const DAYS_OF: Readonly<Record<Exclude<HistoryPreset, 'day'>, number>> = { week: 7, month: 30 };

/** Milliseconds on the wall-clock timeline as the local date-time the services read. */
function localDateTime(wallClock: number): string {
  return new Date(wallClock).toISOString().slice(0, 19);
}

/**
 * The range of a preset, ending with the running hour or day of the house.
 *
 * The services cut a history into buckets aligned to the clock of the house, not to the start
 * of the range, so a range has to start on a boundary of its bucket or its first point lies
 * before the axis: **the last 24 hours start on a full hour** (the buckets of two days are 5
 * and 20 minutes), **7 and 30 days start on a midnight** (30 minutes to 3 hours). The end is the
 * end of the running hour, or the midnight after today - a little in the future, where there
 * are simply no points.
 *
 * All of it is arithmetic on the wall clock: a day is 24 hours there, also on the two nights
 * the clocks are changed.
 */
export function historyRange(
  preset: HistoryPreset,
  instant: number,
  timeZone: string,
): HistoryRange {
  const midnight = Date.parse(`${houseDay(instant, timeZone)}T00:00:00Z`);
  if (preset === 'day') {
    const hour = Math.floor(houseWeekMinute(instant, timeZone).minute / 60);
    const end = midnight + (hour + 1) * HOUR_MS;
    return { from: localDateTime(end - DAY_MS), to: localDateTime(end) };
  }
  const end = midnight + DAY_MS;
  return { from: localDateTime(end - DAYS_OF[preset] * DAY_MS), to: localDateTime(end) };
}

/** The same question is the same range: for the `equal` of a signal that holds one. */
export function sameRange(a: HistoryRange, b: HistoryRange): boolean {
  return a.from === b.from && a.to === b.to;
}

import { ReportRange } from '../../data-access/presence/presence-api';

/** How the period of the reports was chosen. */
export type Preset = 'today' | 'week' | 'month' | 'custom';

/** `presence-service` refuses a range longer than this. */
export const LONGEST_RANGE_DAYS = 366;

const DAYS_OF: Readonly<Record<Exclude<Preset, 'custom'>, number>> = {
  today: 1,
  week: 7,
  month: 30,
};

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * A day (`2026-10-08`) some days later, or earlier. Days are counted on a calendar without
 * zones: the day is a name here, not a moment.
 */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The day of a local date-time: `2026-10-08T00:00:00` is `2026-10-08`. */
export function dayOf(dateTime: string): string {
  return dateTime.slice(0, 10);
}

/**
 * The days from `first` to `last`, both included, as the range a report is asked for: from the
 * first midnight to the midnight after the last day. Whatever comes in, what goes out is a range
 * the service accepts - the ends in order, and no longer than it allows (the later days stay).
 */
export function rangeOfDays(first: string, last: string): ReportRange {
  const [from, to] = first <= last ? [first, last] : [last, first];
  const earliest = addDays(to, -(LONGEST_RANGE_DAYS - 1));
  return {
    from: `${from < earliest ? earliest : from}T00:00:00`,
    to: `${addDays(to, 1)}T00:00:00`,
  };
}

/** The last day, seven or thirty, ending with today - the running day included. */
export function rangeOfPreset(preset: Preset, today: string): ReportRange {
  const days = preset === 'custom' ? DAYS_OF.week : DAYS_OF[preset];
  return rangeOfDays(addDays(today, -(days - 1)), today);
}

/**
 * The day as a date of the calendar control, which works with `Date` objects in the zone of the
 * browser: local midnight of that day, so the control shows the day that was meant.
 */
export function fromDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

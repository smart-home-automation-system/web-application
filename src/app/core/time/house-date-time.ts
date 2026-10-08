import { dateTimeFormat } from '../i18n/intl-formats';

/**
 * The backend sends `LocalDateTime` values: the wall-clock time of the house, without an offset
 * (`2026-10-05T12:30:15.123456`). They are shown exactly as sent - never converted to the zone
 * of the browser, so a phone abroad on VPN still shows house time. `new Date(text)` would read
 * such a value in the browser zone, which is why nothing here uses it.
 *
 * The one thing that does need a zone is the *age* of such a value: `houseInstant`.
 */
export interface HouseDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

// seconds are optional: Java omits them when they are zero
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/;

export function parseHouseDateTime(text: string | null | undefined): HouseDateTime | undefined {
  const match = text ? LOCAL_DATE_TIME.exec(text) : null;
  if (!match) {
    return undefined;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const parsed = { year, month, day, hour, minute, second };
  // rejects 2026-02-31 and 25:00, which the pattern alone lets through
  const check = new Date(wallClockAsUtc(parsed));
  const valid =
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour &&
    minute < 60 &&
    second < 60;
  return valid ? parsed : undefined;
}

export const DEFAULT_DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/**
 * Formats the wall-clock value as it is. The trick: the fields are placed on the UTC timeline
 * and formatted in UTC, so no zone ever shifts them.
 */
export function formatHouseDateTime(
  value: HouseDateTime,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME_FORMAT,
): string {
  return dateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(wallClockAsUtc(value));
}

/**
 * The instant - epoch milliseconds - at which the clocks of the house showed this value. Needed
 * for one thing only: how long ago something was. Showing the value itself never goes through
 * here.
 *
 * The offset of a zone depends on the instant, which is what is being looked for, so it is found
 * in two steps: the offset at a first guess, then the offset at the instant that guess leads to.
 * Twice a year the wall clock is not a clock: an hour that does not exist when summer time
 * starts (it reads as the same time an hour later) and an hour that happens twice when it ends
 * (it reads as the second one, the later instant). Either way the age is off by at most that
 * hour, once, at night.
 */
export function houseInstant(value: HouseDateTime, timeZone: string): number {
  const wallClock = wallClockAsUtc(value);
  const offsetAt = (instant: number) => wallClockIn(timeZone, instant) - instant;
  const guess = wallClock - offsetAt(wallClock);
  return wallClock - offsetAt(guess);
}

/** What the clocks of the zone show at the instant, placed on the UTC timeline. */
function wallClockIn(timeZone: string, instant: number): number {
  const parts = dateTimeFormat('en-GB', zoneClock(timeZone)).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
}

const zoneClocks = new Map<string, Intl.DateTimeFormatOptions>();

/** One options object per zone: the formatter cache is keyed by it. */
function zoneClock(timeZone: string): Intl.DateTimeFormatOptions {
  let options = zoneClocks.get(timeZone);
  if (options === undefined) {
    options = {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    };
    zoneClocks.set(timeZone, options);
  }
  return options;
}

function wallClockAsUtc(value: HouseDateTime): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

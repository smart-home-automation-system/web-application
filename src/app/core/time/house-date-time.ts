import { dateTimeFormat } from '../i18n/intl-formats';

/**
 * The backend sends `LocalDateTime` values: the wall-clock time of the house, without an offset
 * (`2026-10-05T12:30:15.123456`). They are shown exactly as sent - never converted to the zone
 * of the browser, so a phone abroad on VPN still shows house time. `new Date(text)` would read
 * such a value in the browser zone, which is why nothing here uses it.
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

function wallClockAsUtc(value: HouseDateTime): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

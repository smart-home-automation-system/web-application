import { relativeTimeFormat } from '../../core/i18n/intl-formats';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Below this an age is not worth a number: the caller says "just now" in its own words. */
export const JUST_NOW_MS = 10 * SECOND;

/**
 * How old something is, in the words of the locale: "45 sec ago", "3 min ago", "5 hr ago",
 * "2 days ago" - "45 s temu", "3 min temu" in Polish. The wording comes from the browser
 * (`Intl.RelativeTimeFormat`), so it needs no translation of its own.
 */
export function formatAge(ageMs: number, locale: string): string {
  const format = relativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  if (ageMs < MINUTE) {
    return format.format(-Math.floor(ageMs / SECOND), 'second');
  }
  if (ageMs < HOUR) {
    return format.format(-Math.floor(ageMs / MINUTE), 'minute');
  }
  if (ageMs < 2 * DAY) {
    return format.format(-Math.floor(ageMs / HOUR), 'hour');
  }
  return format.format(-Math.floor(ageMs / DAY), 'day');
}

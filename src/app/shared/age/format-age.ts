const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "45 sec. ago", "3 min. ago", "5 hr. ago", "2 days ago" - how old something is. */
export function formatAge(ageMs: number, locale: string): string {
  if (ageMs < 10 * SECOND) {
    return 'just now';
  }
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
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

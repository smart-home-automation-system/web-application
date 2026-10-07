/** In calendar order; also the values of `data-season` on `<html>` and the names in the styles. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export type Season = (typeof SEASONS)[number];

export function isSeason(value: unknown): value is Season {
  return SEASONS.includes(value as Season);
}

/**
 * The season of a day, by the calendar on the wall where the browser runs: astronomical seasons
 * with fixed first days - spring 21 March, summer 22 June, autumn 23 September, winter
 * 22 December. The real equinox moves by a day between years; the colours of a dashboard do not
 * need that.
 */
export function seasonOf(date: Date): Season {
  // month and day as one number: 21 March is 321
  const day = (date.getMonth() + 1) * 100 + date.getDate();
  if (day < 321) {
    return 'winter';
  }
  if (day < 622) {
    return 'spring';
  }
  if (day < 923) {
    return 'summer';
  }
  if (day < 1222) {
    return 'autumn';
  }
  return 'winter';
}

/** Milliseconds from the moment until the next day starts on the wall clock of the browser. */
export function millisecondsUntilTomorrow(now: Date): number {
  // built from calendar fields, not by adding 24 hours: a day with a clock change is not 24 h long
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime() - now.getTime();
}

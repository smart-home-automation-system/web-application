import { JUST_NOW_MS, formatAge } from './format-age';

describe('formatAge', () => {
  // the exact abbreviation ("sec" or "sec.") belongs to the browser's locale data
  it.each([
    [10_000, /^10 sec\.? ago$/],
    [59_999, /^59 sec\.? ago$/],
    [60_000, /^1 min\.? ago$/],
    [59 * 60_000, /^59 min\.? ago$/],
    [60 * 60_000, /^1 hr\.? ago$/],
    [47 * 3_600_000, /^47 hr\.? ago$/],
    [48 * 3_600_000, /^2 days ago$/],
  ])('formats %i ms in English', (ageMs, expected) => {
    expect(formatAge(ageMs, 'en-GB')).toMatch(expected);
  });

  it.each([
    [10_000, /^10 (s|sek)\.? temu$/],
    [3 * 60_000, /^3 min\.? temu$/],
    [5 * 3_600_000, /^5 godz\.? temu$/],
    [48 * 3_600_000, /^2 dni temu$/],
  ])('formats %i ms in Polish', (ageMs, expected) => {
    expect(formatAge(ageMs, 'pl-PL')).toMatch(expected);
  });

  it('leaves the wording of a very small age to the caller', () => {
    expect(JUST_NOW_MS).toBe(10_000);
  });
});

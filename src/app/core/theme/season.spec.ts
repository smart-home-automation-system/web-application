import { SEASONS, isSeason, millisecondsUntilTomorrow, seasonOf } from './season';

/** A local date: month as on the calendar, 1-12. */
function day(month: number, date: number, year = 2026): Date {
  return new Date(year, month - 1, date, 12);
}

describe('seasonOf', () => {
  it.each([
    ['20 March', day(3, 20), 'winter'],
    ['21 March', day(3, 21), 'spring'],
    ['21 June', day(6, 21), 'spring'],
    ['22 June', day(6, 22), 'summer'],
    ['22 September', day(9, 22), 'summer'],
    ['23 September', day(9, 23), 'autumn'],
    ['21 December', day(12, 21), 'autumn'],
    ['22 December', day(12, 22), 'winter'],
  ])('puts %s in the right season', (_name, date, season) => {
    expect(seasonOf(date)).toBe(season);
  });

  it('keeps winter across the turn of the year', () => {
    expect(seasonOf(day(12, 31))).toBe('winter');
    expect(seasonOf(day(1, 1, 2027))).toBe('winter');
    expect(seasonOf(day(2, 29, 2028))).toBe('winter');
  });

  it('goes by the day on the wall clock, from its first second to its last', () => {
    expect(seasonOf(new Date(2026, 2, 20, 23, 59, 59, 999))).toBe('winter');
    expect(seasonOf(new Date(2026, 2, 21, 0, 0, 0, 0))).toBe('spring');
  });

  it('gives every day of a year one of the four seasons, each in one stretch', () => {
    const changes: string[] = [];
    for (let date = new Date(2026, 0, 1); date.getFullYear() === 2026;) {
      const season = seasonOf(date);
      expect(isSeason(season)).toBe(true);
      if (changes.at(-1) !== season) {
        changes.push(season);
      }
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    }

    expect(changes).toEqual(['winter', 'spring', 'summer', 'autumn', 'winter']);
  });
});

describe('isSeason', () => {
  it('knows the four seasons and nothing else', () => {
    expect(SEASONS.every(isSeason)).toBe(true);
    expect(['auto', 'Spring', '', undefined, null, 3].some(isSeason)).toBe(false);
  });
});

describe('millisecondsUntilTomorrow', () => {
  it('counts to the next midnight on the wall clock', () => {
    expect(millisecondsUntilTomorrow(new Date(2026, 8, 22, 23, 59, 50))).toBe(10_000);
    expect(millisecondsUntilTomorrow(new Date(2026, 8, 22, 0, 0, 0))).toBe(24 * 3_600_000);
  });

  it('crosses the end of a month and of a year', () => {
    expect(millisecondsUntilTomorrow(new Date(2026, 11, 31, 23, 0, 0))).toBe(3_600_000);
  });
});

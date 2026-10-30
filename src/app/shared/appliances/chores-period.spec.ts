import { choresRange } from './chores-period';

const ZONE = 'Europe/Warsaw';

describe('choresRange', () => {
  // 00:30 on the first of November in the house is still 31 October in UTC: the month is the house's
  const FIRST_OF_NOVEMBER = Date.parse('2026-10-31T23:30:00Z');

  it('takes whole calendar months of the house', () => {
    expect(choresRange('thisMonth', FIRST_OF_NOVEMBER, ZONE)).toEqual({
      from: '2026-11-01T00:00:00',
      to: '2026-12-01T00:00:00',
    });
    expect(choresRange('lastMonth', FIRST_OF_NOVEMBER, ZONE)).toEqual({
      from: '2026-10-01T00:00:00',
      to: '2026-11-01T00:00:00',
    });
    expect(choresRange('threeMonths', FIRST_OF_NOVEMBER, ZONE)).toEqual({
      from: '2026-09-01T00:00:00',
      to: '2026-12-01T00:00:00',
    });
  });

  it('crosses the turn of the year', () => {
    const january = Date.parse('2027-01-15T12:00:00Z');

    expect(choresRange('lastMonth', january, ZONE)).toEqual({
      from: '2026-12-01T00:00:00',
      to: '2027-01-01T00:00:00',
    });
    expect(choresRange('threeMonths', january, ZONE)).toEqual({
      from: '2026-11-01T00:00:00',
      to: '2027-02-01T00:00:00',
    });
  });
});

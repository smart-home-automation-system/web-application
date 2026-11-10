import { daysIn, lastDays, monthOf } from './softener-history';

const ZONE = 'Europe/Warsaw';
// 9 November 2026, 10:00 in the house
const NOW = Date.UTC(2026, 10, 9, 9, 0);

describe('softener history ranges', () => {
  // the salt of 90 days ends with the midnight after today, as the histories of the house do
  it('asks the last 90 days up to the midnight after today', () => {
    expect(lastDays(90, NOW, ZONE)).toEqual({ from: '2026-08-12T00:00:00', to: '2026-11-10T00:00:00' });
  });

  it('asks the month of the house, the first of the next not included', () => {
    expect(monthOf(NOW, ZONE)).toEqual({ from: '2026-11-01T00:00:00', to: '2026-12-01T00:00:00' });
    expect(monthOf(Date.UTC(2026, 11, 31, 23, 30), ZONE)).toEqual({
      from: '2027-01-01T00:00:00',
      to: '2027-02-01T00:00:00',
    });
  });

  it('lists the days of a range, the end not included', () => {
    const days = daysIn(monthOf(NOW, ZONE));

    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-11-01');
    expect(days.at(-1)).toBe('2026-11-30');
  });
});

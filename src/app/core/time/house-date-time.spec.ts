import { formatHouseDateTime, parseHouseDateTime } from './house-date-time';

describe('parseHouseDateTime', () => {
  it('reads a LocalDateTime with fractional seconds', () => {
    expect(parseHouseDateTime('2026-04-22T16:31:17.840868')).toEqual({
      year: 2026,
      month: 4,
      day: 22,
      hour: 16,
      minute: 31,
      second: 17,
    });
  });

  it('reads a value without seconds, as Java prints it when they are zero', () => {
    expect(parseHouseDateTime('2026-10-05T07:00')).toMatchObject({ hour: 7, minute: 0, second: 0 });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a date only', '2026-10-05'],
    ['a value with an offset', '2026-10-05T07:00:00+02:00'],
    ['a UTC instant', '2026-10-05T07:00:00Z'],
    ['an impossible date', '2026-02-31T10:00:00'],
    ['an impossible hour', '2026-10-05T25:00:00'],
    ['an impossible minute', '2026-10-05T10:61:00'],
    ['text', 'yesterday'],
  ])('rejects %s', (_name, text) => {
    expect(parseHouseDateTime(text)).toBeUndefined();
  });
});

describe('formatHouseDateTime', () => {
  it('shows the wall-clock value unchanged, whatever zone the browser is in', () => {
    const value = parseHouseDateTime('2026-01-15T23:45:00')!;

    const formatted = formatHouseDateTime(value, 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    expect(formatted).toBe('15/01/2026, 23:45');
  });
});

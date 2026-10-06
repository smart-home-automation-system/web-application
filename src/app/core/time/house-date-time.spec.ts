import { formatHouseDateTime, houseDateTimeToEpochMs, parseHouseDateTime } from './house-date-time';

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

describe('houseDateTimeToEpochMs', () => {
  it('applies the winter offset of the house zone', () => {
    const value = parseHouseDateTime('2026-01-15T12:00:00')!;

    expect(houseDateTimeToEpochMs(value, 'Europe/Warsaw')).toBe(Date.UTC(2026, 0, 15, 11, 0, 0));
  });

  it('applies the summer offset of the house zone', () => {
    const value = parseHouseDateTime('2026-07-15T12:00:00')!;

    expect(houseDateTimeToEpochMs(value, 'Europe/Warsaw')).toBe(Date.UTC(2026, 6, 15, 10, 0, 0));
  });

  it('is right on both sides of the change to summer time', () => {
    // 2026-03-29: 02:00 CET becomes 03:00 CEST
    const before = parseHouseDateTime('2026-03-29T01:59:59')!;
    const after = parseHouseDateTime('2026-03-29T03:00:00')!;

    expect(houseDateTimeToEpochMs(before, 'Europe/Warsaw')).toBe(Date.UTC(2026, 2, 29, 0, 59, 59));
    expect(houseDateTimeToEpochMs(after, 'Europe/Warsaw')).toBe(Date.UTC(2026, 2, 29, 1, 0, 0));
  });

  it('is right on both sides of the change to winter time', () => {
    // 2026-10-25: 03:00 CEST becomes 02:00 CET
    const before = parseHouseDateTime('2026-10-25T01:59:59')!;
    const after = parseHouseDateTime('2026-10-25T03:00:00')!;

    expect(houseDateTimeToEpochMs(before, 'Europe/Warsaw')).toBe(Date.UTC(2026, 9, 24, 23, 59, 59));
    expect(houseDateTimeToEpochMs(after, 'Europe/Warsaw')).toBe(Date.UTC(2026, 9, 25, 2, 0, 0));
  });

  it('picks the later instant inside the hour that occurs twice', () => {
    const repeated = parseHouseDateTime('2026-10-25T02:30:00')!;

    expect(houseDateTimeToEpochMs(repeated, 'Europe/Warsaw')).toBe(Date.UTC(2026, 9, 25, 1, 30, 0));
  });

  it('follows the configured zone, not the one of the machine', () => {
    const value = parseHouseDateTime('2026-01-15T12:00:00')!;

    expect(houseDateTimeToEpochMs(value, 'America/New_York')).toBe(Date.UTC(2026, 0, 15, 17, 0, 0));
  });
});

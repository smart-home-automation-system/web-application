import { formatHouseDateTime, houseInstant, parseHouseDateTime } from './house-date-time';

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

describe('houseInstant', () => {
  const instant = (text: string, zone = 'Europe/Warsaw') =>
    new Date(houseInstant(parseHouseDateTime(text)!, zone)).toISOString();

  it('reads a summer value two hours ahead of UTC', () => {
    expect(instant('2026-07-15T12:00:00')).toBe('2026-07-15T10:00:00.000Z');
  });

  it('reads a winter value one hour ahead of UTC', () => {
    expect(instant('2026-01-15T12:00:00')).toBe('2026-01-15T11:00:00.000Z');
  });

  it('does not depend on the zone of the browser', () => {
    // the same wall clock in another house is another instant; the zone of this machine is in
    // neither answer
    expect(instant('2026-07-15T12:00:00', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
    expect(instant('2026-07-15T12:00:00', 'UTC')).toBe('2026-07-15T12:00:00.000Z');
  });

  describe('around the start of summer time (29 March 2026, 02:00 -> 03:00)', () => {
    it('is right just before the change', () => {
      expect(instant('2026-03-29T01:59:59')).toBe('2026-03-29T00:59:59.000Z');
    });

    it('is right just after the change', () => {
      expect(instant('2026-03-29T03:00:00')).toBe('2026-03-29T01:00:00.000Z');
    });

    // the clocks never showed 02:30 that night
    it('reads an hour that did not exist as the same time an hour later', () => {
      expect(instant('2026-03-29T02:30:00')).toBe(instant('2026-03-29T03:30:00'));
    });
  });

  describe('around the end of summer time (25 October 2026, 03:00 -> 02:00)', () => {
    it('is right just before the hour that happens twice', () => {
      expect(instant('2026-10-25T01:59:59')).toBe('2026-10-24T23:59:59.000Z');
    });

    it('is right just after it', () => {
      expect(instant('2026-10-25T03:00:00')).toBe('2026-10-25T02:00:00.000Z');
    });

    // 02:30 was shown twice: at 00:30 and at 01:30 UTC
    it('reads the hour that happens twice as its second run', () => {
      expect(instant('2026-10-25T02:30:00')).toBe('2026-10-25T01:30:00.000Z');
    });
  });

  it('keeps the order of two values across a change of the clocks', () => {
    const before = houseInstant(parseHouseDateTime('2026-03-29T01:30:00')!, 'Europe/Warsaw');
    const after = houseInstant(parseHouseDateTime('2026-03-29T03:30:00')!, 'Europe/Warsaw');

    // two hours on the clock, one hour of time
    expect(after - before).toBe(3_600_000);
  });
});

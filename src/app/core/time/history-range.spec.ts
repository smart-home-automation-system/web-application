import { historyRange, sameRange } from './history-range';

const WARSAW = 'Europe/Warsaw';

describe('historyRange', () => {
  // 18:30 in the house (summer time, UTC+2)
  const EVENING = Date.parse('2026-10-10T16:30:00Z');

  // the buckets of two days are 5 and 20 minutes, aligned to the clock of the house: a range
  // that starts on a full hour starts on a bucket
  it('ends the last 24 hours with the running hour and starts them on a full hour', () => {
    expect(historyRange('day', EVENING, WARSAW)).toEqual({
      from: '2026-10-09T19:00:00',
      to: '2026-10-10T19:00:00',
    });
  });

  it('ends 7 days with the midnight after today and starts them on a midnight', () => {
    expect(historyRange('week', EVENING, WARSAW)).toEqual({
      from: '2026-10-04T00:00:00',
      to: '2026-10-11T00:00:00',
    });
  });

  // 30 days: inside the 31 the services allow, the running day included
  it('ends 30 days with the midnight after today', () => {
    expect(historyRange('month', EVENING, WARSAW)).toEqual({
      from: '2026-09-11T00:00:00',
      to: '2026-10-11T00:00:00',
    });
  });

  it('goes by the day of the house, not by that of the browser or of UTC', () => {
    // 00:30 of the 11th in the house, still the 10th in UTC
    const afterMidnight = Date.parse('2026-10-10T22:30:00Z');

    expect(historyRange('week', afterMidnight, WARSAW).to).toBe('2026-10-12T00:00:00');
    expect(historyRange('day', afterMidnight, WARSAW)).toEqual({
      from: '2026-10-10T01:00:00',
      to: '2026-10-11T01:00:00',
    });
  });

  it('ends the last hour of a day with the midnight that follows', () => {
    // 23:10 in the house
    const lateEvening = Date.parse('2026-10-10T21:10:00Z');

    expect(historyRange('day', lateEvening, WARSAW)).toEqual({
      from: '2026-10-10T00:00:00',
      to: '2026-10-11T00:00:00',
    });
  });

  // the wall clock has no night of 23 or 25 hours: the range is 24 hours of it either way
  it('keeps 24 hours of the wall clock across the night the summer time ends', () => {
    // 12:15 in the house on 2026-10-25, winter time again (UTC+1)
    const noon = Date.parse('2026-10-25T11:15:00Z');

    expect(historyRange('day', noon, WARSAW)).toEqual({
      from: '2026-10-24T13:00:00',
      to: '2026-10-25T13:00:00',
    });
  });

  it('is the same range for every moment of the same hour', () => {
    const later = EVENING + 20 * 60_000;

    expect(
      sameRange(historyRange('day', EVENING, WARSAW), historyRange('day', later, WARSAW)),
    ).toBe(true);
    expect(
      sameRange(
        historyRange('day', EVENING, WARSAW),
        historyRange('day', EVENING + 40 * 60_000, WARSAW),
      ),
    ).toBe(false);
  });
});

import {
  DailyPresenceReport,
  HouseReport,
  PresenceReport,
} from '../app/data-access/presence/presence-api';
import {
  dailyPresenceReport,
  houseReport,
  isRefusal,
  presenceNow,
  presenceReport,
} from './presence.fixtures';

/** A Thursday, 15:30:00 on the clocks of the house. */
const NOW = new Date('2026-10-08T13:30:00Z');
const FROM = '2026-10-07T00:00:00';
const TO = '2026-10-09T00:00:00';

function answered<T extends object>(answer: T | { status: number; message: string }): T {
  if (isRefusal(answer)) {
    throw new Error(`refused: ${answer.message}`);
  }
  return answer;
}

describe('the presence of the mock household', () => {
  it('says who is at home at the time of the call, on the clock of the house', () => {
    expect(presenceNow(false, NOW)).toEqual([
      {
        name: 'Aurelia',
        present: false,
        since: '2026-10-08T07:40:00',
        lastCheckedAt: '2026-10-08T15:29:20',
      },
      {
        name: 'Borys',
        present: true,
        since: '2026-10-08T15:05:00',
        lastCheckedAt: '2026-10-08T15:29:20',
      },
      {
        name: 'Celina',
        present: false,
        since: '2026-10-08T06:50:00',
        lastCheckedAt: '2026-10-08T15:29:20',
      },
      // never seen: the service lists such a member as not present, with no times
      { name: 'Damian', present: false, since: null, lastCheckedAt: null },
    ]);
  });

  it('cuts the periods of a resident to the range, the one still going on marked', () => {
    const report = answered<PresenceReport>(presenceReport('Borys', FROM, TO, false, NOW));

    expect(report.intervals).toEqual([
      { from: '2026-10-07T00:00:00', to: '2026-10-07T08:15:00', open: false },
      { from: '2026-10-07T15:05:00', to: '2026-10-07T18:00:00', open: false },
      { from: '2026-10-07T19:10:00', to: '2026-10-08T08:15:00', open: false },
      { from: '2026-10-08T15:05:00', to: '2026-10-08T15:29:20', open: true },
    ]);
  });

  it('counts the days like the service: no arrival at midnight, no departure while at home', () => {
    const report = answered<DailyPresenceReport>(
      dailyPresenceReport('Borys', FROM, TO, false, NOW),
    );

    expect(report.observedFrom).toBe(FROM);
    expect(report.observedUntil).toBe('2026-10-08T15:29:20');
    expect(report.days).toEqual([
      {
        date: '2026-10-07',
        secondsAtHome: 57_600,
        firstArrival: '2026-10-07T15:05:00',
        lastDeparture: '2026-10-07T18:00:00',
        presencePercentage: 66.7,
      },
      {
        date: '2026-10-08',
        secondsAtHome: 31_160,
        firstArrival: '2026-10-08T15:05:00',
        lastDeparture: '2026-10-08T08:15:00',
        presencePercentage: 55.9,
      },
    ]);
  });

  it('gives the house as one timeline without a gap, empty while everybody is out', () => {
    const report = answered<HouseReport>(houseReport(FROM, TO, false, NOW));
    const intervals = report.intervals ?? [];

    expect(intervals[0].from).toBe(report.observedFrom);
    expect(intervals.at(-1)?.to).toBe(report.observedUntil);
    intervals.slice(1).forEach((interval, index) => {
      expect(interval.from).toBe(intervals[index].to);
      expect(interval.occupied).toBe(!intervals[index].occupied);
    });
    expect(report.days?.[1]).toEqual({
      date: '2026-10-08',
      secondsOccupied: 31_160,
      secondsEmpty: 24_600,
      wasEmpty: true,
    });
  });

  // the history begins twelve days before the call, in the morning
  it('observes nothing before its history begins', () => {
    const before = answered<HouseReport>(
      houseReport('2026-08-01T00:00:00', '2026-08-03T00:00:00', false, NOW),
    );
    const across = answered<HouseReport>(houseReport('2026-09-09T00:00:00', TO, false, NOW));

    expect(before).toMatchObject({
      observedFrom: null,
      observedUntil: null,
      intervals: [],
      days: [],
    });
    expect(across.observedFrom).toBe('2026-09-26T09:20:00');
    expect(across.days?.[0].date).toBe('2026-09-26');
  });

  it('has a member the detection has never seen: an empty report, no observed days', () => {
    expect(
      answered<PresenceReport>(presenceReport('Damian', FROM, TO, false, NOW)).intervals,
    ).toEqual([]);
    expect(
      answered<DailyPresenceReport>(dailyPresenceReport('Damian', FROM, TO, false, NOW)),
    ).toMatchObject({
      observedFrom: null,
      observedUntil: null,
      days: [],
    });
  });

  it('knows nothing about anybody just after the first start', () => {
    expect(presenceNow(true, NOW).every((resident) => resident.lastCheckedAt === null)).toBe(true);
    expect(answered<HouseReport>(houseReport(FROM, TO, true, NOW)).observedFrom).toBeNull();
    expect(
      answered<PresenceReport>(presenceReport('Borys', FROM, TO, true, NOW)).intervals,
    ).toEqual([]);
  });

  describe('refuses, like the service', () => {
    it.each([
      ['a date without a time', '2026-10-07', TO, 400],
      ['a date-time with an offset', '2026-10-07T00:00:00Z', TO, 400],
      ['a missing end', FROM, null, 400],
      ['a range the wrong way round', TO, FROM, 400],
      ['a range longer than 366 days', '2025-01-01T00:00:00', TO, 400],
    ])('%s', (_, from, to, status) => {
      expect(houseReport(from, to, false, NOW)).toMatchObject({ status });
      expect(presenceReport('Borys', from, to, false, NOW)).toMatchObject({ status });
    });

    it('a resident nobody knows', () => {
      expect(presenceReport('Nobody', FROM, TO, false, NOW)).toEqual({
        status: 404,
        message: 'Unknown resident: Nobody',
      });
      expect(dailyPresenceReport('Nobody', FROM, TO, false, NOW)).toMatchObject({ status: 404 });
    });

    it('but not a range of exactly 366 days', () => {
      expect(isRefusal(houseReport('2025-10-08T00:00:00', TO, false, NOW))).toBe(false);
    });
  });
});

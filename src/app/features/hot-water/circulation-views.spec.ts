import {
  durationText,
  stoppedByText,
  toCirculationView,
  toRunRow,
  toRunRows,
  todayRange,
  triggerText,
} from './circulation-views';

describe('circulation views', () => {
  const ZONE = 'Europe/Warsaw';

  describe('the pump', () => {
    it('reads what the answer says', () => {
      expect(
        toCirculationView(
          {
            running: true,
            since: '2026-11-06T09:00:23',
            trigger: 'manual',
            source: 'dashboard',
            returnTemperature: 31.06,
            measuredAt: '2026-11-06T09:00:31',
            lastRun: { startedAt: '2026-11-06T09:00:23', trigger: 'manual' },
          },
          ZONE,
        ),
      ).toEqual({
        running: true,
        since: '2026-11-06T09:00:23',
        trigger: 'manual',
        source: 'dashboard',
        returnTemperature: 31.06,
        measuredAt: '2026-11-06T09:00:31',
        lastRun: {
          startedAt: '2026-11-06T09:00:23',
          endedAt: undefined,
          trigger: 'manual',
          source: undefined,
          stoppedBy: undefined,
          seconds: undefined,
          returnAtStart: undefined,
          returnAtEnd: undefined,
        },
      });
    });

    // missing is never stopped and never 0
    it.each([
      ['an empty answer', {}],
      ['no answer', null],
      ['values of another type', { running: 'yes', returnTemperature: '31', since: 5 }],
    ])('leaves out what %s does not say', (_, answer) => {
      const view = toCirculationView(answer as never, ZONE);

      expect(view.running).toBeUndefined();
      expect(view.returnTemperature).toBeUndefined();
      expect(view.since).toBeUndefined();
      expect(view.lastRun).toBeUndefined();
    });

    it('keeps a stopped pump and a return of 0 °C', () => {
      const view = toCirculationView({ running: false, returnTemperature: 0 }, ZONE);

      expect(view.running).toBe(false);
      expect(view.returnTemperature).toBe(0);
    });
  });

  describe('a run', () => {
    it('has the length of its two ends, in seconds', () => {
      const row = toRunRow(
        {
          startedAt: '2026-11-06T09:00:23',
          endedAt: '2026-11-06T09:03:23',
          stoppedBy: 'limit',
          returnAtStart: 31.06,
          returnAtEnd: 33.69,
        },
        ZONE,
      );

      expect(row.seconds).toBe(180);
      expect(row.stoppedBy).toBe('limit');
      expect(row.returnAtEnd).toBe(33.69);
    });

    it('has no length while it goes on, or with an end before its start', () => {
      expect(toRunRow({ startedAt: '2026-11-06T09:00:23' }, ZONE).seconds).toBeUndefined();
      expect(
        toRunRow({ startedAt: '2026-11-06T09:00:23', endedAt: '2026-11-06T08:00:00' }, ZONE)
          .seconds,
      ).toBeUndefined();
      expect(
        toRunRow({ startedAt: '2026-11-06T09:00:23', endedAt: 'later' }, ZONE).seconds,
      ).toBeUndefined();
    });

    it('leaves out the runs without a start, and reads no answer as none', () => {
      expect(
        toRunRows([{ startedAt: '2026-11-06T09:00:23' }, { trigger: 'manual' }], ZONE).map(
          (row) => row.startedAt,
        ),
      ).toEqual(['2026-11-06T09:00:23']);
      expect(toRunRows(null, ZONE)).toEqual([]);
    });

    // the spring night: 01:59 to 03:01 of the wall clock is two minutes of the house
    it('keeps the length of a run across a change of the clocks', () => {
      expect(
        toRunRow({ startedAt: '2026-03-29T01:59:00', endedAt: '2026-03-29T03:01:00' }, ZONE)
          .seconds,
      ).toBe(120);
    });

    it('says its length in minutes and seconds', () => {
      expect(durationText(130)).toEqual({
        key: 'hotWater.circulation.duration',
        params: { minutes: 2, seconds: 10 },
      });
    });
  });

  describe('the words of the service', () => {
    it('has a word of ours for each value it knows', () => {
      expect(triggerText('manual')).toEqual({ key: 'hotWater.circulation.trigger.manual' });
      expect(triggerText('window')).toEqual({ key: 'hotWater.circulation.trigger.window' });
      expect(stoppedByText('temperature')).toEqual({
        key: 'hotWater.circulation.stoppedBy.temperature',
      });
      expect(stoppedByText('failure')).toEqual({ key: 'hotWater.circulation.stoppedBy.failure' });
    });

    // a value of a newer service is printed as it came - never read as one this version knows
    it('prints a value it does not know as it came', () => {
      expect(triggerText('presence')).toEqual({ literal: 'presence' });
      expect(stoppedByText('toString')).toEqual({ literal: 'toString' });
    });
  });

  describe('today', () => {
    it('runs from the midnight of the house to the next', () => {
      // 23:30 UTC on 5 November is 00:30 of 6 November in Warsaw
      expect(todayRange(Date.parse('2026-11-05T23:30:00Z'), 'Europe/Warsaw')).toEqual({
        from: '2026-11-06T00:00:00',
        to: '2026-11-07T00:00:00',
      });
    });

    it('crosses the end of a month and the night the clocks go back', () => {
      expect(todayRange(Date.parse('2026-10-25T12:00:00Z'), 'Europe/Warsaw')).toEqual({
        from: '2026-10-25T00:00:00',
        to: '2026-10-26T00:00:00',
      });
      expect(todayRange(Date.parse('2026-10-31T12:00:00Z'), 'Europe/Warsaw')).toEqual({
        from: '2026-10-31T00:00:00',
        to: '2026-11-01T00:00:00',
      });
    });
  });
});

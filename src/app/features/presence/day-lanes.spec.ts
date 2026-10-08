import { observedLater, toDayLanes, toDuration } from './day-lanes';
import { addDays, dayOf, fromDay, rangeOfDays, rangeOfPreset } from './report-range';

const WEEK = { from: '2026-10-05T00:00:00', to: '2026-10-08T00:00:00' };

describe('toDayLanes', () => {
  it('cuts the timeline into the days of the range, the newest first', () => {
    const lanes = toDayLanes(WEEK, WEEK.from, WEEK.to, []);

    expect(lanes.map((lane) => lane.date)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05']);
    expect(lanes[0].at).toBe('2026-10-07T00:00:00');
    expect(lanes[0].observed).toEqual({ left: 0, width: 100 });
  });

  it('places a period in its day by the clock', () => {
    const [day] = toDayLanes(
      { from: '2026-10-05T00:00:00', to: '2026-10-06T00:00:00' },
      '2026-10-05T00:00:00',
      '2026-10-06T00:00:00',
      [{ from: '2026-10-05T06:00:00', to: '2026-10-05T18:00:00.123456', open: false }],
    );

    expect(day.blocks).toEqual([{ left: 25, width: 50, from: '06:00', to: '18:00', open: false }]);
  });

  it('splits a period that runs over midnight between its two days', () => {
    const lanes = toDayLanes(WEEK, WEEK.from, WEEK.to, [
      { from: '2026-10-05T18:00:00', to: '2026-10-06T06:00:00' },
    ]);

    const [, tuesday, monday] = lanes;
    expect(monday.blocks).toMatchObject([{ left: 75, width: 25, from: '18:00', to: '24:00' }]);
    expect(tuesday.blocks).toMatchObject([{ left: 0, width: 25, from: '00:00', to: '06:00' }]);
  });

  // "open" says the period is still going on: true of its last day only
  it('marks a period as still going on only on the day it reaches the last check', () => {
    const lanes = toDayLanes(WEEK, WEEK.from, '2026-10-07T15:00:00', [
      { from: '2026-10-06T18:00:00', to: '2026-10-07T15:00:00', open: true },
    ]);

    const [wednesday, tuesday] = lanes;
    expect(wednesday.blocks.map((block) => block.open)).toEqual([true]);
    expect(tuesday.blocks.map((block) => block.open)).toEqual([false]);
  });

  describe('what was not observed', () => {
    // nobody looked: such a day is not a day spent away
    it('gives no day before the history begins, and none after the last check', () => {
      const lanes = toDayLanes(
        { from: '2026-10-01T00:00:00', to: '2026-10-11T00:00:00' },
        '2026-10-05T09:00:00',
        '2026-10-07T12:00:00',
        [],
      );

      expect(lanes.map((lane) => lane.date)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05']);
    });

    it('draws only the observed part of the first and of the last day', () => {
      const lanes = toDayLanes(
        { from: '2026-10-01T00:00:00', to: '2026-10-11T00:00:00' },
        '2026-10-05T06:00:00',
        '2026-10-07T12:00:00',
        [],
      );

      expect(lanes[0].observed).toEqual({ left: 0, width: 50 });
      expect(lanes[1].observed).toEqual({ left: 0, width: 100 });
      expect(lanes[2].observed).toEqual({ left: 25, width: 75 });
    });

    it.each([
      ['no bounds at all', null, null],
      ['a start only', '2026-10-05T00:00:00', null],
      ['bounds that are not date-times', 'yesterday', 'today'],
      ['bounds the wrong way round', '2026-10-07T00:00:00', '2026-10-05T00:00:00'],
    ])('gives no days for %s', (_, from, until) => {
      expect(toDayLanes(WEEK, from, until, [{ from: WEEK.from, to: WEEK.to }])).toEqual([]);
    });
  });

  it('leaves out a stretch that is not one', () => {
    const [day] = toDayLanes(
      { from: '2026-10-05T00:00:00', to: '2026-10-06T00:00:00' },
      '2026-10-05T00:00:00',
      '2026-10-06T00:00:00',
      [
        {},
        { from: 'soon', to: 'later' },
        // seen by a single pass: no length
        { from: '2026-10-05T10:00:00', to: '2026-10-05T10:00:00' },
        { from: '2026-10-05T12:00:00', to: '2026-10-05T11:00:00' },
        { from: '2026-10-05T20:00:00', to: '2026-10-05T21:00:00' },
      ],
    );

    expect(day.blocks.map((block) => block.from)).toEqual(['20:00']);
  });

  it('reads an answer without a list of stretches as none', () => {
    expect(toDayLanes(WEEK, WEEK.from, WEEK.to, null)).toHaveLength(3);
    expect(toDayLanes(WEEK, WEEK.from, WEEK.to, 'none' as never)[0].blocks).toEqual([]);
  });

  it('gives no days for a range that is not one', () => {
    expect(toDayLanes({ from: '', to: '' }, WEEK.from, WEEK.to, [])).toEqual([]);
  });

  // a year is the most a report covers
  it('never gives more days than a report can cover', () => {
    const lanes = toDayLanes(
      { from: '2020-01-01T00:00:00', to: '2026-01-01T00:00:00' },
      '2020-01-01T00:00:00',
      '2026-01-01T00:00:00',
      [],
    );

    expect(lanes).toHaveLength(367);
  });
});

describe('toDuration', () => {
  it('gives whole hours and minutes, rounded down', () => {
    expect(toDuration(63_221)).toEqual({ hours: 17, minutes: 33 });
    expect(toDuration(86_400)).toEqual({ hours: 24, minutes: 0 });
    expect(toDuration(59)).toEqual({ hours: 0, minutes: 0 });
  });

  it.each([undefined, null, '3600', NaN, -1, Infinity])('gives nothing for %s', (value) => {
    expect(toDuration(value)).toBeUndefined();
  });
});

describe('observedLater', () => {
  it('gives the start of the history when it lies inside the range', () => {
    expect(observedLater(WEEK, '2026-10-06T09:20:00')).toBe('2026-10-06T09:20:00');
  });

  it.each([
    ['the history covers the start of the range', WEEK.from],
    ['nothing was observed', null],
    ['the bound is missing', undefined],
  ])('gives nothing when %s', (_, observedFrom) => {
    expect(observedLater(WEEK, observedFrom)).toBeUndefined();
  });
});

describe('the period of a report', () => {
  it('runs from the first midnight to the midnight after the last day', () => {
    expect(rangeOfDays('2026-10-05', '2026-10-07')).toEqual({
      from: '2026-10-05T00:00:00',
      to: '2026-10-08T00:00:00',
    });
  });

  it('puts the ends in order', () => {
    expect(rangeOfDays('2026-10-07', '2026-10-05')).toEqual(
      rangeOfDays('2026-10-05', '2026-10-07'),
    );
  });

  // the service answers a longer range with a 400
  it('is never longer than 366 days: the later days stay', () => {
    const range = rangeOfDays('2020-01-01', '2026-10-08');

    expect(range.to).toBe('2026-10-09T00:00:00');
    expect((Date.parse(`${range.to}Z`) - Date.parse(`${range.from}Z`)) / 86_400_000).toBe(366);
  });

  it.each([
    ['today', '2026-10-08T00:00:00'],
    ['week', '2026-10-02T00:00:00'],
    ['month', '2026-09-09T00:00:00'],
  ] as const)('of "%s" ends with the running day', (preset, from) => {
    expect(rangeOfPreset(preset, '2026-10-08')).toEqual({ from, to: '2026-10-09T00:00:00' });
  });

  it('counts days over the end of a month and over a change of the clocks', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-26', -1)).toBe('2026-10-25');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('turns a day into the date the calendar shows for it, and back', () => {
    const date = fromDay('2026-10-08');

    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 9, 8, 0,
    ]);
    expect(dayOf('2026-10-08T00:00:00')).toBe('2026-10-08');
  });
});

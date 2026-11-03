import { SchedulePeriod } from '../room-heating/room-views';
import {
  axisOf,
  bridgesOf,
  gapAround,
  scheduleLine,
  solidGapOf,
  summarise,
  toLine,
  wallClockOf,
} from './chart-data';

const at = (dateTime: string) => Date.parse(`${dateTime}Z`);
const value = (point: Record<string, unknown>) => point['value'];

describe('toLine', () => {
  it('places every point on the wall clock of the house, oldest first', () => {
    const line = toLine(
      [
        { at: '2026-10-08T00:20:00', value: 21.4 },
        { at: '2026-10-08T00:00:00', value: 21.5 },
      ],
      1200,
      value,
    );

    expect(line).toEqual([
      [at('2026-10-08T00:00:00'), 21.5],
      [at('2026-10-08T00:20:00'), 21.4],
    ]);
  });

  // one bucket missed is a silence within what a sensor does, and drawn through (HAS-375)
  it('draws a single missing bucket through', () => {
    const line = toLine(
      [
        { at: '2026-10-08T00:00:00', value: 21.5 },
        { at: '2026-10-08T00:20:00', value: 21.4 },
        { at: '2026-10-08T01:00:00', value: 20.9 },
      ],
      1200,
      value,
    );

    expect(line).toEqual([
      [at('2026-10-08T00:00:00'), 21.5],
      [at('2026-10-08T00:20:00'), 21.4],
      [at('2026-10-08T01:00:00'), 20.9],
    ]);
  });

  // a longer silence - the outage of a database - is a gap, which the chart bridges faintly
  it('breaks the line in the middle of a silence longer than two buckets', () => {
    const line = toLine(
      [
        { at: '2026-10-08T00:00:00', value: 21.5 },
        { at: '2026-10-08T01:00:00', value: 20.9 },
      ],
      1200,
      value,
    );

    expect(line).toEqual([
      [at('2026-10-08T00:00:00'), 21.5],
      [at('2026-10-08T00:30:00'), null],
      [at('2026-10-08T01:00:00'), 20.9],
    ]);
  });

  it('draws through as long a silence as the caller allows', () => {
    const points = [
      { at: '2026-10-08T00:00:00', value: 21.5 },
      { at: '2026-10-08T02:40:00', value: 21 },
      { at: '2026-10-08T06:00:00', value: 20.5 },
    ];

    expect(toLine(points, 1200, value, 3 * 3600)).toEqual([
      [at('2026-10-08T00:00:00'), 21.5],
      [at('2026-10-08T02:40:00'), 21],
      // 3 h 20 min is past the three hours
      [at('2026-10-08T04:20:00'), null],
      [at('2026-10-08T06:00:00'), 20.5],
    ]);
  });

  it('draws neighbouring buckets as one line', () => {
    const line = toLine(
      [
        { at: '2026-10-08T00:00:00', value: 46 },
        { at: '2026-10-08T00:05:00', value: 46.1 },
        { at: '2026-10-08T00:10:00', value: 46.2 },
      ],
      300,
      value,
    );

    expect(line.some(([, reading]) => reading === null)).toBe(false);
  });

  // nothing checks an answer at runtime: what cannot be read is left out, a silence like any other
  it('leaves out a point without a readable time or a finite value', () => {
    const line = toLine(
      [
        { at: '2026-10-08T00:00:00', value: 21.5 },
        { at: '2026-10-08T00:20:00', value: 'warm' },
        { at: 'yesterday', value: 21 },
        { value: 21 },
        null,
        { at: '2026-10-08T01:20:00', value: 21.2 },
      ],
      1200,
      value,
    );

    expect(line).toEqual([
      [at('2026-10-08T00:00:00'), 21.5],
      [at('2026-10-08T00:40:00'), null],
      [at('2026-10-08T01:20:00'), 21.2],
    ]);
  });

  it('draws the line through when the answer does not say how wide a bucket is', () => {
    const points = [
      { at: '2026-10-08T00:00:00', value: 21.5 },
      { at: '2026-10-08T06:00:00', value: 20 },
    ];

    for (const bucketSeconds of [undefined, 0, -5, 'wide', Number.NaN]) {
      expect(toLine(points, bucketSeconds, value)).toHaveLength(2);
    }
  });

  it('is empty for an answer that is no list of points', () => {
    expect(toLine(undefined, 300, value)).toEqual([]);
    expect(toLine({ at: '2026-10-08T00:00:00' }, 300, value)).toEqual([]);
  });

  it('reads the value the caller names', () => {
    const points = [{ at: '2026-10-08T00:00:00', water: 46.8, circulation: 26.4 }];

    expect(toLine(points, 300, (point) => point['circulation'])).toEqual([
      [at('2026-10-08T00:00:00'), 26.4],
    ]);
  });
});

describe('solidGapOf', () => {
  it('is two buckets, or longer where the caller asks for it', () => {
    expect(solidGapOf(1200)).toBe(2400);
    expect(solidGapOf(1200, 3 * 3600)).toBe(3 * 3600);
    // a bucket of a long range is wider than the quiet of a sensor
    expect(solidGapOf(6 * 3600, 3 * 3600)).toBe(12 * 3600);
  });

  it('tells nothing without a bucket, unless the caller names a silence', () => {
    expect(solidGapOf(undefined)).toBeUndefined();
    expect(solidGapOf('wide')).toBeUndefined();
    expect(solidGapOf(-5, 3600)).toBe(3600);
  });
});

describe('bridgesOf', () => {
  it('joins the two readings around every gap, each bridge apart', () => {
    expect(
      bridgesOf([
        [1, 20],
        [2, 21],
        [3, null],
        [4, 22],
        [5, null],
        [6, 23],
      ]),
    ).toEqual([
      [2, 21],
      [4, 22],
      [4, null],
      [4, 22],
      [6, 23],
    ]);
  });

  it('has nothing to bridge in a whole line, or at its ends', () => {
    expect(
      bridgesOf([
        [1, 20],
        [2, 21],
      ]),
    ).toEqual([]);
    expect(
      bridgesOf([
        [1, null],
        [2, 21],
        [3, null],
      ]),
    ).toEqual([]);
  });
});

describe('gapAround', () => {
  const line = [
    [1, 20],
    [5, null],
    [9, 22],
  ] as const;

  it('names the readings around a gap', () => {
    expect(gapAround(line, 1)).toEqual({ from: 1, to: 9 });
  });

  it('is nothing for a reading or outside the line', () => {
    expect(gapAround(line, 0)).toBeUndefined();
    expect(gapAround(line, 7)).toBeUndefined();
  });
});

describe('summarise', () => {
  it('finds the lowest and the highest value, breaks aside', () => {
    expect(
      summarise([
        [1, 21.5],
        [2, null],
        [3, 19.8],
        [4, 22.1],
        [5, 20],
      ]),
    ).toEqual({ lowest: 19.8, highest: 22.1 });
  });

  it('says nothing of a line without a value', () => {
    expect(summarise([])).toBeUndefined();
    expect(summarise([[1, null]])).toBeUndefined();
  });
});

describe('axisOf', () => {
  it('places the ends of a range on the wall clock', () => {
    expect(axisOf({ from: '2026-10-08T00:00:00', to: '2026-10-09T00:00:00' })).toEqual({
      from: at('2026-10-08T00:00:00'),
      to: at('2026-10-09T00:00:00'),
    });
  });

  it('has no axis for a range that cannot be read or does not run forward', () => {
    expect(axisOf({ from: 'then', to: '2026-10-09T00:00:00' })).toBeUndefined();
    expect(axisOf({ from: '2026-10-09T00:00:00', to: '2026-10-09T00:00:00' })).toBeUndefined();
  });

  it('reads no offset into a local date-time', () => {
    expect(wallClockOf('2026-10-08T00:00:00Z')).toBeUndefined();
    expect(wallClockOf('2026-10-08T00:00:00+02:00')).toBeUndefined();
  });
});

describe('scheduleLine', () => {
  // 2026-10-08 is a Thursday (3, Monday being 0)
  const THURSDAY = { from: at('2026-10-08T00:00:00'), to: at('2026-10-09T00:00:00') };
  const period = (
    days: number[],
    start: number,
    end: number,
    temperature: number,
  ): SchedulePeriod => ({ days, start, end, temperature });

  it('draws a period as a step between its two times', () => {
    const line = scheduleLine([[period([3], 6 * 60, 8 * 60, 21)]], THURSDAY);

    expect(line).toEqual([
      [at('2026-10-08T06:00:00'), 21],
      [at('2026-10-08T08:00:00'), 21],
    ]);
  });

  it('breaks the line between two periods of a day', () => {
    const line = scheduleLine(
      [[period([3], 6 * 60, 8 * 60, 21), period([3], 17 * 60, 22 * 60, 22)]],
      THURSDAY,
    );

    expect(line).toEqual([
      [at('2026-10-08T06:00:00'), 21],
      [at('2026-10-08T08:00:00'), 21],
      [at('2026-10-08T08:00:00'), null],
      [at('2026-10-08T17:00:00'), 22],
      [at('2026-10-08T22:00:00'), 22],
    ]);
  });

  it('leaves out a period of another day of the week', () => {
    expect(scheduleLine([[period([4, 5], 6 * 60, 8 * 60, 21)]], THURSDAY)).toEqual([]);
  });

  // a room with a radiator and a floor: the card shows the higher target, and so does the line
  it('takes the highest of the periods that are on together', () => {
    const line = scheduleLine(
      [[period([3], 6 * 60, 10 * 60, 21)], [period([3], 8 * 60, 12 * 60, 23)]],
      THURSDAY,
    );

    expect(line).toEqual([
      [at('2026-10-08T06:00:00'), 21],
      [at('2026-10-08T08:00:00'), 21],
      [at('2026-10-08T08:00:00'), 23],
      [at('2026-10-08T10:00:00'), 23],
      [at('2026-10-08T10:00:00'), 23],
      [at('2026-10-08T12:00:00'), 23],
    ]);
  });

  it('lays the schedule of each weekday over its day of a longer range', () => {
    const week = { from: at('2026-10-05T00:00:00'), to: at('2026-10-12T00:00:00') };
    // Monday and Sunday
    const line = scheduleLine([[period([0, 6], 7 * 60, 9 * 60, 21)]], week);

    expect(line.filter(([, asked]) => asked !== null).map(([time]) => time)).toEqual([
      at('2026-10-05T07:00:00'),
      at('2026-10-05T09:00:00'),
      at('2026-10-11T07:00:00'),
      at('2026-10-11T09:00:00'),
    ]);
  });

  it('cuts a period at the ends of the range', () => {
    const afternoon = { from: at('2026-10-08T07:00:00'), to: at('2026-10-08T07:30:00') };

    expect(scheduleLine([[period([3], 6 * 60, 8 * 60, 21)]], afternoon)).toEqual([
      [at('2026-10-08T07:00:00'), 21],
      [at('2026-10-08T07:30:00'), 21],
    ]);
  });

  it('is empty for a room without a schedule', () => {
    expect(scheduleLine([], THURSDAY)).toEqual([]);
    expect(scheduleLine([[], []], THURSDAY)).toEqual([]);
  });
});

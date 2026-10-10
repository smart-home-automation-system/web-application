import { ChartLine } from './chart-data';
import { ChartColors, ChartInput, axisLabel, chartOption, tooltipTime } from './chart-option';

const at = (dateTime: string) => Date.parse(`${dateTime}Z`);
const DAY_MS = 24 * 60 * 60 * 1_000;

const COLORS: ChartColors = {
  lines: ['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(3, 3, 3)', 'rgb(4, 4, 4)', 'rgb(5, 5, 5)'],
  text: 'rgb(90, 90, 90)',
  strongText: 'rgb(10, 10, 10)',
  grid: 'rgb(120, 120, 120)',
  surface: 'rgb(250, 250, 250)',
  fontFamily: 'Plus Jakarta Sans',
};

const TANK: ChartLine = {
  key: 'water',
  name: 'Tank',
  color: 1,
  points: [
    [at('2026-10-08T00:00:00'), 46.81],
    [at('2026-10-08T00:05:00'), 46.5],
  ],
};
const SCHEDULE: ChartLine = {
  key: 'schedule',
  name: 'Schedule',
  color: 4,
  points: [],
  dashed: true,
};

function input(overrides: Partial<ChartInput> = {}): ChartInput {
  return {
    lines: [TANK],
    from: at('2026-10-08T00:00:00'),
    to: at('2026-10-09T00:00:00'),
    unit: '°C',
    locale: 'en-GB',
    ...overrides,
  };
}

/** The option as the plain object it is, for reading what was asked for. */
function option(overrides: Partial<ChartInput> = {}) {
  return chartOption(input(overrides), COLORS) as {
    useUTC: boolean;
    animation: boolean;
    color: string[];
    xAxis: { min: number; max: number; axisLabel: { formatter(at: number): string } };
    yAxis: {
      min(extent: { min: number }): number;
      max(extent: { max: number }): number;
      axisLabel: { formatter(at: number): string };
    };
    tooltip: { formatter(hovered: unknown): string };
    series: {
      name: string;
      data: unknown;
      connectNulls: boolean;
      lineStyle: { type: string };
      markArea?: { data: [{ name: string; yAxis: number }, { yAxis: number }][] };
    }[];
  };
}

describe('chartOption', () => {
  // the times are the wall clock of the house on the UTC timeline: no zone may shift them
  it('reads the times in UTC, whatever the zone of the browser', () => {
    expect(option().useUTC).toBe(true);
  });

  it('spans the axis over the range that was asked for, not over the points', () => {
    const { xAxis } = option();

    expect(xAxis.min).toBe(at('2026-10-08T00:00:00'));
    expect(xAxis.max).toBe(at('2026-10-09T00:00:00'));
  });

  it('never bridges a break of a line', () => {
    expect(option().series.every((line) => line.connectNulls === false)).toBe(true);
  });

  it('gives every line the colour of the theme it names, in order', () => {
    expect(option({ lines: [TANK, SCHEDULE] }).color).toEqual(['rgb(1, 1, 1)', 'rgb(4, 4, 4)']);
  });

  it('dashes a line that is not a measurement', () => {
    const [tank, schedule] = option({ lines: [TANK, SCHEDULE] }).series;

    expect(tank.lineStyle.type).toBe('solid');
    expect(schedule.lineStyle.type).toBe('dashed');
  });

  it('does not slide about when it is drawn again with every poll', () => {
    expect(option().animation).toBe(false);
  });

  describe('the band', () => {
    const band = { low: 38, high: 42, name: 'kept in' };

    it('is drawn once, behind the first line', () => {
      const series = option({ lines: [TANK, SCHEDULE], band }).series;

      expect(series[0].markArea?.data).toEqual([[{ name: 'kept in', yAxis: 38 }, { yAxis: 42 }]]);
      expect(series[1].markArea).toBeUndefined();
    });

    // every reading above the band: the band still belongs to the picture
    it('stays inside the picture while every reading lies on one side of it', () => {
      const { yAxis } = option({ band });

      expect(yAxis.min({ min: 46.5 })).toBeLessThanOrEqual(38);
      expect(yAxis.max({ max: 30 })).toBeGreaterThanOrEqual(42);
    });

    it('is absent from a chart that has none', () => {
      expect(option().series[0].markArea).toBeUndefined();
      expect(option().yAxis.min({ min: 20.4 })).toBe(19);
    });
  });

  it('writes the unit next to the values of the axis, in the number format of the language', () => {
    expect(option().yAxis.axisLabel.formatter(21.5)).toBe('21.5 °C');
    expect(option({ locale: 'pl-PL' }).yAxis.axisLabel.formatter(21.5)).toBe('21,5 °C');
  });

  describe('the tooltip', () => {
    const hovered = (rows: { seriesName: string; value: [number, number | null] }[]) =>
      rows.map((row) => ({ ...row, marker: '<i></i>' }));

    it('says when and what, with the unit', () => {
      const text = option().tooltip.formatter(
        hovered([{ seriesName: 'Tank', value: [at('2026-10-08T14:20:00'), 46.81] }]),
      );

      expect(text).toContain('Thu 8 Oct, 14:20');
      expect(text).toContain('Tank: <strong>46.81 °C</strong>');
    });

    it('leaves out a line that has a break there', () => {
      const text = option().tooltip.formatter(
        hovered([
          { seriesName: 'Tank', value: [at('2026-10-08T14:20:00'), null] },
          { seriesName: 'Circulation', value: [at('2026-10-08T14:20:00'), 26.4] },
        ]),
      );

      expect(text).not.toContain('Tank');
      expect(text).toContain('Circulation');
    });

    // the tooltip is HTML: a name is ours, and escaped all the same
    it('escapes the name of a line', () => {
      const text = option().tooltip.formatter(
        hovered([{ seriesName: '<img src=x>', value: [at('2026-10-08T14:20:00'), 1] }]),
      );

      expect(text).not.toContain('<img');
      expect(text).toContain('&lt;img src=x&gt;');
    });
  });
});

describe('axisLabel', () => {
  it('reads as a clock within two days, with the date where a day begins', () => {
    expect(axisLabel(at('2026-10-08T14:00:00'), DAY_MS, 'en-GB')).toBe('14:00');
    expect(axisLabel(at('2026-10-09T00:00:00'), DAY_MS, 'en-GB')).toBe('9 Oct');
  });

  it('reads as dates over a longer range', () => {
    expect(axisLabel(at('2026-10-08T12:00:00'), 7 * DAY_MS, 'en-GB')).toBe('8 Oct');
  });

  it('follows the language', () => {
    expect(axisLabel(at('2026-10-08T12:00:00'), 7 * DAY_MS, 'pl-PL')).toBe('8 paź');
  });
});

describe('tooltipTime', () => {
  // shown as the house had it: never moved into the zone of whoever looks
  it('prints the wall clock of the house as it is', () => {
    expect(tooltipTime(at('2026-10-08T00:20:00'), 'en-GB')).toBe('Thu 8 Oct, 00:20');
  });
});

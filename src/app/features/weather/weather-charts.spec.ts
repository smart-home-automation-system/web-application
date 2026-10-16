import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  FakeQueryResource,
  answerQuery,
  failQuery,
  fakeQueryResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryPreset, HistoryRange } from '../../core/time/history-range';
import { WeatherApi, WeatherHistory, WeatherMetric } from '../../data-access/weather/weather-api';
import { HistoryPeriod } from '../../shared/history-chart/history-period';
import { WEATHER_CHARTS, WeatherChartSpec, rainPerBucket, weatherChart } from './weather-charts';

const at = (dateTime: string) => Date.parse(`${dateTime}Z`);
const DAY: HistoryRange = { from: '2026-10-15T15:00:00', to: '2026-10-16T16:00:00' };

const specOf = (key: string) => WEATHER_CHARTS.find((spec) => spec.key === key) as WeatherChartSpec;

describe('rainPerBucket', () => {
  const bucket = (time: string, min: number, max: number) => ({
    at: `2026-10-16T${time}:00`,
    avg: (min + max) / 2,
    min,
    max,
  });

  // a shower across the edge of two buckets is counted once, and whole
  it('counts the rain of a bucket from the highest total of the bucket before', () => {
    expect(
      rainPerBucket(
        [bucket('05:00', 1200, 1200), bucket('05:05', 1202, 1206), bucket('05:10', 1206, 1207)],
        300,
      ),
    ).toEqual([
      [at('2026-10-16T05:00:00'), 0],
      [at('2026-10-16T05:05:00'), 6],
      [at('2026-10-16T05:10:00'), 1],
    ]);
  });

  it('counts only what a bucket rose by inside itself after a gap', () => {
    expect(rainPerBucket([bucket('05:00', 1200, 1201), bucket('05:20', 1210, 1212)], 300)).toEqual([
      [at('2026-10-16T05:00:00'), 1],
      [at('2026-10-16T05:20:00'), 2],
    ]);
  });

  // a gauge starts where it stood: a bucket that starts lower was reset, whatever it ends at
  it('counts a reset of the gauge from the bucket itself, also when it ends above the one before', () => {
    expect(rainPerBucket([bucket('05:00', 11, 12), bucket('05:05', 0, 12.5)], 300)).toEqual([
      [at('2026-10-16T05:00:00'), 1],
      [at('2026-10-16T05:05:00'), 12.5],
    ]);
  });

  it('does not count a reset of the gauge as negative rain', () => {
    expect(rainPerBucket([bucket('05:00', 4300, 4311), bucket('05:05', 0, 3)], 300)).toEqual([
      [at('2026-10-16T05:00:00'), 11],
      [at('2026-10-16T05:05:00'), 3],
    ]);
  });

  it('leaves out a bucket it cannot read, and an answer that is no list', () => {
    expect(
      rainPerBucket(
        [
          { at: 'x', min: 1, max: 2 },
          { at: '2026-10-16T05:00:00', max: 2 },
        ],
        300,
      ),
    ).toEqual([]);
    expect(rainPerBucket(null, 300)).toEqual([]);
  });
});

describe('weatherChart', () => {
  let resources: Map<WeatherMetric, FakeQueryResource<HistoryRange, WeatherHistory | null>>;
  let period: HistoryPeriod;

  beforeEach(() => {
    resources = new Map();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: WeatherApi,
          useValue: {
            watchHistory: (metric: WeatherMetric) => {
              const resource = fakeQueryResource<HistoryRange, WeatherHistory | null>();
              resources.set(metric, resource);
              return resource;
            },
          },
        },
      ],
    });
    const preset = signal<HistoryPreset>('day');
    period = { preset, range: signal(DAY), presetOf: () => preset() };
  });

  const chartOf = (key: string) =>
    TestBed.runInInjectionContext(() => weatherChart(specOf(key), period));
  const history = (points: object[]): WeatherHistory => ({ bucketSeconds: 300, points });

  it('asks for every metric of the chart', () => {
    chartOf('temperature');

    expect([...resources.keys()]).toEqual(['temperature', 'dewPoint']);
  });

  it('waits until every line has its answer, and draws the averages', () => {
    const chart = chartOf('temperature');
    answerQuery(
      resources.get('temperature')!,
      DAY,
      history([{ at: '2026-10-16T10:00:00', avg: 11.2, min: 11, max: 11.5 }]),
    );

    expect(chart.waiting()).toBe(true);

    answerQuery(
      resources.get('dewPoint')!,
      DAY,
      history([{ at: '2026-10-16T10:00:00', avg: 5.1, min: 5, max: 5.2 }]),
    );

    expect(chart.waiting()).toBe(false);
    expect(chart.lines().map((line) => [line.name, line.points])).toEqual([
      ['Temperature', [[at('2026-10-16T10:00:00'), 11.2]]],
      ['Dew point', [[at('2026-10-16T10:00:00'), 5.1]]],
    ]);
    expect(chart.facts()).toEqual([
      { key: 'temperature', name: 'Temperature', kind: 'range', lowest: 11.2, highest: 11.2 },
      { key: 'dewPoint', name: 'Dew point', kind: 'range', lowest: 5.1, highest: 5.1 },
    ]);
  });

  // a gust is the peak of its bucket, not its average
  it('draws the highest gust of a bucket', () => {
    const chart = chartOf('wind');
    answerQuery(
      resources.get('wind')!,
      DAY,
      history([{ at: '2026-10-16T10:00:00', avg: 2, min: 1, max: 3 }]),
    );
    answerQuery(
      resources.get('gust')!,
      DAY,
      history([{ at: '2026-10-16T10:00:00', avg: 4, min: 2, max: 7.5 }]),
    );

    expect(chart.lines().map((line) => line.points[0][1])).toEqual([2, 7.5]);
  });

  // the chart lifts the night to 1 lx for its axis of powers of ten (chart-option); the line and
  // the numbers under the chart keep what was measured
  it('keeps the dark of the night at 0 lx, in the line and in the numbers', () => {
    const chart = chartOf('illuminance');
    answerQuery(
      resources.get('illuminance')!,
      DAY,
      history([
        { at: '2026-10-16T02:00:00', avg: 0, min: 0, max: 0 },
        { at: '2026-10-16T02:05:00', avg: 0.4, min: 0, max: 1 },
      ]),
    );

    expect(chart.lines()[0].points.map(([, value]) => value)).toEqual([0, 0.4]);
    expect(chart.facts()[0]).toMatchObject({ kind: 'range', lowest: 0, highest: 0.4 });
  });

  it('draws the rain as bars and sums it under the chart', () => {
    const chart = chartOf('precipitation');
    answerQuery(
      resources.get('precipitation')!,
      DAY,
      history([
        { at: '2026-10-16T05:00:00', avg: 1200, min: 1200, max: 1203 },
        { at: '2026-10-16T05:05:00', avg: 1205, min: 1203, max: 1207 },
      ]),
    );

    expect(chart.lines()[0].bars).toBe(true);
    expect(chart.facts()).toEqual([
      { key: 'precipitation', name: 'Rain', kind: 'total', total: 7 },
    ]);
  });

  it('tells the failure of the first call that failed, and draws what the other answered', () => {
    const chart = chartOf('wind');
    answerQuery(
      resources.get('wind')!,
      DAY,
      history([{ at: '2026-10-16T10:00:00', avg: 2, min: 1, max: 3 }]),
    );
    failQuery(resources.get('gust')!, DAY, new ApiError('server', 502));

    expect(chart.waiting()).toBe(false);
    expect(chart.error()?.status).toBe(502);
    expect(chart.stale()).toBe(true);
    expect(chart.lines().map((line) => line.key)).toEqual(['wind']);
  });

  // the hour turned: one line has the new range, the other still the old one
  it('spans its axis over the ranges of all its lines', () => {
    const chart = chartOf('temperature');
    const NEXT_HOUR: HistoryRange = { from: '2026-10-15T16:00:00', to: '2026-10-16T17:00:00' };
    answerQuery(resources.get('temperature')!, NEXT_HOUR, history([]));
    answerQuery(resources.get('dewPoint')!, DAY, history([]));

    expect(chart.axis()).toEqual({ from: at(DAY.from), to: at(NEXT_HOUR.to) });
  });

  it('keeps the freshness of a line that answered while the other never did', () => {
    const chart = chartOf('wind');
    answerQuery(resources.get('wind')!, DAY, history([]));
    resources.get('wind')!.lastUpdated.set(2_000);
    failQuery(resources.get('gust')!, DAY, new ApiError('client', 400));

    expect(chart.lastUpdated()).toBe(2_000);
  });

  it('is as fresh as its oldest answer', () => {
    const chart = chartOf('temperature');
    answerQuery(resources.get('temperature')!, DAY, history([]));
    answerQuery(resources.get('dewPoint')!, DAY, history([]));
    resources.get('temperature')!.lastUpdated.set(1_000);
    resources.get('dewPoint')!.lastUpdated.set(5_000);

    expect(chart.lastUpdated()).toBe(1_000);
    expect(chart.lines()).toEqual([]);
  });
});

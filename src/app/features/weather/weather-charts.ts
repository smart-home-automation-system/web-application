import { Signal, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { LanguageStore } from '../../core/i18n/language-store';
import { WeatherApi, WeatherMetric } from '../../data-access/weather/weather-api';
import { MessageKey } from '../../i18n/messages';
import {
  ChartLine,
  LinePoint,
  summarise,
  toLine,
  wallClockOf,
} from '../../shared/history-chart/chart-data';
import { HistoryPeriod, shownHistory } from '../../shared/history-chart/history-period';

/** What of a bucket a line draws. */
type Drawn =
  /** the average of the bucket */
  | 'avg'
  /** its highest reading - a gust is its peak, not its average */
  | 'max'
  /** the rain that fell in it, from the running total of the gauge - drawn as a bar */
  | 'rain';

interface LineSpec {
  readonly metric: WeatherMetric;
  readonly name: MessageKey;
  readonly color: 1 | 2;
  readonly drawn: Drawn;
}

/** One chart of the weather page: what it draws and how its numbers read. */
export interface WeatherChartSpec {
  readonly key: string;
  readonly title: MessageKey;
  /** What the picture shows, for whoever cannot see it. */
  readonly label: MessageKey;
  readonly icon: string;
  /** Written after every value; empty where the unit is not known. */
  readonly unit: string;
  readonly decimals: number;
  readonly logarithmic?: boolean;
  /** What a value can never go past: no wind below nothing, no humidity above 100 %. */
  readonly bounds?: { readonly min?: number; readonly max?: number };
  /** A sentence under the chart, for what the picture cannot say. */
  readonly note?: MessageKey;
  readonly lines: readonly LineSpec[];
}

/**
 * The six charts, in the order of the page. The units are the ones the gateway of the station
 * reports; the unit of the rain gauge is not confirmed (`weather-service` README), so its
 * amounts are written without one.
 */
export const WEATHER_CHARTS: readonly WeatherChartSpec[] = [
  {
    key: 'temperature',
    title: 'weather.charts.temperature.title',
    label: 'weather.charts.temperature.label',
    icon: 'device_thermostat',
    unit: '°C',
    decimals: 1,
    lines: [
      { metric: 'temperature', name: 'weather.metric.temperature', color: 1, drawn: 'avg' },
      { metric: 'dewPoint', name: 'weather.metric.dewPoint', color: 2, drawn: 'avg' },
    ],
  },
  {
    key: 'humidity',
    title: 'weather.charts.humidity.title',
    label: 'weather.charts.humidity.label',
    icon: 'humidity_percentage',
    unit: '%',
    decimals: 0,
    bounds: { min: 0, max: 100 },
    lines: [{ metric: 'humidity', name: 'weather.metric.humidity', color: 1, drawn: 'avg' }],
  },
  {
    key: 'wind',
    title: 'weather.charts.wind.title',
    label: 'weather.charts.wind.label',
    icon: 'air',
    unit: 'm/s',
    decimals: 1,
    bounds: { min: 0 },
    note: 'weather.charts.wind.note',
    lines: [
      { metric: 'wind', name: 'weather.metric.wind', color: 1, drawn: 'avg' },
      { metric: 'gust', name: 'weather.metric.gust', color: 2, drawn: 'max' },
    ],
  },
  {
    key: 'illuminance',
    title: 'weather.charts.illuminance.title',
    label: 'weather.charts.illuminance.label',
    icon: 'light_mode',
    unit: 'lx',
    decimals: 0,
    logarithmic: true,
    note: 'weather.charts.illuminance.note',
    lines: [{ metric: 'illuminance', name: 'weather.metric.illuminance', color: 1, drawn: 'avg' }],
  },
  {
    key: 'precipitation',
    title: 'weather.charts.precipitation.title',
    label: 'weather.charts.precipitation.label',
    icon: 'rainy',
    unit: '',
    // the gauge counts in tenths; a light shower is a bar of 0.2, not of 0
    decimals: 1,
    note: 'weather.charts.precipitation.note',
    lines: [{ metric: 'precipitation', name: 'weather.metric.rain', color: 1, drawn: 'rain' }],
  },
  {
    key: 'pressure',
    title: 'weather.charts.pressure.title',
    label: 'weather.charts.pressure.label',
    icon: 'speed',
    unit: 'hPa',
    decimals: 1,
    note: 'weather.charts.pressure.note',
    lines: [{ metric: 'pressure', name: 'weather.metric.pressure', color: 1, drawn: 'avg' }],
  },
];

/** What is said under a chart in numbers: the range of a line, or the sum of the bars. */
export type ChartFact =
  | {
      readonly key: string;
      readonly name: string;
      readonly kind: 'range';
      readonly lowest: number;
      readonly highest: number;
    }
  | { readonly key: string; readonly name: string; readonly kind: 'total'; readonly total: number };

/** A chart of the page as its card shows it. */
export interface WeatherChartView {
  readonly spec: WeatherChartSpec;
  /** The answer of some line for the period on screen has not arrived, one way or the other. */
  readonly waiting: Signal<boolean>;
  /** The failure of the first of its calls that failed. */
  readonly error: Signal<ApiError | undefined>;
  /** The oldest of the answers: the chart is as fresh as its stalest line. */
  readonly lastUpdated: Signal<number | undefined>;
  readonly stale: Signal<boolean>;
  readonly axis: Signal<{ readonly from: number; readonly to: number } | undefined>;
  /** The lines that have anything to draw. */
  readonly lines: Signal<readonly ChartLine[]>;
  readonly facts: Signal<readonly ChartFact[]>;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The rain of every bucket, from the running total of the gauge: the highest total of a bucket
 * less the highest of the bucket before - so a shower across the edge of two buckets is counted
 * once, and whole. After a gap, for the first bucket and for a bucket that starts below the one
 * before (the gauge was reset) the rain of a bucket is what it rose by inside itself, `max - min`
 * - the rule the service states. A bucket without a total has no bar.
 */
export function rainPerBucket(points: unknown, bucketSeconds: unknown): LinePoint[] {
  if (!Array.isArray(points)) {
    return [];
  }
  const bucketMs = finite(bucketSeconds) && bucketSeconds > 0 ? bucketSeconds * 1_000 : undefined;
  const read = points
    .flatMap((point: unknown) => {
      if (typeof point !== 'object' || point === null) {
        return [];
      }
      const record = point as Record<string, unknown>;
      const at = wallClockOf(record['at']);
      const { min, max } = record;
      return at === undefined || !finite(min) || !finite(max) ? [] : [{ at, min, max }];
    })
    .sort((a, b) => a.at - b.at);
  return read.map(({ at, min, max }, index): LinePoint => {
    const before = read[index - 1];
    const adjacent = before !== undefined && bucketMs !== undefined && at - before.at <= bucketMs;
    // the gauge starts where it stood: a bucket that starts lower was reset in between
    const rain = adjacent && min >= before.max ? max - before.max : max - min;
    return [at, Math.max(0, Math.round(rain * 100) / 100)];
  });
}

/** The values of a bucket a line draws: the average, the peak or the rain. */
function pointsOf(drawn: Drawn, answer: { points?: unknown; bucketSeconds?: unknown } | undefined) {
  switch (drawn) {
    case 'avg':
      return toLine(answer?.points, answer?.bucketSeconds, (point) => point['avg']);
    case 'max':
      return toLine(answer?.points, answer?.bucketSeconds, (point) => point['max']);
    case 'rain':
      return rainPerBucket(answer?.points, answer?.bucketSeconds);
  }
}

/**
 * The chart of `spec`: a history per line, all for the period of the page. Call in an injection
 * context, like `pollingResource`: the polling lives as long as the caller.
 */
export function weatherChart(spec: WeatherChartSpec, period: HistoryPeriod): WeatherChartView {
  const api = inject(WeatherApi);
  const transloco = inject(TranslocoService);
  const language = inject(LanguageStore).language;
  const histories = spec.lines.map((line) => {
    const resource = api.watchHistory(line.metric, period.range);
    return { line, resource, shown: shownHistory(resource, period) };
  });

  const measured = computed(() => {
    // read so that the names follow the language
    language();
    return histories.flatMap(({ line, shown }) => {
      const points = pointsOf(line.drawn, shown.answer() ?? undefined);
      return points.length === 0 ? [] : [{ line, name: transloco.translate(line.name), points }];
    });
  });

  return {
    spec,
    waiting: computed(() => histories.some(({ shown }) => shown.waiting())),
    error: computed(() =>
      histories.map(({ resource }) => resource.error()).find((error) => error !== undefined),
    ),
    // the oldest of the answers there are; a line that never answered is told by its failure
    lastUpdated: computed(() => {
      const times = histories
        .map(({ resource }) => resource.lastUpdated())
        .filter((time): time is number => time !== undefined);
      return times.length === 0 ? undefined : Math.min(...times);
    }),
    stale: computed(() => histories.some(({ resource }) => resource.stale())),
    // When the hour turns one line may already have the new range while the other still shows
    // the old one: the axis spans both, so neither is cut at an end.
    axis: computed(() => {
      const axes = histories
        .map(({ shown }) => shown.axis())
        .filter((axis): axis is { from: number; to: number } => axis !== undefined);
      return axes.length === 0
        ? undefined
        : {
            from: Math.min(...axes.map((axis) => axis.from)),
            to: Math.max(...axes.map((axis) => axis.to)),
          };
    }),
    lines: computed(() =>
      measured().map(({ line, name, points }): ChartLine => ({
        key: line.metric,
        name,
        color: line.color,
        points,
        bars: line.drawn === 'rain',
      })),
    ),
    facts: computed(() =>
      measured().flatMap(({ line, name, points }): ChartFact[] => {
        if (line.drawn === 'rain') {
          const total = points.reduce((sum, [, value]) => sum + (value ?? 0), 0);
          return [{ key: line.metric, name, kind: 'total', total: Math.round(total * 100) / 100 }];
        }
        const summary = summarise(points);
        return summary === undefined ? [] : [{ key: line.metric, name, kind: 'range', ...summary }];
      }),
    ),
  };
}

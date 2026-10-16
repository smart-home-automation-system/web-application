import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * The names of the metrics of `weather-service` (its `Metric.apiName`, pinned there by a test):
 * the keys of `GET /weather/current` and the `metric` of the history. The units are the ones
 * the gateway of the station reports - `precipitation` is a running total of the station whose
 * unit is not confirmed yet, so nothing here shows it as millimetres.
 */
export type WeatherMetric =
  | 'temperature'
  | 'humidity'
  | 'dewPoint'
  | 'pressure'
  | 'illuminance'
  | 'uv'
  | 'wind'
  | 'gust'
  | 'windDirection'
  | 'raining'
  | 'precipitation'
  | 'battery'
  | 'voltage';

/** One metric of the current weather, as the service last heard it from the station. */
export interface CurrentMetric {
  /** A number, or `true` / `false` for `raining`. */
  readonly value?: number | boolean;
  /**
   * House wall-clock time the station is last known to have had this value: a value that does
   * not change is confirmed by every packet that carries it.
   */
  readonly measuredAt?: string;
  /** That time is older than the silence the service alerts on (30 minutes). */
  readonly stale?: boolean;
}

/**
 * `GET /home/weather/current` (`weather-service` 0.4.0): a metric per key. **A metric never
 * received since the start of the service is not in the answer at all** - never null, never
 * zero - so an empty object is the station not heard yet, and a key that is missing is shown as
 * nothing, never as 0.
 */
export type CurrentWeather = Partial<Record<WeatherMetric, CurrentMetric>>;

/** `GET /home/weather/status`: how the service hears the station. */
export interface StationStatus {
  /** The gateway of the station; absent while the registry has no station. */
  readonly gateway?: {
    readonly deviceId?: string;
    /** Whether its last read was answered; absent before the first read. */
    readonly reachable?: boolean;
    /** House wall-clock time of that read. */
    readonly checkedAt?: string;
  };
  /** House wall-clock time the gateway last heard the station; absent until it has. */
  readonly lastReadingAt?: string;
  /** Nothing heard for 30 minutes - true as well when nothing was heard since the start. */
  readonly silent?: boolean;
}

/** One bucket of a weather history. */
export interface WeatherHistoryPoint {
  /** House wall-clock time the bucket starts at, aligned to the clock of the house. */
  readonly at?: string;
  readonly avg?: number;
  /** Absent for `windDirection`, whose average is a circular mean. */
  readonly min?: number;
  readonly max?: number;
}

/**
 * `GET /home/weather/history?metric=&from=&to=`: one metric over a range, in buckets whose width
 * the service chooses - the rules of the hot-water history. **A bucket without a reading has no
 * point**: two points further apart than `bucketSeconds` are a gap. An unknown metric is a 400
 * with the code `UNKNOWN_METRIC`.
 */
export interface WeatherHistory {
  readonly metric?: string;
  readonly from?: string;
  readonly to?: string;
  readonly bucketSeconds?: number;
  readonly points?: readonly WeatherHistoryPoint[];
}

// the station sends a packet about every 10 s, and each metric only on a change: a minute is
// enough for a strip that shows the weather, not a measurement
const POLL_CURRENT_EVERY_MS = 60_000;
const POLL_STATUS_EVERY_MS = 60_000;
// a reading is stored at most once a minute, and a bucket is 5 minutes at its narrowest
const POLL_HISTORY_EVERY_MS = 3 * 60_000;

@Injectable({ providedIn: 'root' })
export class WeatherApi {
  private readonly api = inject(ApiClient);

  /**
   * The current weather, every minute; stale after two missed calls. Call in an injection
   * context: the polling lives as long as the caller.
   */
  watchCurrent(): PollingResource<CurrentWeather | null> {
    return pollingResource(() => this.api.get<CurrentWeather | null>('/weather/current'), {
      intervalMs: POLL_CURRENT_EVERY_MS,
      staleAfterMs: 2 * POLL_CURRENT_EVERY_MS,
    });
  }

  /** How the service hears the station. Call in an injection context. */
  watchStatus(): PollingResource<StationStatus | null> {
    return pollingResource(() => this.api.get<StationStatus | null>('/weather/status'), {
      intervalMs: POLL_STATUS_EVERY_MS,
    });
  }

  /**
   * The history of one metric for the range `range()` gives - asked again whenever that changes,
   * the answer tagged with the range it is for (the object itself: a `HistoryPeriod` knows its
   * ranges by identity). The page asks with `from` / `to` and never chooses the bucket. Call in
   * an injection context.
   */
  watchHistory(
    metric: WeatherMetric,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, WeatherHistory | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<WeatherHistory | null>('/weather/history', {
          metric,
          from: asked.from,
          to: asked.to,
        }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }
}

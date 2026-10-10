import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * `GET /home/water/status/temperature` (`water-service`): the last reading of the two sensors.
 * The service reads them every three minutes and answers with the stored row - and repeats that
 * row for as long as the sensor is silent, so the freshness of the call says nothing about the
 * reading: `measuredAt` does.
 */
export interface WaterTemperatures {
  /**
   * House wall-clock time the sensors were read, to the second. Missing from a `water-service`
   * below 0.6.0 - the age of the reading is then not known, and not made up.
   */
  readonly measuredAt?: string;
  /** The water in the tank. */
  readonly water?: { readonly temperature?: number };
  readonly circulation?: {
    readonly temperature?: number;
    /** Always false so far: the backend does not fill it in. Not shown anywhere. */
    readonly pumpActive?: boolean;
  };
}

/** `GET /home/water/status/active`: whether the water asks to be heated. */
export interface WaterHeatingDemand {
  readonly active?: boolean;
}

/**
 * Between which temperatures the water is kept: heating is asked for when the tank drops below
 * `low` and until it is above `high`. **A copy of two constants of `water-service`**
 * (`WaterService.updateWaterHeatingStatus`), which no endpoint exposes - change them there and
 * the gauge here draws the old band until this is changed too.
 */
export const HOT_WATER_BAND = { low: 38, high: 42 } as const;

/** One bucket of the history: the averages of the readings in it. */
export interface WaterHistoryPoint {
  /** House wall-clock time the bucket starts at, aligned to the clock of the house. */
  readonly at?: string;
  /** The water in the tank, in °C. */
  readonly water?: number;
  readonly circulation?: number;
}

/**
 * `GET /home/water/temperature/history?from=&to=` (`water-service` 0.6.0): both temperatures
 * over a range, averaged into buckets whose width the service chooses - 5 minutes up to 2 days,
 * 30 minutes up to 8, 2 hours up to 31. **A bucket without a reading has no point**: two points
 * further apart than `bucketSeconds` are a gap in the readings, and the line is broken there.
 * A reading is stored every 3 minutes, so one missed poll can leave a 5-minute bucket empty.
 */
export interface WaterHistory {
  readonly from?: string;
  readonly to?: string;
  readonly bucketSeconds?: number;
  readonly points?: readonly WaterHistoryPoint[];
}

/**
 * How old a reading may be before it is out of date: two missed cycles of the 3-minute poll of
 * `water-service`. A copy of that interval (`WaterSensorCron`), which no endpoint exposes.
 */
export const HOT_WATER_READING_OUT_OF_DATE_MS = 6 * 60_000;

const POLL_EVERY_MS = 30_000;
// a bucket is 5 minutes at its narrowest, and a new reading arrives every 3
const POLL_HISTORY_EVERY_MS = 3 * 60_000;

@Injectable({ providedIn: 'root' })
export class WaterApi {
  private readonly api = inject(ApiClient);

  /**
   * The temperatures; `null` while the service has no reading yet - it then answers 200 with an
   * empty body. Call in an injection context: the polling lives as long as the caller.
   */
  watchTemperatures(): PollingResource<WaterTemperatures | null> {
    return pollingResource(
      () => this.api.get<WaterTemperatures | null>('/water/status/temperature'),
      { intervalMs: POLL_EVERY_MS },
    );
  }

  /**
   * The history of both temperatures for the range `range()` gives - asked again whenever that
   * changes, the answer tagged with the range it is for. The page asks with `from` / `to` and
   * never chooses the bucket. Call in an injection context: the polling lives as long as the
   * caller.
   */
  watchHistory(range: () => HistoryRange): QueryResource<HistoryRange, WaterHistory | null> {
    return queryResource(
      range,
      (asked) => this.api.get<WaterHistory | null>('/water/temperature/history', { ...asked }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchHeatingDemand(): PollingResource<WaterHeatingDemand> {
    return pollingResource(() => this.api.get<WaterHeatingDemand>('/water/status/active'), {
      intervalMs: POLL_EVERY_MS,
    });
  }
}

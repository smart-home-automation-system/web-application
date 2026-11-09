import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * `GET /home/water/softener` (`water-service` >= 0.15.0, HAS-397): the water softener - a Viessmann AquaHome 20 Smart -
 * as the service last read it from the iQua cloud, every five minutes. **A value the cloud left out is left out** -
 * never a default: a missing flag is not known, never off. `503 SOFTENER_UNAVAILABLE` before the first read.
 */
export interface Softener {
  /** The last reads of the cloud brought a reading; `false` after two missed in a row, left out before the first. */
  readonly reachable?: boolean;
  /** The softener is connected to the cloud, as the cloud says. */
  readonly online?: boolean;
  /** House wall-clock time of the read, to the second; moved by every frame of the live stream (HAS-401). */
  readonly measuredAt?: string;
  /** The service says the reading is older than two of its reads. */
  readonly stale?: boolean;
  readonly water?: {
    /** Litres. */
    readonly usedTodayLitres?: number;
    readonly averageDailyLitres?: number;
    /** The treated water left before the next regeneration, litres. */
    readonly treatedAvailableLitres?: number;
    readonly totalLitres?: number;
    /** l/min - frozen between live streams: the cloud refreshes it only while one is open (HAS-401). */
    readonly flowLitresPerMinute?: number;
  };
  readonly salt?: {
    /** The per cent the iQua application shows - counted down by the softener, not measured. */
    readonly levelPercent?: number;
    readonly daysLeft?: number;
    /** `YYYY-MM-DD`, the day the salt is estimated to run out. */
    readonly outOfSaltDate?: string;
  };
  readonly regeneration?: {
    readonly daysSinceLast?: number;
    /** `YYYY-MM-DD`. */
    readonly lastAt?: string;
    /** Regenerations since the softener was installed. */
    readonly total?: number;
    /** The words of the cloud for now: `none`, `scheduled`, ... (`water-service` >= 0.18.0, HAS-400). */
    readonly status?: string;
  };
  /** The hardness set on the softener in grains per gallon, and the same in mg/l of CaCO3 (x 17.12). */
  readonly hardnessGpg?: number;
  readonly hardnessMgCaco3?: number;
  readonly daysInOperation?: number;
  readonly signalDbm?: number;
  /** The flags of the softener; `leak` is its own watch of a continuous flow. */
  readonly alerts?: {
    readonly lowSalt?: boolean;
    readonly leak?: boolean;
    readonly excessiveWaterUse?: boolean;
    readonly shutoffValve?: boolean;
    readonly resin?: boolean;
    readonly error?: boolean;
  };
  /** The live stream is open (`water-service` >= 0.19.0, HAS-401) - until `liveUntil`, house wall-clock time. */
  readonly live?: boolean;
  readonly liveUntil?: string;
}

/** One bucket of a history of the softener: the average, the lowest and the highest of the stored readings in it. */
export interface SoftenerHistoryPoint {
  readonly at?: string;
  readonly avg?: number;
  readonly min?: number;
  readonly max?: number;
}

/**
 * `GET /home/water/softener/history?metric=&from=&to=` (`water-service` >= 0.16.0, HAS-398): one metric over a range of
 * at most 366 days - 5 min buckets up to 2 days, 30 min up to 8, 2 h up to 31, a day beyond. A reading is stored on a
 * change only, so **a bucket without a change has no point**; the salt changes a few times a week.
 */
export interface SoftenerHistory {
  readonly metric?: string;
  readonly from?: string;
  readonly to?: string;
  readonly bucketSeconds?: number;
  readonly points?: readonly SoftenerHistoryPoint[];
}

/** `GET /home/water/softener/days` (HAS-398): the litres through the softener on a day of the house; a day not read has no entry. */
export interface SoftenerDay {
  /** `YYYY-MM-DD`. */
  readonly day?: string;
  readonly litres?: number;
}

/** `GET /home/water/softener/regenerations` (HAS-398), newest first; `endedAt` left out while one goes on. */
export interface SoftenerRegeneration {
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** The start on the clock of the softener, which runs minutes off the house. */
  readonly deviceStartedAt?: string;
  readonly running?: boolean;
}

/** `GET /home/water/softener/alerts` (HAS-399): an alert the iQua cloud keeps, newest first. */
export interface SoftenerAlert {
  readonly id?: string;
  /** `low_salt`, `flow_monitor_alert`, `excessive_water_use_alert`, `connection_status_offline`, ... */
  readonly type?: string;
  readonly title?: string;
  readonly message?: string;
  /** As the cloud words it: `info`, `warning`, `critical`. */
  readonly level?: string;
  /** House wall-clock time. */
  readonly at?: string;
  readonly read?: boolean;
}

/** `PUT /home/water/softener/live` (HAS-401): the stream is open until `liveUntil`. */
export interface SoftenerLive {
  readonly live?: boolean;
  readonly liveUntil?: string;
}

/**
 * How old a reading of the softener may be before it is out of date: two reads of the five minutes of `water-service`
 * missed - **a copy of that interval** (`water.softener.cloud.interval`), which no endpoint exposes.
 */
export const SOFTENER_OUT_OF_DATE_MS = 10 * 60_000;

/**
 * How often the page holds the live stream open while its switch is on: the service holds it 5 minutes after every
 * `PUT` (`water.softener.live-for`) - **a copy**, renewed a minute before it ends.
 */
export const SOFTENER_LIVE_RENEW_MS = 4 * 60_000;

// the service reads the cloud every five minutes; while the live stream is open the card reads it faster by itself
const POLL_SOFTENER_EVERY_MS = 30_000;
// the salt changes a few times a week, a regeneration every few days
const POLL_SOFTENER_HISTORY_EVERY_MS = 10 * 60_000;
// the service keeps the alerts of the cloud for one read of five minutes
const POLL_SOFTENER_ALERTS_EVERY_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class SoftenerApi {
  private readonly api = inject(ApiClient);

  /** The softener now. Call in an injection context: the polling lives as long as the caller. */
  watchSoftener(): PollingResource<Softener> {
    return pollingResource(() => this.api.get<Softener>('/water/softener'), {
      intervalMs: POLL_SOFTENER_EVERY_MS,
    });
  }

  /** The salt level (%) over the range `range()` gives, tagged with the range it is for. */
  watchSaltHistory(range: () => HistoryRange): QueryResource<HistoryRange, SoftenerHistory | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<SoftenerHistory | null>('/water/softener/history', {
          metric: 'saltLevel',
          from: asked.from,
          to: asked.to,
        }),
      { intervalMs: POLL_SOFTENER_HISTORY_EVERY_MS },
    );
  }

  /** The regenerations of the days of the range `range()` gives (`from` / `to` as days, both included), newest first. */
  watchRegenerations(
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly SoftenerRegeneration[] | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<readonly SoftenerRegeneration[] | null>('/water/softener/regenerations', daysOf(asked)),
      { intervalMs: POLL_SOFTENER_HISTORY_EVERY_MS },
    );
  }

  /** The litres through the softener per day of the range `range()` gives. */
  watchDays(range: () => HistoryRange): QueryResource<HistoryRange, readonly SoftenerDay[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly SoftenerDay[] | null>('/water/softener/days', daysOf(asked)),
      { intervalMs: POLL_SOFTENER_HISTORY_EVERY_MS },
    );
  }

  /** The alerts the iQua cloud keeps. Call in an injection context: the polling lives as long as the caller. */
  watchAlerts(): PollingResource<readonly SoftenerAlert[] | null> {
    return pollingResource(
      () => this.api.get<readonly SoftenerAlert[] | null>('/water/softener/alerts'),
      { intervalMs: POLL_SOFTENER_ALERTS_EVERY_MS },
    );
  }

  /**
   * A regeneration now or tonight at the time of the softener (`water-service` >= 0.18.0, HAS-400) - sent once, the
   * answer not used: the page reads the softener again. `409 REGENERATION_IN_PROGRESS`, `409 COMMAND_TOO_SOON` (one
   * command a minute), `502 SOFTENER_COMMAND_FAILED`.
   */
  regenerate(when: 'now' | 'tonight'): Observable<void> {
    return this.api
      .post<unknown>('/water/softener/regeneration', null, { when })
      .pipe(map(() => undefined));
  }

  /** The cancel of the regeneration scheduled for tonight. */
  cancelRegeneration(): Observable<void> {
    return this.api.delete<unknown>('/water/softener/regeneration').pipe(map(() => undefined));
  }

  /** Opens the live stream of the softener for 5 minutes, or extends the one open (HAS-401); `429 LIVE_THROTTLED`. */
  openLive(): Observable<SoftenerLive> {
    return this.api.put<SoftenerLive>('/water/softener/live', null);
  }

  closeLive(): Observable<void> {
    return this.api.delete<unknown>('/water/softener/live').pipe(map(() => undefined));
  }
}

/** The days of a range of the house: the day of `from` to the day before `to`, both included, as the service takes them. */
function daysOf(range: HistoryRange): { readonly from: string; readonly to: string } {
  const last = new Date(Date.parse(`${range.to.slice(0, 10)}T00:00:00Z`) - 24 * 60 * 60 * 1_000);
  return { from: range.from.slice(0, 10), to: last.toISOString().slice(0, 10) };
}

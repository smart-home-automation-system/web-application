import { Injectable, inject } from '@angular/core';
import { Observable, concat, map, toArray } from 'rxjs';

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
 * further apart than `bucketSeconds` are a silence; one longer than two buckets is a gap, bridged
 * faintly by the chart (HAS-375).
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

/**
 * `GET /home/water/valve` (`water-service` >= 0.7.0, HAS-316): the water valve of the garage - the water meter of the
 * house - as the service holds it in memory. **A value not reported within 5 minutes is left out**, never a default:
 * missing is never off, and with nothing fresh the answer is `{}`. The service reads the valve every minute and hears
 * its changes at once.
 */
export interface WaterValve {
  /** `open` or `closed`. */
  readonly state?: string;
  /** l/min (the device reports m³/min). */
  readonly flowRate?: number;
  /** bar, two decimals (the device reports kPa). */
  readonly pressure?: number;
  /** The water at the valve, °C. */
  readonly temperature?: number;
  /** The consumption counter of the valve: its total in m³ (three decimals) and when it was reported. */
  readonly counter?: { readonly total?: number; readonly measuredAt?: string };
  /** House wall-clock time of the newest report of what is shown, to the second. */
  readonly measuredAt?: string;
  /** Whether the last command was answered by the report of the valve (HAS-321); left out before one. */
  readonly lastCommandConfirmed?: boolean;
}

/**
 * A run of the circulation pump the service started (`water-service` >= 0.13.0, HAS-404). `endedAt` and `stoppedBy`
 * are left out while it goes on; a return temperature the Uni did not report is left out too.
 */
export interface CirculationRun {
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** `manual`, and with the automation (HAS-405) `motion`, `light`, `window`. */
  readonly trigger?: string;
  /** Who asked for a manual run - `dashboard`, a word of the caller. */
  readonly source?: string;
  /** `temperature` (the return reached its target), `limit`, `device` (switched off by something else), `failure`. */
  readonly stoppedBy?: string;
  readonly returnAtStart?: number;
  readonly returnAtEnd?: number;
}

/**
 * `GET /home/water/circulation` (`water-service` >= 0.13.0, HAS-404): relay 1 "CIRCULATION" of the Shelly Uni of the
 * hot water as the service last read it (every 15 s, every 5 s while a run goes on). **The read is left out whole once
 * it is older than a minute** - the pump, the temperatures and `measuredAt` together; `trigger` and `source` only for
 * a run the service started (the scene of the Shelly cloud switches the pump too, until HAS-405).
 */
export interface WaterCirculation {
  readonly running?: boolean;
  /** Since when the relay is on, house wall-clock time. */
  readonly since?: string;
  readonly trigger?: string;
  readonly source?: string;
  /** Sensor 1 of the Uni, on the circulation, °C. */
  readonly returnTemperature?: number;
  /** Sensor 0, the tank, °C. */
  readonly tankTemperature?: number;
  /** House wall-clock time of the read of the Uni. */
  readonly measuredAt?: string;
  /** The newest run the service started, the one going on included. */
  readonly lastRun?: CirculationRun;
}

/** The four ranges of the consumption, as `water-service` takes them. */
export type ConsumptionRange = 'day' | 'week' | 'month' | 'year';

export const CONSUMPTION_RANGES: readonly ConsumptionRange[] = ['day', 'week', 'month', 'year'];

/** The question of the consumption: a range and any day in it (`YYYY-MM-DD`, a day of the house). */
export interface ConsumptionQuery {
  readonly range: ConsumptionRange;
  readonly at: string;
}

/** One bucket: its start, house wall-clock time, and the water used in it, in m³. */
export interface ConsumptionBucket {
  readonly at?: string;
  readonly volume?: number;
}

/**
 * `GET /home/water/consumption?range=&at=` (`water-service` >= 0.8.0, HAS-317): the water used over a range - a
 * day in hours, a week (Monday to Sunday) and a month in days, a year in months. Volumes in m³, three decimals.
 * **A bucket the service did not watch has no point** (a bar is left out, never 0) - a bucket without water is 0;
 * `total` / `previousTotal` (the same range one period before) are left out when nothing was watched in it.
 */
export interface WaterConsumption {
  readonly range?: string;
  /** The range in house time, the start included and the end not. */
  readonly from?: string;
  readonly to?: string;
  readonly unit?: string;
  readonly total?: number;
  readonly previousTotal?: number;
  readonly buckets?: readonly ConsumptionBucket[];
}

/**
 * The water used in the running day, week, month and year of the house, in m³ - each the `total` of
 * `GET /water/consumption?range=` for today (HAS-322); a total the service leaves out (nothing watched) is left out.
 */
export interface ConsumptionTotals {
  readonly day?: number;
  readonly week?: number;
  readonly month?: number;
  readonly year?: number;
}

/**
 * A bill of the waterworks with what the house measured over its period (`water-service` >= 0.9.0, HAS-318).
 * Volumes in m³ (three decimals), the amount in PLN; `measuredVolume`, `difference` (measured less billed) and
 * `differencePercent` (of the billed volume) are left out when a day of the period has no readings - never 0.
 */
export interface WaterBill {
  readonly id?: number;
  /** The period billed, whole days of the house (`YYYY-MM-DD`), both included. */
  readonly periodFrom?: string;
  readonly periodTo?: string;
  readonly billedVolume?: number;
  /** The reading of the meter of the waterworks, m³. */
  readonly meterReading?: number;
  /** PLN. */
  readonly amount?: number;
  readonly note?: string;
  readonly measuredVolume?: number;
  readonly difference?: number;
  readonly differencePercent?: number;
}

/** A bill as the dashboard writes it - the whole bill, for a new one and a change alike (no partial update). */
export interface WaterBillBody {
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly billedVolume: number;
  readonly meterReading?: number;
  readonly amount?: number;
  readonly note?: string;
}

const POLL_EVERY_MS = 30_000;
// the bills change by hand, their measured volume once a day
const POLL_BILLS_EVERY_MS = 5 * 60_000;
// the totals of the running ranges, four calls at a time: a minute of water hardly moves a year
const POLL_TOTALS_EVERY_MS = 5 * 60_000;
// the valve is read by the service every minute and its changes heard at once
const POLL_VALVE_EVERY_MS = 15_000;
// a bucket is an hour at its narrowest
const POLL_CONSUMPTION_EVERY_MS = 60_000;
// a bucket is 5 minutes at its narrowest, and a new reading arrives every 3
const POLL_HISTORY_EVERY_MS = 3 * 60_000;
// the service reads the Uni every 15 s, every 5 s while a run goes on - and a run lasts 3 minutes at most
const POLL_CIRCULATION_EVERY_MS = 10_000;
// a run lasts minutes; the page reads them again after a start of its own
const POLL_CIRCULATION_RUNS_EVERY_MS = 60_000;

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

  /**
   * The water valve now (HAS-316). Call in an injection context: the polling lives as long as the caller.
   */
  watchValve(): PollingResource<WaterValve> {
    return pollingResource(() => this.api.get<WaterValve>('/water/valve'), {
      intervalMs: POLL_VALVE_EVERY_MS,
    });
  }

  /**
   * The consumption for the question `query()` gives (HAS-317) - asked again whenever that changes, the answer
   * tagged with the question it is for. Call in an injection context: the polling lives as long as the caller.
   */
  watchConsumption(
    query: () => ConsumptionQuery,
  ): QueryResource<ConsumptionQuery, WaterConsumption | null> {
    return queryResource(
      query,
      (asked) => this.api.get<WaterConsumption | null>('/water/consumption', { ...asked }),
      { intervalMs: POLL_CONSUMPTION_EVERY_MS },
    );
  }

  /**
   * The totals of today, this week, this month and this year (HAS-322) - four calls one after the other, never two
   * statements of the small pool of the service at once, read as one: a failure of any is the failure of the totals.
   * `at` is left out, so the service counts from its own today. Call in an injection context: the polling lives as
   * long as the caller.
   */
  watchConsumptionTotals(): PollingResource<ConsumptionTotals> {
    return pollingResource(
      () =>
        concat(
          ...CONSUMPTION_RANGES.map((range) =>
            this.api.get<WaterConsumption | null>('/water/consumption', { range }),
          ),
        ).pipe(
          toArray(),
          map(
            (answers) =>
              Object.fromEntries(
                CONSUMPTION_RANGES.map((range, index) => [range, answers[index]?.total]),
              ) as ConsumptionTotals,
          ),
        ),
      { intervalMs: POLL_TOTALS_EVERY_MS },
    );
  }

  /** The bills, newest first (HAS-318). Call in an injection context: the polling lives as long as the caller. */
  watchBills(): PollingResource<readonly WaterBill[] | null> {
    return pollingResource(() => this.api.get<readonly WaterBill[] | null>('/water/bills'), {
      intervalMs: POLL_BILLS_EVERY_MS,
    });
  }

  /** A new bill; the answer of the write is not used - the page reads the bills again. */
  createBill(body: WaterBillBody): Observable<void> {
    return this.api.post<unknown>('/water/bills', body).pipe(map(() => undefined));
  }

  /** The bill replaced whole. */
  replaceBill(id: number, body: WaterBillBody): Observable<void> {
    return this.api.put<unknown>(`/water/bills/${id}`, body).pipe(map(() => undefined));
  }

  deleteBill(id: number): Observable<void> {
    return this.api.delete<unknown>(`/water/bills/${id}`).pipe(map(() => undefined));
  }

  /**
   * Closes or opens the water valve (`water-service` >= 0.12.0, HAS-321) - the one command that cuts the water of
   * the whole house. Sent once; taken (202) is not done: the read of the valve says when it was confirmed.
   */
  commandValve(state: 'open' | 'close'): Observable<void> {
    return this.api
      .post<unknown>('/water/valve', null, { state, source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** The circulation pump now (HAS-404). Call in an injection context: the polling lives as long as the caller. */
  watchCirculation(): PollingResource<WaterCirculation> {
    return pollingResource(() => this.api.get<WaterCirculation>('/water/circulation'), {
      intervalMs: POLL_CIRCULATION_EVERY_MS,
    });
  }

  /**
   * The runs of the circulation pump started in the range `range()` gives, newest first (HAS-404) - asked again when
   * it changes, the answer tagged with the range it is for. Call in an injection context.
   */
  watchCirculationRuns(
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly CirculationRun[] | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<readonly CirculationRun[] | null>('/water/circulation/runs', { ...asked }),
      { intervalMs: POLL_CIRCULATION_RUNS_EVERY_MS },
    );
  }

  /**
   * Starts a run of the circulation pump (`water-service` >= 0.13.0, HAS-404): the service reads the tank first
   * (`409 TANK_COLD`), answers a run going on as it is, and stops the run by itself - at the return target or after
   * its limit. Sent once; the page reads the pump again.
   */
  startCirculation(): Observable<void> {
    return this.api
      .post<unknown>('/water/circulation', null, { source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchHeatingDemand(): PollingResource<WaterHeatingDemand> {
    return pollingResource(() => this.api.get<WaterHeatingDemand>('/water/status/active'), {
      intervalMs: POLL_EVERY_MS,
    });
  }
}

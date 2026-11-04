import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * The answers of `energy-service` (HAS-324): the grid meter, the SOLAX with its battery, the SOFAR
 * and the balance of the house. **What a service does not know it leaves out, never 0** - every
 * field is optional here and shown as "not known" when it is missing. The powers follow the sign
 * convention of the house: the grid is positive while the house takes from it, the battery while
 * it charges; the PV powers are never negative. Every time is a wall-clock time of the house.
 */

/** One source of `GET /energy/status`: `reachable` is `null` while the service knows nothing of it. */
export interface EnergySource {
  /** `meter`, `solax`, `sofar`, `solaxCloud` - printed as it came when this version does not know it. */
  readonly source?: string;
  readonly reachable?: boolean | null;
  readonly lastReadingAt?: string;
}

/** `GET /energy/status` (energy-service >= 0.4.0): the sources and the grid as the SOLAX sees it. */
export interface EnergyStatus {
  readonly sources?: readonly EnergySource[];
  /** `state` `present` or `lost`, `null` while not known (after a start, before two reads agree). */
  readonly grid?: { readonly state?: string | null; readonly since?: string };
}

/** One phase of the grid meter or of an inverter: V, A, W (signed), VA, the power factor, Hz. */
export interface EnergyPhase {
  readonly voltage?: number;
  readonly current?: number;
  readonly activePower?: number;
  readonly apparentPower?: number;
  readonly powerFactor?: number;
  readonly frequency?: number;
}

/** `GET /energy/grid` (HAS-327): the Pro 3EM at the entry of the grid. */
export interface GridReading {
  /** `a`, `b`, `c`. */
  readonly phases?: Readonly<Record<string, EnergyPhase>>;
  readonly totalActivePower?: number;
  /** kWh since the meter was set up. */
  readonly importEnergy?: number;
  readonly exportEnergy?: number;
  /** `import`, `export` or `idle` (within 20 W of nothing). */
  readonly direction?: string;
  readonly measuredAt?: string;
  readonly stale?: boolean;
}

/** One string of panels: V, A, W. */
export interface PvString {
  readonly voltage?: number;
  readonly current?: number;
  readonly power?: number;
}

/** One inverter of `GET /energy/inverters` (HAS-328, HAS-330). */
export interface Inverter {
  /** `solax` or `sofar`. */
  readonly id?: string;
  readonly registryId?: number;
  /** The name of the registry, printed as it is. */
  readonly name?: string;
  readonly room?: string;
  /** The SOLAX only: `normal`, `eps`, `fault`... (`RunMode`). */
  readonly runMode?: string;
  /** The SOFAR only: its state in the words of the Solarman cloud ("Grid connected"), printed as it is. */
  readonly state?: string;
  /** The SOFAR only: its faults in the words of the cloud; empty when it has none. */
  readonly faults?: readonly string[];
  readonly acPower?: number;
  readonly phases?: Readonly<Record<string, EnergyPhase>>;
  readonly pvPower?: number;
  /** `pv1`, `pv2`. */
  readonly pv?: Readonly<Record<string, PvString>>;
  /** What the meter of the inverter measures at the grid, positive while the house takes. */
  readonly gridPower?: number;
  readonly frequency?: number;
  readonly powerFactor?: number;
  readonly temperature?: number;
  /** kWh today and since it was set up. */
  readonly dailyYield?: number;
  readonly totalYield?: number;
  readonly measuredAt?: string;
  readonly stale?: boolean;
  /** `local`, `cloud` (the SolaX cloud while the dongle is unreachable) or `solarman-cloud`. */
  readonly source?: string;
}

/** `GET /energy/battery` (HAS-328): the battery of the SOLAX. */
export interface Battery {
  /** % */
  readonly soc?: number;
  /** % */
  readonly health?: number;
  /** W, positive while charging. */
  readonly power?: number;
  /** `charging`, `discharging` or `idle` (within 20 W of nothing). */
  readonly direction?: string;
  readonly voltage?: number;
  readonly current?: number;
  readonly temperature?: number;
  readonly cycles?: number;
  readonly remainingKwh?: number;
  readonly chargedToday?: number;
  readonly dischargedToday?: number;
  readonly measuredAt?: string;
  readonly stale?: boolean;
  readonly source?: string;
}

/** The day so far in `GET /energy/flows`, kWh; the two shares 0..1. */
export interface EnergyToday {
  readonly production?: number;
  readonly imported?: number;
  readonly exported?: number;
  readonly charged?: number;
  readonly discharged?: number;
  readonly houseLoad?: number;
  readonly selfConsumption?: number;
  readonly gridShare?: number;
}

/**
 * `GET /energy/flows` (HAS-331): where the energy of the house goes now. A value derived from an
 * input that is not known is left out - `houseLoad` without a fresh grid meter, say.
 */
export interface EnergyFlows {
  readonly production?: number;
  readonly solaxPv?: number;
  readonly sofarPv?: number;
  readonly gridPower?: number;
  readonly batteryPower?: number;
  readonly houseLoad?: number;
  readonly today?: EnergyToday;
  /** `grid`, `solax`, `sofar`, `battery`: the time of each input and whether it is stale. */
  readonly inputs?: Readonly<
    Record<string, { readonly measuredAt?: string; readonly stale?: boolean }>
  >;
}

/**
 * The metrics of `GET /energy/history` (`Metric.apiName` of energy-service): W, the SOC in %. A sum
 * (`pv-power`, `house-load`) has the average of a bucket only.
 */
export type EnergyMetric =
  | 'grid-power'
  | 'pv-solax'
  | 'pv-sofar'
  | 'pv-power'
  | 'house-load'
  | 'battery-power'
  | 'battery-soc';

/** `GET /energy/history?metric=&from=&to=`: the rules of the weather history. */
export interface EnergyHistory {
  readonly metric?: string;
  readonly from?: string;
  readonly to?: string;
  readonly bucketSeconds?: number;
  readonly points?: readonly {
    readonly at?: string;
    readonly avg?: number;
    readonly min?: number;
    readonly max?: number;
  }[];
}

/**
 * A closed day of `GET /energy/days` (HAS-331), kWh - a day of the grid meter alone has no
 * production, one before the service has none of it at all.
 */
export interface EnergyDay {
  /** `YYYY-MM-DD`. */
  readonly day?: string;
  readonly solaxYield?: number;
  readonly sofarYield?: number;
  readonly production?: number;
  readonly imported?: number;
  readonly exported?: number;
  readonly charged?: number;
  readonly discharged?: number;
  readonly houseLoad?: number;
  readonly selfConsumption?: number;
  readonly gridShare?: number;
}

/** A month of the billing year, kWh; a month without a closed day has `days` 0 and no energies. */
export interface EnergyMonth {
  /** `YYYY-MM`. */
  readonly month?: string;
  readonly days?: number;
  readonly production?: number;
  readonly imported?: number;
  readonly exported?: number;
  readonly houseLoad?: number;
  /** exported x ratio. */
  readonly credited?: number;
  /** The credit the imports of the month used, oldest first. */
  readonly drawn?: number;
  /** The imports the credit did not cover. */
  readonly bought?: number;
  /** The credit of a month twelve months back that lapsed. */
  readonly expired?: number;
  /** The credit left at the end of the month - what may still be drawn back. */
  readonly stored?: number;
}

/**
 * `GET /energy/months?year=` (HAS-331): the billing year from `from` to `to` with the net-metering in
 * kWh - the house settles by "opusty", so no money is shown anywhere. The house's estimate by whole
 * months, not the invoice.
 */
export interface EnergyMonths {
  readonly year?: number;
  readonly from?: string;
  readonly to?: string;
  /** The share of an exported kWh credited. */
  readonly ratio?: number;
  readonly months?: readonly EnergyMonth[];
}

/** One outage of the grid of `GET /energy/outages` (HAS-334); one that lasts has no end. */
export interface GridOutage {
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly socAtStart?: number;
  readonly socAtEnd?: number;
  readonly lowestSoc?: number;
}

/**
 * One open alarm of `GET /energy/alerts` (energy-service >= 0.10.0, HAS-341): an episode the
 * household was told of and that has not ended. `kind` `silent` (a source not heard), `overload` (a
 * phase above its warning current), `alarm` (an alarm of the SOLAX from its cloud, a fault of the
 * SOFAR), `production` (an inverter producing nothing in the sun); `detail` - the name of the alarm
 * as the inverter words it, printed as it is.
 */
export interface EnergyAlert {
  readonly source?: string;
  readonly kind?: string;
  readonly openedAt?: string;
  readonly detail?: string;
}

/**
 * One charge of the battery from the grid (energy-service >= 0.12.1, HAS-336): `state` `requested`
 * (the command sent, the inverter not yet charging), `charging`, `ending` (over, the Self Use of the
 * owner not set back yet), `ended` or `failed`; `source` `dashboard` or `automation`; `endedBy`
 * `target`, `window`, `cancel` or `failed`; `failure` the code of a failed run. A value this
 * version does not know is printed as it came.
 */
export interface ChargeRun {
  readonly id?: number;
  readonly state?: string;
  readonly source?: string;
  readonly requestedAt?: string;
  readonly targetSoc?: number;
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly deliveryStatus?: number;
  readonly deliveredAt?: string;
  readonly socAtStart?: number;
  readonly socAtEnd?: number;
  readonly endedAt?: string;
  readonly endedBy?: string;
  readonly failure?: string;
  readonly restoredAt?: string;
  /** The planned outage an automatic charge was started for (HAS-338). */
  readonly plannedOutageId?: number;
}

/**
 * `GET /energy/battery/charge` (HAS-336, HAS-338): whether a charge runs or is being set back, that
 * charge, the battery now (`soc` %, `power` W positive while charging), the minutes to its target,
 * and `plannedStart` - when the automation would start the charge before the next planned outage of
 * the street at the SOC now, whether its switch is on or not.
 */
export interface ChargeState {
  readonly active?: boolean;
  readonly run?: ChargeRun;
  readonly soc?: number;
  readonly power?: number;
  readonly minutesLeft?: number;
  readonly plannedStart?: string;
}

/** The body of a charge: the SOC to charge to (10 - 100) and, when given, the house time it ends at. */
export interface ChargeRequest {
  readonly targetSoc: number;
  readonly until?: string;
}

/**
 * `GET /energy/automation` (HAS-338): the switch of the automatic charge before a planned outage of
 * the street (off until the owner turns it on), its target SOC, the power the start is computed with
 * (kW) and the margin before the outage (min). Written whole by `PUT`.
 */
export interface Automation {
  readonly chargeBeforeOutage?: boolean;
  readonly targetSoc?: number;
  readonly chargePowerKw?: number;
  readonly marginMinutes?: number;
  readonly updatedAt?: string;
}

/** The body of `PUT /energy/automation`: every field. */
export interface AutomationBody {
  readonly chargeBeforeOutage: boolean;
  readonly targetSoc: number;
  readonly chargePowerKw: number;
  readonly marginMinutes: number;
}

/**
 * One outage Tauron announces for the house (`GET /energy/outages/planned`, HAS-337, HAS-338):
 * `kind` `planned` or `unplanned` (a failure), `scope` `street` (the street of the house named) or
 * `town` (the town alone), `description` the words of Tauron (Polish, printed as they are),
 * `plannedChargeStart` on the next planned outage of the street only.
 */
export interface PlannedOutage {
  readonly id?: number;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly kind?: string;
  readonly scope?: string;
  readonly description?: string;
  readonly firstSeenAt?: string;
  readonly notifiedAt?: string;
  readonly skipAutomation?: boolean;
  readonly plannedChargeStart?: string;
}

/** Which closed days are asked for: both ends included, `YYYY-MM-DD`. */
export interface DaysQuery {
  readonly from: string;
  readonly to: string;
}

/** The performance ratio of one inverter: `calibratedOnDays` 0 while the initial one is used. */
export interface ForecastRatio {
  readonly ratio?: number;
  readonly calibratedOnDays?: number;
}

/** A day of the forecast: kWh, the coverage of the house load (1 = all of it), its category. */
export interface ForecastDay {
  readonly day?: string;
  readonly solaxKwh?: number;
  readonly sofarKwh?: number;
  readonly totalKwh?: number;
  readonly coverage?: number;
  /** `none`, `poor`, `fair`, `good` - printed as it came when this version does not know it. */
  readonly category?: string;
  /** The mean cloud cover while the sun is up, %. */
  readonly cloudCover?: number;
  /** The hours above 120 W/m2 on the ground. */
  readonly sunshineHours?: number;
}

/** What the forecast gave for a closed day (at the ratio in use now) and what was produced. */
export interface ForecastCompared {
  readonly forecastKwh?: number;
  readonly actualKwh?: number;
}

export interface ForecastPast {
  readonly day?: string;
  readonly solax?: ForecastCompared;
  readonly sofar?: ForecastCompared;
}

/** An hour of the forecast: the mean power expected in it, kW, from its start. */
export interface ForecastHour {
  readonly hour?: string;
  readonly solaxKw?: number;
  readonly sofarKw?: number;
  readonly cloudCover?: number;
}

/**
 * `GET /energy/forecast` (energy-service >= 0.16.0, HAS-372): the solar of the coming days, judged
 * by the service against the house load of the last closed days - **the bands are the service's,
 * never copied here**. `stale` is always written; everything else is left out when not known.
 */
export interface EnergyForecast {
  readonly fetchedAt?: string;
  readonly stale?: boolean;
  readonly houseLoadKwh?: number;
  readonly houseLoadDays?: number;
  readonly performanceRatio?: { readonly solax?: ForecastRatio; readonly sofar?: ForecastRatio };
  /** Seven days from today. */
  readonly days?: readonly ForecastDay[];
  /** The last two calibrated days, oldest first. */
  readonly past?: readonly ForecastPast[];
  /** The next 48 hours from the hour now. */
  readonly hourly?: readonly ForecastHour[];
  readonly outlook?: { readonly sunBackOn?: string; readonly daysWithoutSun?: number };
}

// the SOLAX is read every 15 s, the grid meter on every change: the flow of the house moves fast
const POLL_LIVE_EVERY_MS = 15_000;
const POLL_STATUS_EVERY_MS = 30_000;
// an alarm opens after minutes of a state; an outage after two reads
const POLL_ALERTS_EVERY_MS = 60_000;
// a reading is stored a minute after a change, a bucket is 5 minutes at its narrowest
const POLL_HISTORY_EVERY_MS = 3 * 60_000;
// a charge moves with the battery, read every 15 s by the service; the watch follows its command every 10 s
const POLL_CHARGE_EVERY_MS = 10_000;
// the settings change by a write of the page itself; the outages of Tauron are read every hour
const POLL_SETTINGS_EVERY_MS = 60_000;
// a day is closed once, after 00:15
const POLL_DAYS_EVERY_MS = 15 * 60_000;
// the forecast is fetched every hour and calibrated every hour; five minutes keeps the hour of the 48 current
const POLL_FORECAST_EVERY_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class EnergyApi {
  private readonly api = inject(ApiClient);

  /** The sources and the grid. Call in an injection context: the polling lives as long as the caller. */
  watchStatus(intervalMs = POLL_STATUS_EVERY_MS): PollingResource<EnergyStatus | null> {
    return pollingResource(() => this.api.get<EnergyStatus | null>('/energy/status'), {
      intervalMs,
    });
  }

  /**
   * The balance of the house now and the day so far - every 15 s, or as often as a caller that only
   * glances at it asks (the overview). Call in an injection context.
   */
  watchFlows(intervalMs = POLL_LIVE_EVERY_MS): PollingResource<EnergyFlows | null> {
    return pollingResource(() => this.api.get<EnergyFlows | null>('/energy/flows'), {
      intervalMs,
    });
  }

  /** The grid meter now. Call in an injection context. */
  watchGrid(): PollingResource<GridReading | null> {
    return pollingResource(() => this.api.get<GridReading | null>('/energy/grid'), {
      intervalMs: POLL_LIVE_EVERY_MS,
    });
  }

  /** Both inverters now. Call in an injection context. */
  watchInverters(): PollingResource<readonly Inverter[] | null> {
    return pollingResource(() => this.api.get<readonly Inverter[] | null>('/energy/inverters'), {
      intervalMs: POLL_LIVE_EVERY_MS,
    });
  }

  /** The battery of the SOLAX now. Call in an injection context. */
  watchBattery(intervalMs = POLL_LIVE_EVERY_MS): PollingResource<Battery | null> {
    return pollingResource(() => this.api.get<Battery | null>('/energy/battery'), {
      intervalMs,
    });
  }

  /** The production forecast of the coming days (HAS-372). Call in an injection context. */
  watchForecast(): PollingResource<EnergyForecast | null> {
    return pollingResource(() => this.api.get<EnergyForecast | null>('/energy/forecast'), {
      intervalMs: POLL_FORECAST_EVERY_MS,
    });
  }

  /** The open alarms. Call in an injection context. */
  watchAlerts(): PollingResource<readonly EnergyAlert[] | null> {
    return pollingResource(() => this.api.get<readonly EnergyAlert[] | null>('/energy/alerts'), {
      intervalMs: POLL_ALERTS_EVERY_MS,
    });
  }

  /**
   * The history of one metric for the range `range()` gives, tagged with that range (the rules of
   * the weather history). Call in an injection context.
   */
  watchHistory(
    metric: EnergyMetric,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, EnergyHistory | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<EnergyHistory | null>('/energy/history', {
          metric,
          from: asked.from,
          to: asked.to,
        }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /** The closed days of a range (at most 366), tagged with it. Call in an injection context. */
  watchDays(query: () => DaysQuery): QueryResource<DaysQuery, readonly EnergyDay[] | null> {
    return queryResource(
      query,
      (asked) => this.api.get<readonly EnergyDay[] | null>('/energy/days', { ...asked }),
      { intervalMs: POLL_DAYS_EVERY_MS },
    );
  }

  /** The billing year starting in `year`, tagged with it. Call in an injection context. */
  watchMonths(year: () => number): QueryResource<number, EnergyMonths | null> {
    return queryResource(
      year,
      (asked) => this.api.get<EnergyMonths | null>('/energy/months', { year: String(asked) }),
      { intervalMs: POLL_DAYS_EVERY_MS },
    );
  }

  /** The charge going on or being set back, with the battery now (HAS-336). Call in an injection context. */
  watchCharge(): PollingResource<ChargeState | null> {
    return pollingResource(() => this.api.get<ChargeState | null>('/energy/battery/charge'), {
      intervalMs: POLL_CHARGE_EVERY_MS,
    });
  }

  /** The charges requested in a range (house times, at most 366 days). Call in an injection context. */
  watchChargeRuns(
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly ChargeRun[] | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<readonly ChargeRun[] | null>('/energy/battery/charge/runs', { ...asked }),
      { intervalMs: POLL_SETTINGS_EVERY_MS },
    );
  }

  /** The settings of the automatic charge (HAS-338). Call in an injection context. */
  watchAutomation(): PollingResource<Automation | null> {
    return pollingResource(() => this.api.get<Automation | null>('/energy/automation'), {
      intervalMs: POLL_SETTINGS_EVERY_MS,
    });
  }

  /** The outages Tauron announces for the house that have not ended (HAS-337). Call in an injection context. */
  watchPlannedOutages(): PollingResource<readonly PlannedOutage[] | null> {
    return pollingResource(
      () => this.api.get<readonly PlannedOutage[] | null>('/energy/outages/planned'),
      { intervalMs: POLL_SETTINGS_EVERY_MS },
    );
  }

  /**
   * A charge of the battery from the grid, by the dashboard - **a write to the inverter**. The answer
   * (the run as requested) is not used: the page reads the charge again.
   */
  startCharge(request: ChargeRequest): Observable<void> {
    return this.api
      .post<unknown>('/energy/battery/charge', request, { source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** The charge going on ended and the Self Use of the owner set back - a write to the inverter. */
  cancelCharge(): Observable<void> {
    return this.api.delete<unknown>('/energy/battery/charge').pipe(map(() => undefined));
  }

  /** The settings of the automatic charge, written whole; the page reads them again. */
  saveAutomation(body: AutomationBody): Observable<void> {
    return this.api.put<unknown>('/energy/automation', body).pipe(map(() => undefined));
  }

  /** No automatic charge for this planned outage, or allowed again. */
  skipOutage(id: number, skip: boolean): Observable<void> {
    return this.api
      .put<unknown>(`/energy/outages/planned/${id}/${skip ? 'skip' : 'unskip'}`, undefined)
      .pipe(map(() => undefined));
  }

  /** The outages that started in a range (house times, at most 366 days). Call in an injection context. */
  watchOutages(
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly GridOutage[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly GridOutage[] | null>('/energy/outages', { ...asked }),
      { intervalMs: POLL_ALERTS_EVERY_MS },
    );
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/** The modes of a unit, the words of `aircon-service`. */
export const AIRCON_MODES = ['auto', 'cool', 'dry', 'fan', 'heat'] as const;
export type AirconMode = (typeof AIRCON_MODES)[number];

/** The fan speeds of a unit, the words of `aircon-service`. */
export const AIRCON_FAN_SPEEDS = [
  'auto',
  'low',
  'medium-low',
  'medium',
  'medium-high',
  'high',
] as const;
export type AirconFanSpeed = (typeof AIRCON_FAN_SPEEDS)[number];

/**
 * The window of the room of a unit, as `heating-service` last gave it to `aircon-service`
 * (HAS-384); `restoreUntil` while the open window holds the unit stopped - until when it is set back
 * when the window closes.
 */
export interface AirconWindow {
  /** `open`, `closed`, `no sensor`, `unknown` - or a word this version does not know. */
  readonly state?: string;
  readonly openSince?: string;
  readonly hold?: boolean;
  readonly restoreUntil?: string;
}

/** The filter of a unit (HAS-391): the hours of work since its cleaning, and whether it is due. */
export interface AirconFilter {
  readonly hoursSince?: number;
  readonly cleanedAt?: string;
  readonly due?: boolean;
}

/**
 * One air conditioner of `GET /home/aircon` (`aircon-service` 0.2.0 on, HAS-381) - the unit of the
 * registry and its state as last read every 30 s. **A field not known is left out**: a unit not read
 * yet is its id, name and room alone, `reachable` is left out after a start; a unit that stopped
 * answering keeps what it reported, with `reachable: false`. A mode or a fan speed this version does
 * not know arrives as its word.
 */
export interface AirconUnit {
  readonly id?: number;
  readonly name?: string;
  readonly room?: string;
  readonly power?: boolean;
  readonly mode?: string;
  /** Whole degrees C. */
  readonly targetTemperature?: number;
  /** The sensor of the unit itself, whole degrees C - it reads a few degrees low (owner). */
  readonly roomTemperature?: number;
  readonly fanSpeed?: string;
  readonly swingVertical?: number;
  readonly swingHorizontal?: number;
  readonly quiet?: boolean;
  readonly turbo?: boolean;
  readonly sleep?: boolean;
  readonly display?: boolean;
  readonly reachable?: boolean;
  readonly unreachableSince?: string;
  /** House wall-clock time of the last read that answered. */
  readonly updatedAt?: string;
  /** Whether the read after the last command showed it; left out while confirming, and before any. */
  readonly lastCommandConfirmed?: boolean;
  /** When the guard last raised a cooling target below 22 °C back to 22 °C (HAS-382). */
  readonly minimumRestoredAt?: string;
  readonly window?: AirconWindow;
  /** Whether the plug of the unit draws above the standby (HAS-390); the indoor plug feeds four units. */
  readonly compressorRunning?: boolean;
  readonly filter?: AirconFilter;
}

/** The empty house and the grid as the last pass of the automation read them (HAS-385). */
export interface AirconAutomation {
  readonly emptyHouse?: {
    readonly empty?: boolean;
    readonly since?: string;
    /** When the units were switched off for this empty house. */
    readonly actedAt?: string;
  };
  readonly grid?: {
    /** `present`, `lost`. */
    readonly state?: string;
    readonly actedAt?: string;
  };
}

/** The rule of a unit (HAS-386), as stored: keep the room below a threshold, and the frost protection (HAS-387). */
export interface AirconRule {
  readonly unitId?: number;
  readonly keepBelow?: {
    readonly enabled?: boolean;
    /** °C by 0.5. */
    readonly threshold?: number;
    readonly hysteresis?: number;
    /** Whole °C, the target of the cooling. */
    readonly target?: number;
  };
  readonly heatBySchedule?: { readonly enabled?: boolean };
  readonly updatedAt?: string;
}

/** A rule as written whole (`PUT /home/aircon/{id}/rules`). */
export interface AirconRuleBody {
  readonly keepBelow: {
    readonly enabled: boolean;
    readonly threshold: number;
    readonly hysteresis: number;
    readonly target: number;
  };
  readonly heatBySchedule: { readonly enabled: boolean };
}

/** One plug that feeds the units (HAS-390): what it draws now and the energy; a field not known is left out. */
export interface AirconPlug {
  /** `indoor`, `sanctum`. */
  readonly plug?: string;
  readonly rooms?: readonly string[];
  /** Whether the plug has a relay - only the indoor one is power cycled. */
  readonly relay?: boolean;
  readonly power?: number;
  readonly voltage?: number;
  readonly current?: number;
  readonly output?: boolean;
  readonly compressorRunning?: boolean;
  readonly reachable?: boolean;
  readonly updatedAt?: string;
  readonly todayKwh?: number;
  readonly last7DaysKwh?: number;
  readonly last30DaysKwh?: number;
}

/** One bucket of the power of a plug (`GET /home/aircon/power/samples`): W. */
export interface AirconPowerBucket {
  readonly at?: string;
  readonly avg?: number;
  readonly min?: number;
  readonly max?: number;
}

/** A power cycle as stored (HAS-390). */
export interface PowerCycleRun {
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly requestedBy?: string;
  /** `running`, `done`, `failed`. */
  readonly result?: string;
}

/** Whether the indoor plug may be power cycled now, why not, and the last cycle. */
export interface PowerCycleState {
  readonly allowed?: boolean;
  readonly reason?: string;
  readonly lastRun?: PowerCycleRun;
}

/** One change of a unit (`GET /home/aircon/{id}/runs`, HAS-391) with who made it. */
export interface AirconRun {
  readonly at?: string;
  readonly power?: boolean;
  readonly mode?: string;
  readonly targetTemperature?: number;
  readonly fanSpeed?: string;
  /** `first-read`, `remote`, `dashboard`, `rule`, `window`, `empty-house`, `grid-outage`, `minimum-restored`. */
  readonly source?: string;
}

/**
 * A command to a unit (`POST /home/aircon/{id}`, HAS-382): only the fields given are set, the rest
 * stays as the unit has it.
 */
export interface AirconCommand {
  readonly power?: boolean;
  readonly mode?: AirconMode;
  readonly targetTemperature?: number;
  readonly fanSpeed?: AirconFanSpeed;
  readonly quiet?: boolean;
  readonly turbo?: boolean;
  readonly sleep?: boolean;
}

/** The units of a room: as often as the lights of My room - the unit itself is read every 30 s. */
const POLL_ROOM_EVERY_MS = 10_000;
/** The units of the house and the automation, for the tile of the overview. */
const POLL_HOUSE_EVERY_MS = 60_000;
/** The plugs and the power cycle: read every 30 s by the service. */
const POLL_POWER_EVERY_MS = 30_000;

/**
 * The air conditioners of `aircon-service` (epic HAS-376) - five Gree units over their local
 * protocol. The units of a room for My room (HAS-394) and every unit with the automation for the
 * overview; the command of one unit with `source=dashboard`.
 */
@Injectable({ providedIn: 'root' })
export class AirconApi {
  private readonly api = inject(ApiClient);

  /**
   * The units of one room by the name of the registry. A room without a unit - or a name that is
   * no room - answers 404 with `NOT_FOUND_ROOM`: no card. The name is read when a call is made.
   * Call in an injection context.
   */
  watchRoom(room: () => string): PollingResource<readonly AirconUnit[] | null> {
    return pollingResource(
      () =>
        this.api.get<readonly AirconUnit[] | null>(`/aircon/rooms/${encodeURIComponent(room())}`),
      { intervalMs: POLL_ROOM_EVERY_MS },
    );
  }

  /** Every unit of the registry - once a minute, or as often as a page that commands them asks. Call in an injection context. */
  watchUnits(
    intervalMs: number = POLL_HOUSE_EVERY_MS,
  ): PollingResource<readonly AirconUnit[] | null> {
    return pollingResource(() => this.api.get<readonly AirconUnit[] | null>('/aircon'), {
      intervalMs,
    });
  }

  /** The empty house and the grid as the automation acts on them. Call in an injection context. */
  watchAutomation(): PollingResource<AirconAutomation | null> {
    return pollingResource(() => this.api.get<AirconAutomation | null>('/aircon/automation'), {
      intervalMs: POLL_HOUSE_EVERY_MS,
    });
  }

  /**
   * A command to one unit, as a change by hand (`source=dashboard`): 202 once the unit took it -
   * nothing more; the unit is read back.
   */
  command(id: number, command: AirconCommand): Observable<void> {
    return this.api
      .post<unknown>(`/aircon/${id}`, command, { source: 'dashboard' })
      .pipe(map(() => undefined));
  }
  /** The rule of every unit that has one (HAS-386, the page of the units). Call in an injection context. */
  watchRules(): PollingResource<readonly AirconRule[] | null> {
    return pollingResource(() => this.api.get<readonly AirconRule[] | null>('/aircon/rules'), {
      intervalMs: POLL_HOUSE_EVERY_MS,
    });
  }

  /** Writes the rule of a unit whole - it acts on the house within the minute. Answers the rule stored. */
  saveRule(id: number, body: AirconRuleBody): Observable<void> {
    return this.api.put<unknown>(`/aircon/${id}/rules`, body).pipe(map(() => undefined));
  }

  /** Removes the rule of a unit. */
  deleteRule(id: number): Observable<void> {
    return this.api.delete<unknown>(`/aircon/${id}/rules`).pipe(map(() => undefined));
  }

  /** The two plugs that feed the units: the draw now and the energy (HAS-390). Call in an injection context. */
  watchPower(): PollingResource<readonly AirconPlug[] | null> {
    return pollingResource(() => this.api.get<readonly AirconPlug[] | null>('/aircon/power'), {
      intervalMs: POLL_POWER_EVERY_MS,
    });
  }

  /**
   * The power of one plug in buckets for a range of the house (at most 31 days; the service chooses the bucket -
   * 5 minutes up to 2 days). The plug is read when a call is made. Call in an injection context.
   */
  watchPowerSamples(
    plug: () => string,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly AirconPowerBucket[] | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<readonly AirconPowerBucket[] | null>('/aircon/power/samples', {
          plug: plug(),
          ...asked,
        }),
      { intervalMs: POLL_HOUSE_EVERY_MS },
    );
  }

  /** Whether the indoor plug may be power cycled now, and the last cycle. Call in an injection context. */
  watchPowerCycle(): PollingResource<PowerCycleState | null> {
    return pollingResource(() => this.api.get<PowerCycleState | null>('/aircon/power-cycle'), {
      intervalMs: POLL_POWER_EVERY_MS,
    });
  }

  /** Switches the indoor plug off and on again - the four indoor units; `member` is stored with the cycle. */
  startPowerCycle(member: string | undefined): Observable<void> {
    return this.api
      .post<unknown>('/aircon/power-cycle', undefined, member === undefined ? {} : { member })
      .pipe(map(() => undefined));
  }

  /** The filter of a unit cleaned: its hours start again at 0 (HAS-391). */
  filterCleaned(id: number): Observable<void> {
    return this.api
      .post<unknown>(`/aircon/${id}/filter-cleaned`)
      .pipe(map(() => undefined));
  }

  /** The changes of a unit in a range, with who made them (HAS-391). Call in an injection context. */
  watchRuns(
    id: () => number,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly AirconRun[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly AirconRun[] | null>(`/aircon/${id()}/runs`, { ...asked }),
      { intervalMs: POLL_HOUSE_EVERY_MS },
    );
  }
}

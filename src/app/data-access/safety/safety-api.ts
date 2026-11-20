import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * A flag of a detector or a base as `safety-service` keeps it: its value and since when (a house wall-clock time).
 * Either may be left out - a flag the base never published is left out whole, and is "not known", never false.
 */
export interface SafetyFlag {
  readonly value?: boolean;
  readonly since?: string;
}

/** The kinds of the fire detectors of the registry (`smart-home-sdk` 1.24.0). */
export const DETECTOR_KINDS = ['smoke detector', 'co detector', 'heat detector'] as const;

/**
 * A detector of `GET /safety` (safety-service >= 0.1.0, HAS-460): its registry id, name and room, the base it is paired
 * to, every flag the base publishes, the model and firmware, when it was last heard - and `confirmed: false` while
 * what is shown was read back at the start of the service and not confirmed by the base since. `lastCommandConfirmed`
 * (HAS-464, >= 0.4.0): `false` while the last mute or self test was not confirmed by the base within 60 s, left out
 * with no command. Every field may be left out.
 */
export interface Detector {
  readonly id?: number;
  readonly name?: string;
  readonly room?: string;
  /** `smoke detector`, `co detector`, `heat detector` - or a kind this version does not know. */
  readonly kind?: string;
  readonly stationSerial?: string;
  readonly deviceId?: string;
  readonly alarm?: SafetyFlag;
  readonly online?: SafetyFlag;
  readonly batteryLow?: SafetyFlag;
  readonly endOfLife?: SafetyFlag;
  readonly fault?: SafetyFlag;
  readonly muted?: SafetyFlag;
  readonly selfTestProblem?: SafetyFlag;
  readonly model?: string;
  readonly firmware?: string;
  readonly lastHeardAt?: string;
  readonly confirmed?: boolean;
  readonly lastCommandConfirmed?: boolean;
}

/** A base station of `GET /safety`: whether it is on the broker, its address and Wi-Fi, when it was last heard. */
export interface SafetyBase {
  readonly stationSerial?: string;
  readonly online?: SafetyFlag;
  readonly ipAddress?: string;
  readonly wifiSsid?: string;
  readonly wifiRssi?: number;
  readonly lastHeardAt?: string;
  readonly confirmed?: boolean;
}

/** `GET /safety`: the detectors of the registry and the bases they are paired to. `503 REGISTRY_UNAVAILABLE` early. */
export interface SafetyRead {
  readonly detectors?: readonly Detector[];
  readonly bases?: readonly SafetyBase[];
}

/** An alarm episode of `GET /safety/alarms` (>= 0.2.0): an open one has no `clearedAt`. */
export interface SafetyAlarm {
  readonly id?: number;
  readonly detectorId?: number;
  readonly name?: string;
  readonly room?: string;
  readonly startedAt?: string;
  readonly clearedAt?: string;
  readonly alarmToldAt?: string;
  readonly overToldAt?: string;
}

/** A base as the technical monitor of `GET /safety/status` (>= 0.3.0) judges it. */
export interface BaseStatus {
  readonly stationSerial?: string;
  readonly reachable?: boolean;
  readonly lastHeardAt?: string;
  readonly ipAddress?: string;
  readonly wifiRssi?: number;
  /** Not heard for longer than the service allows: told on the technical channel. */
  readonly silent?: boolean;
}

/** An open alert of the technical monitor: `offline`, `battery`, `end of life`, `fault`, `base offline`, `base silent`. */
export interface SafetyStatusAlert {
  readonly kind?: string;
  readonly device?: string;
  readonly name?: string;
  readonly since?: string;
  readonly told?: boolean;
}

/** `GET /safety/status`. */
export interface SafetyStatus {
  readonly bases?: readonly BaseStatus[];
  readonly detectorsInTrouble?: number;
  readonly alerts?: readonly SafetyStatusAlert[];
}

/** The reactions to a fire alarm (HAS-468, >= 0.5.0), each off by default. */
export const SAFETY_REACTIONS = ['lightsOn', 'blindsUp', 'airconOff'] as const;
export type SafetyReaction = (typeof SAFETY_REACTIONS)[number];

/** `GET /safety/automation` - and the whole body of its `PUT`. */
export type SafetyAutomation = Readonly<Partial<Record<SafetyReaction, boolean>>>;

/** A reaction the automation sent during an alarm (`GET /safety/automation/runs`, HAS-468). */
export interface SafetyRun {
  readonly episode?: number;
  /** `lightsOn`, `blindsUp`, `airconOff` - or a word this version does not know. */
  readonly reaction?: string;
  readonly target?: string;
  readonly sentAt?: string;
  readonly outcome?: string;
}

/** The commands of a detector (HAS-464, >= 0.4.0). */
export type SafetyCommand = 'mute' | 'selfTest';

/**
 * Every member reads the detectors on every page (the banner of a fire alarm), the tile and My room: one call for all
 * of them, every 30 s (`SafetyStore`).
 */
const POLL_DETECTORS_EVERY_MS = 30_000;
/** The technical monitor: the base card of the page and the silent base on the banner of the administrator. */
const POLL_STATUS_EVERY_MS = 30_000;
/** The alarms, the switches and the runs of the page. */
const POLL_PAGE_EVERY_MS = 60_000;

/**
 * The fire detectors of `safety-service` (epic HAS-455): the state of every detector and base, the alarm episodes, the
 * technical monitor, the mute and the self test of a detector (with `source=dashboard`, after a question) and the
 * switches of the reactions to an alarm.
 */
@Injectable({ providedIn: 'root' })
export class SafetyApi {
  private readonly api = inject(ApiClient);

  /** Every detector and base. Call in an injection context - `SafetyStore` holds the one of the application. */
  watchSafety(): PollingResource<SafetyRead | null> {
    return pollingResource(() => this.api.get<SafetyRead | null>('/safety'), {
      intervalMs: POLL_DETECTORS_EVERY_MS,
    });
  }

  /** The technical monitor. Call in an injection context. */
  watchStatus(): PollingResource<SafetyStatus | null> {
    return pollingResource(() => this.api.get<SafetyStatus | null>('/safety/status'), {
      intervalMs: POLL_STATUS_EVERY_MS,
    });
  }

  /** The alarm episodes of a range (at most 30 days), the newest first, tagged with the range. */
  watchAlarms(
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly SafetyAlarm[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly SafetyAlarm[] | null>('/safety/alarms', { ...asked }),
      { intervalMs: POLL_PAGE_EVERY_MS },
    );
  }

  /** The switches of the reactions to an alarm. Call in an injection context. */
  watchAutomation(): PollingResource<SafetyAutomation | null> {
    return pollingResource(() => this.api.get<SafetyAutomation | null>('/safety/automation'), {
      intervalMs: POLL_PAGE_EVERY_MS,
    });
  }

  /** The reactions the automation sent in a range (at most 30 days), tagged with the range. */
  watchRuns(range: () => HistoryRange): QueryResource<HistoryRange, readonly SafetyRun[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly SafetyRun[] | null>('/safety/automation/runs', { ...asked }),
      { intervalMs: POLL_PAGE_EVERY_MS },
    );
  }

  /** `POST /safety/{id}/mute` or `/self-test` with `source=dashboard`: 202 once sent - the detectors are read back. */
  command(id: number, command: SafetyCommand): Observable<void> {
    const path = command === 'mute' ? 'mute' : 'self-test';
    return this.api
      .post<unknown>(`/safety/${id}/${path}`, undefined, { source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** `PUT /safety/automation` with the whole body - the switches are read back. */
  saveAutomation(automation: Required<SafetyAutomation>): Observable<void> {
    return this.api.put<unknown>('/safety/automation', automation).pipe(map(() => undefined));
  }
}

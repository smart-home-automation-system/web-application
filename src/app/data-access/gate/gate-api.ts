import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * The Shelly of the driveway gate as `gate-service` last read it (HAS-449): its registry id, whether it answered,
 * whether its relay switches itself off - only then is the gate commanded -, and when it was read.
 */
export interface DrivewayGate {
  readonly id?: number;
  readonly reachable?: boolean;
  readonly safe?: boolean;
  readonly autoOffSeconds?: number;
  readonly checkedAt?: string;
}

/** The last availability the bridge of the door station published, and when it was heard. */
export interface GateBridge {
  readonly online?: boolean;
  readonly at?: string;
}

/** The last ring of the door station and the button it came from. */
export interface GateRing {
  readonly at?: string;
  readonly button?: string;
}

/**
 * The last opening of the driveway gate: `screen` (the indoor screen), `dashboard` - with who opened it there - or
 * `panel` (a wall panel - the entrance panel at the door or the hall panel upstairs, one source for both;
 * gate-service >= 0.11.0, HAS-482, HAS-499).
 */
export interface GateOpening {
  readonly at?: string;
  readonly source?: string;
  readonly member?: string;
}

/** `GET /home/gate`: every part not known is left out - a gate never read, a bridge that said nothing since a start. */
export interface GateRead {
  readonly gate?: DrivewayGate;
  readonly bridge?: GateBridge;
  readonly lastRing?: GateRing;
  readonly lastOpening?: GateOpening;
}

/** The states of a garage gate, the words of `gate-service`; a missing state is never read as closed. */
export const GARAGE_STATES = ['open', 'closed', 'unknown'] as const;
export type GarageState = (typeof GARAGE_STATES)[number];

/**
 * A garage gate (HAS-473, HAS-474): what its opening sensor says - `since` when its gateway heard the reading that
 * decides it -, whether its Shelly answers and its relay switches itself off, and whether the sensor answered the
 * last pulse (`lastCommandConfirmed`: `false` after a minute without a change, left out with no pulse, while it is
 * checked or when a second pulse cancelled the check).
 */
export interface GarageGate {
  readonly id?: number;
  readonly name?: string;
  /** `open`, `closed`, `unknown` - or a word this version does not know. */
  readonly state?: string;
  readonly since?: string;
  readonly confirmedAt?: string;
  readonly reachable?: boolean;
  readonly safe?: boolean;
  readonly lastCommandConfirmed?: boolean;
}

/**
 * An open alarm or warning of a garage gate (HAS-454, the episodes of HAS-475): `kind` cold, empty house or long,
 * `level` alarm or warning, since when the gate stands open, when the household was first told, the repeats since.
 */
export interface GarageAlert {
  readonly gate?: number;
  readonly name?: string;
  readonly kind?: string;
  readonly level?: string;
  readonly openSince?: string;
  readonly raisedAt?: string;
  readonly reminders?: number;
}

/**
 * An item of the timeline (HAS-450, HAS-474): `ring` (button), `dismissed`, `unlock` (door, unlockType, screen),
 * `command` (source, member, outcome, and `gate` for a garage gate) or `garage` (gate, state, and for a closing
 * `openForSeconds`). A field not known, or not of its kind, is left out.
 */
export interface GateEvent {
  readonly kind?: string;
  readonly at?: string;
  readonly button?: string;
  readonly door?: number;
  readonly unlockType?: string;
  readonly screen?: string;
  readonly source?: string;
  readonly member?: string;
  readonly outcome?: string;
  readonly gate?: number;
  readonly state?: string;
  readonly openForSeconds?: number;
}

/** The gates are commanded on their page: read often enough that a press is followed by its state. */
const POLL_GATES_EVERY_MS = 5_000;
/** The alarms are judged every minute by the service. */
const POLL_ALERTS_EVERY_MS = 30_000;
/** The tile of the overview. */
const POLL_TILE_EVERY_MS = 30_000;
/** The timeline of the page. */
const POLL_EVENTS_EVERY_MS = 30_000;

/**
 * The driveway gate, the door station and the garage gates of `gate-service` (epic HAS-442): the reads of the gate
 * page and the overview, the opening of the driveway gate and the pulse of a garage gate - both with
 * `source=dashboard` and the member of the profile, sent at once with no question (owner, 2026-11-16 and 2026-11-18).
 */
@Injectable({ providedIn: 'root' })
export class GateApi {
  private readonly api = inject(ApiClient);

  /** The driveway gate, the bridge, the last ring and opening. Call in an injection context. */
  watchGate(intervalMs: number = POLL_GATES_EVERY_MS): PollingResource<GateRead | null> {
    return pollingResource(() => this.api.get<GateRead | null>('/gate'), { intervalMs });
  }

  /** Every garage gate with what its sensors say, by id. Call in an injection context. */
  watchGarages(
    intervalMs: number = POLL_GATES_EVERY_MS,
  ): PollingResource<readonly GarageGate[] | null> {
    return pollingResource(() => this.api.get<readonly GarageGate[] | null>('/gate/garage'), {
      intervalMs,
    });
  }

  /** The open alarms and warnings of the garage gates, the newest first. Call in an injection context. */
  watchAlerts(): PollingResource<readonly GarageAlert[] | null> {
    return pollingResource(
      () => this.api.get<readonly GarageAlert[] | null>('/gate/garage/alerts'),
      {
        intervalMs: POLL_ALERTS_EVERY_MS,
      },
    );
  }

  /** The garage gates for the tile of the overview. Call in an injection context. */
  watchGaragesForTile(): PollingResource<readonly GarageGate[] | null> {
    return this.watchGarages(POLL_TILE_EVERY_MS);
  }

  /**
   * The timeline of a range of the house (at most 31 days), the newest first; the answer is tagged with its range.
   * Call in an injection context.
   */
  watchEvents(range: () => HistoryRange): QueryResource<HistoryRange, readonly GateEvent[] | null> {
    return queryResource(
      range,
      (asked) => this.api.get<readonly GateEvent[] | null>('/gate/events', { ...asked }),
      { intervalMs: POLL_EVENTS_EVERY_MS },
    );
  }

  /** Opens the driveway gate: 204 once its Shelly took the pulse - the gate is read back. */
  open(member: string): Observable<void> {
    return this.api
      .post<unknown>('/gate/open', undefined, { source: 'dashboard', member })
      .pipe(map(() => undefined));
  }

  /** One pulse of a garage gate - it opens, stops or closes it alike; the gate is read back. */
  pulse(id: number, member: string): Observable<void> {
    return this.api
      .post<unknown>(`/gate/garage/${id}/pulse`, undefined, { source: 'dashboard', member })
      .pipe(map(() => undefined));
  }
}

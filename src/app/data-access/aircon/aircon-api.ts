import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

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

  /** Every unit of the registry. Call in an injection context. */
  watchUnits(): PollingResource<readonly AirconUnit[] | null> {
    return pollingResource(() => this.api.get<readonly AirconUnit[] | null>('/aircon'), {
      intervalMs: POLL_HOUSE_EVERY_MS,
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
}

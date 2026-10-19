import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/** The color of an rgbw light, as the device reported it. */
export interface LightColor {
  /** Three values 0 ... 255. */
  readonly rgb?: readonly number[];
  /** 0 ... 255. */
  readonly white?: number;
}

/**
 * One light of `GET /home/light` (`light-service` 0.6.0). What the registry says of it and the
 * state the devices reported - **a field the service does not know is left out**, never answered
 * as off or zero: no `on` is a light not heard of yet.
 */
export interface Light {
  /** The id of the device registry. */
  readonly id?: number;
  readonly name?: string;
  readonly room?: string;
  readonly vendor?: string;
  /** `relay`, `dimmer`, `rgbw` - the `lightKind` of the registry. */
  readonly kind?: string;
  readonly on?: boolean;
  /** 1 ... 100; a dimmer or an rgbw light only - also while off, the level it comes back at. */
  readonly brightness?: number;
  readonly color?: LightColor;
  /** House wall-clock time of its last change. */
  readonly changedAt?: string;
  /** Who changed it: `dashboard`, `rule`, `empty-house`, `external`, or what the device names. */
  readonly source?: string;
  readonly reachable?: boolean;
  /** House wall-clock time until which the rules of the room leave it alone (the manual hold). */
  readonly heldUntil?: string;
}

/** The lights of one room, as the service groups them. */
export interface RoomLights {
  readonly room?: string;
  /** `true` when a light is on, `false` when every one is known to be off, missing otherwise. */
  readonly anyOn?: boolean;
  readonly lights?: readonly Light[];
}

// a light answers a command within a second or two; the read after a command is what shows it
const POLL_EVERY_MS = 10_000;

/**
 * The lights of `light-service` (HAS-292): the one place that switches every light of the house,
 * Eaton (through `amx-service`) and Shelly alike, and keeps its real state. A command is addressed
 * by the id of the device registry and carries `source=dashboard`, which the rules engine reads as
 * a change by hand - it starts the manual hold of the room. A command answers 202 when the device
 * took it, never that the light is on: the caller reads the lights again, no optimistic state.
 */
@Injectable({ providedIn: 'root' })
export class LightApi {
  private readonly api = inject(ApiClient);

  /** Every light, by room. Call in an injection context: the polling lives as long as the caller. */
  watchLights(): PollingResource<readonly RoomLights[] | null> {
    return pollingResource(() => this.api.get<readonly RoomLights[] | null>('/light'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  turn(id: number, on: boolean): Observable<void> {
    return this.api
      .post<unknown>(`/light/${id}`, undefined, { turn: on ? 'on' : 'off', source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** 1 ... 100, a light that dims only (a dimmer, an rgbw light); switches it on. */
  brightness(id: number, value: number): Observable<void> {
    return this.api
      .post<unknown>(`/light/${id}/brightness`, undefined, { value, source: 'dashboard' })
      .pipe(map(() => undefined));
  }
}

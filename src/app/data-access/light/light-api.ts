import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { APP_CONFIG } from '../../core/config/app-config';
import { historyRange } from '../../core/time/history-range';

/** The color of an rgbw light, as the device reported it. */
export interface LightColor {
  /** Three values 0 ... 255. */
  readonly rgb?: readonly number[];
  /** 0 ... 255; left out by a device that has no white channel (a Gen2 RGBW in the profile rgb). */
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

/** A presence or motion sensor of a room, as the occupancy of `light-service` knows it. */
export interface OccupancySensor {
  readonly id?: number;
  readonly name?: string;
  /** `presence sensor` or `motion sensor`. */
  readonly kind?: string;
  /** House wall-clock time of its last report since the start of the service. */
  readonly lastReportAt?: string;
  /** Left out where nothing tells it: an Eaton PIR, a Shelly Motion that sleeps, after a start. */
  readonly reachable?: boolean;
}

/**
 * Whether a room is occupied (`light-service` 0.4.0, HAS-260) - **each field left out while it is
 * not known**: after a start of the service every room is unknown, never empty, and a room with
 * motion sensors only has no `occupied` at all.
 */
export interface Occupancy {
  readonly room?: string;
  /** `true` when a presence sensor says so, `false` when every one does. */
  readonly occupied?: boolean;
  /** House wall-clock time the service saw `occupied` change. */
  readonly since?: string;
  readonly lastMotionAt?: string;
  /** The word of a Presence: `dark`, `twilight`, `bright`. */
  readonly illumination?: string;
  /** The newest number of a motion sensor. */
  readonly lux?: number;
  readonly sensors?: readonly OccupancySensor[];
}

/** The lights of one room, as the service groups them. */
export interface RoomLights {
  readonly room?: string;
  /** `true` when a light is on, `false` when every one is known to be off, missing otherwise. */
  readonly anyOn?: boolean;
  readonly lights?: readonly Light[];
  readonly occupancy?: Occupancy;
}

/** A period of the motion-on rule: what a motion lights in it. */
export interface MotionPeriod {
  /** `HH:mm`; a `to` before `from` is the next day, the same time the whole day. */
  readonly from?: string;
  readonly to?: string;
  readonly brightness?: number;
  readonly rgb?: readonly number[];
  readonly white?: number;
}

/**
 * The rule of a room (`light-service` 0.6.0, HAS-261), as stored - written whole by the
 * administrator (HAS-267), switched off by a resident on My room. A delay or a lux that was not
 * given is left out.
 */
export interface RoomRule {
  readonly room?: string;
  readonly autoOffEnabled?: boolean;
  readonly autoOffDelayMinutes?: number;
  readonly motionOnEnabled?: boolean;
  readonly onlyBelowLux?: number;
  readonly motionOffAfterMinutes?: number;
  readonly periods?: readonly MotionPeriod[];
  readonly manualHoldMinutes?: number;
  /** `false` stops both rules of the room - the switch of My room, which a write of the administrator keeps. */
  readonly enabledByResident?: boolean;
  readonly updatedAt?: string;
}

/** What the engine sent to a light of a room (`light_rule_run`, HAS-262). */
export interface RuleRun {
  /** The registry id of the light. */
  readonly deviceId?: number;
  /** `on` / `off`. */
  readonly action?: string;
  /** `auto-off`, `motion-on`, `motion-off`, `empty-house`, `presence-simulation`. */
  readonly reason?: string;
  /** The code of `LightError` when the light did not take the command; left out when it did. */
  readonly error?: string;
  /** House wall-clock time. */
  readonly at?: string;
}

/**
 * The empty house now (`GET /home/light/empty-house`, HAS-263). What is not known is left out;
 * `phase`, `lit` and `nextChangeAt` are there by night only.
 */
export interface EmptyHouse {
  /** `false`: the service watches the house but does not act on it. */
  readonly enabled?: boolean;
  /** `empty`, `occupied`, `unknown`. */
  readonly house?: string;
  readonly emptySince?: string;
  /** From when the empty house is acted on (`emptySince` and the delay). */
  readonly actingFrom?: string;
  /** The rules of the rooms pause and the house is acted on. */
  readonly active?: boolean;
  readonly dusk?: string;
  readonly sunrise?: string;
  /** `evening`, `night`, `morning`. */
  readonly phase?: string;
  /** The registry ids of the lights the simulation lights now - a preview while somebody is home. */
  readonly lit?: readonly number[];
  readonly nextChangeAt?: string;
}

/** A light a command for a room could not switch, with the code of its refusal. */
export interface RoomTurnFailure {
  readonly id?: number;
  readonly name?: string;
  readonly code?: string;
}

/** The answer of a command for a room: what it did to each light - never their state. */
export interface RoomTurnAnswer {
  readonly room?: string;
  readonly turn?: string;
  readonly switched?: readonly { readonly id?: number; readonly name?: string }[];
  readonly failed?: readonly RoomTurnFailure[];
}

/** A color for an rgbw light: each part optional - the device keeps what is left out. */
export interface ColorCommand {
  readonly rgb?: readonly [number, number, number];
  readonly white?: number;
  readonly brightness?: number;
}

// a light answers a command within a second or two; the read after a command is what shows it -
// and the occupancy that comes with the lights changes by the minute
const POLL_EVERY_MS = 10_000;
// the rules change when somebody writes one; the empty house by the minute of its engine
const POLL_RULES_EVERY_MS = 60_000;
const POLL_EMPTY_HOUSE_EVERY_MS = 60_000;
const POLL_RUNS_EVERY_MS = 60_000;

/**
 * The lights of `light-service` (HAS-292, HAS-266): the one place that switches every light of the
 * house, Eaton (through `amx-service`) and Shelly alike, and keeps its real state. A command is
 * addressed by the id of the device registry and carries `source=dashboard`, which the rules engine
 * reads as a change by hand - it starts the manual hold of the room. A command answers 202 when the
 * device took it, never that the light is on: the caller reads the lights again, no optimistic state.
 */
@Injectable({ providedIn: 'root' })
export class LightApi {
  private readonly api = inject(ApiClient);
  private readonly timeZone = inject(APP_CONFIG).houseTimeZone;

  /**
   * Every light, by room, with the occupancy of each room (HAS-260) - one call: the occupancy of a
   * room is read from here, not from `/rooms/{room}/occupancy`, so a page tells one freshness and
   * one failure for both. Call in an injection context: the polling lives as long as the caller.
   */
  watchLights(intervalMs = POLL_EVERY_MS): PollingResource<readonly RoomLights[] | null> {
    return pollingResource(() => this.api.get<readonly RoomLights[] | null>('/light'), {
      intervalMs,
    });
  }

  /**
   * The lights of one room with its occupancy (HAS-268, the card of "My room"): the name is read
   * when a call is made. A room without lights answers with an empty list; a 404 with the code
   * `NOT_FOUND_LIGHT` is what a room command answers for such a room.
   */
  watchRoom(room: () => string): PollingResource<RoomLights | null> {
    return pollingResource(
      () => this.api.get<RoomLights | null>(`/light/rooms/${encodeURIComponent(room())}`),
      { intervalMs: POLL_EVERY_MS },
    );
  }

  /** The rule of one room as stored; a 404 with the code `NOT_FOUND_RULE` is a room without one. */
  watchRoomRule(room: () => string): PollingResource<RoomRule | null> {
    return pollingResource(
      () => this.api.get<RoomRule | null>(`/light/rooms/${encodeURIComponent(room())}/rules`),
      { intervalMs: POLL_RULES_EVERY_MS },
    );
  }

  /**
   * The switch of the resident (HAS-268): `false` stops both rules of the room until the resident
   * switches them on again; a write of the administrator keeps it. Answers the rule as stored.
   */
  residentEnabled(room: string, enabled: boolean): Observable<RoomRule | null> {
    return this.api.put<RoomRule | null>(
      `/light/rooms/${encodeURIComponent(room)}/rules/resident-enabled`,
      { enabled },
    );
  }

  /** Every room with a rule. */
  watchRules(): PollingResource<readonly RoomRule[] | null> {
    return pollingResource(() => this.api.get<readonly RoomRule[] | null>('/light/rules'), {
      intervalMs: POLL_RULES_EVERY_MS,
    });
  }

  /** The empty house now: whether the service acts on it, and by night what it lights. */
  watchEmptyHouse(): PollingResource<EmptyHouse | null> {
    return pollingResource(() => this.api.get<EmptyHouse | null>('/light/empty-house'), {
      intervalMs: POLL_EMPTY_HOUSE_EVERY_MS,
    });
  }

  /**
   * What the engine sent in one room in the last 24 hours of the house (to the end of the running
   * hour - the service allows 7 days). The range is taken anew at every call: the clock moving on
   * is not another question, so the answer needs no tag (the rule of a history). One resource is
   * for one room - the window of a room is made anew for another.
   */
  watchRuns(room: string): PollingResource<readonly RuleRun[] | null> {
    return pollingResource(
      () =>
        this.api.get<readonly RuleRun[] | null>(
          `/light/rooms/${encodeURIComponent(room)}/rules/runs`,
          { ...historyRange('day', Date.now(), this.timeZone) },
        ),
      { intervalMs: POLL_RUNS_EVERY_MS },
    );
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

  /** A color for an rgbw light (rgb and white 0 ... 255, brightness 1 ... 100); switches it on. */
  color(id: number, color: ColorCommand): Observable<void> {
    return this.api
      .post<unknown>(`/light/${id}/color`, color, { source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /**
   * Every light of a room, one after the other in the service. It answers with what each light
   * did with the command - a light that failed is named, the rest still switch; the room fails
   * as a whole only when no light took it. `null` for an answer without a body.
   */
  roomTurn(room: string, on: boolean): Observable<RoomTurnAnswer | null> {
    return this.api.post<RoomTurnAnswer | null>(
      `/light/rooms/${encodeURIComponent(room)}`,
      undefined,
      { turn: on ? 'on' : 'off', source: 'dashboard' },
    );
  }
}

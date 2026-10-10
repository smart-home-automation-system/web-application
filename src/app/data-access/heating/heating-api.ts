import { Injectable, Signal, inject, signal } from '@angular/core';
import { throwError } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { ApiError, toApiError } from '../../core/api/api-error';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/** `GET /home/heating` - the switch of the whole heating system. */
export interface HeatingStatus {
  readonly isHeatingEnabled?: boolean;
  /** House wall-clock time of the last change of the switch. */
  readonly updatedAt?: string;
}

/**
 * `GET /home/heating/status/active`: whether the heating is at work - the system is switched on
 * *and* at least one room is being heated right now. False says nothing about which of the two
 * is missing; the switch is the other call.
 */
export interface HeatingActivity {
  readonly active?: boolean;
}

/**
 * One row of `GET /home/heating/temperature/sensors`: a room and the last temperature the service
 * stored for it. A room that never reported is not in the answer at all.
 */
export interface TemperatureSensor {
  /** The identifier of the room in the backend (`living room`), not a name to translate. */
  readonly room?: string;
  /** House wall-clock time of the last reading. */
  readonly lastReadingAt?: string | null;
  /** Silent for longer than the service allows (a day, unless it is configured otherwise). */
  readonly stale?: boolean;
  /** Left out of the alerts - a sensor known to be retired. `stale` is reported all the same. */
  readonly muted?: boolean;
}

/** A measured value with the house wall-clock time the service got it at. */
export interface RoomReading {
  readonly value?: number;
  readonly updatedAt?: string;
}

/** One period of a heater's week: on its days, between the two times, heat up to the temperature. */
export interface HeaterSchedule {
  readonly type?: string;
  /** `MONDAY` ... `SUNDAY`. */
  readonly days?: readonly string[];
  /** Local times of the house, `07:00:00`; a period is on strictly between the two. */
  readonly startTime?: string;
  readonly endTime?: string;
  readonly temperature?: number;
}

/** A heater of a room - a radiator or the floor - as the service last knew it. */
export interface RoomHeater {
  /** `radiator` or `floor`. */
  readonly type?: string;
  /** What its relay last reported; missing until the relay has answered since the service started. */
  readonly working?: boolean;
  /** House wall-clock time of that report. */
  readonly updatedAt?: string;
  /**
   * The decision of the control loop at the last reading of the room: a period is on **and** the
   * room is colder than it asks for. Missing until a reading has arrived since the service
   * started. The switch of the whole heating is not part of it.
   */
  readonly inSchedule?: boolean;
  /** The temperature of that period - there only while `inSchedule` is true. */
  readonly targetTemperature?: number;
  /**
   * What the schedules ask for at the moment of the call, whether or not the room has reached it;
   * missing when no period is on. The target to show: worked out by the service, with its clock.
   */
  readonly scheduledTemperature?: number;
  readonly schedules?: readonly HeaterSchedule[];
}

/**
 * One room of `GET /home/heating/rooms`. A missing field means "not known", never off or zero:
 * the service leaves out whatever was not measured, reported or decided yet. After a start of
 * the service a room has its last stored temperature and, until its sensor reports again,
 * nothing else.
 */
export interface Room {
  /** The identifier of the room in the backend (`living room`), not a name to translate. */
  readonly name?: string;
  readonly mode?: string;
  readonly heatingEnabled?: boolean;
  readonly temperature?: RoomReading;
  readonly humidity?: RoomReading;
  readonly heaters?: readonly RoomHeater[];
}

/** `GET /home/heating/floor-pump`: `{}` until the relay of the pump has answered. */
export interface FloorPump {
  readonly working?: boolean;
  /** House wall-clock time of that report. */
  readonly updatedAt?: string;
}

/** One bucket of the history of a room: the average of the readings in it. */
export interface RoomHistoryPoint {
  /** House wall-clock time the bucket starts at, aligned to the clock of the house. */
  readonly at?: string;
  readonly value?: number;
}

/**
 * `GET /home/heating/rooms/{name}/temperature/history?from=&to=` (`heating-service` 1.9.0): the
 * stored temperatures of a room over a range, averaged into buckets whose width the service
 * chooses - 20 minutes up to 2 days, 1 hour up to 8, 3 hours up to 31. **A bucket without a
 * reading has no point**: two points further apart than `bucketSeconds` are a gap in the
 * readings, and the line is broken there.
 */
export interface RoomHistory {
  readonly room?: string;
  readonly from?: string;
  readonly to?: string;
  readonly bucketSeconds?: number;
  readonly points?: readonly RoomHistoryPoint[];
}

/** A change of the heating switch that the service did not carry out. */
export interface FailedSwitch {
  /** What was asked for. */
  readonly on: boolean;
  readonly error: ApiError;
}

/**
 * The switch of the heating system: its state, kept fresh by polling, and the way to change it.
 * There is no optimistic state - `value` is only ever what the service answered, and after a
 * change, carried out or not, the service is asked again before the switch can be used anew.
 */
export interface HeatingSwitchControl extends PollingResource<HeatingStatus> {
  /** True from the moment a change is sent until the state has been read again. */
  readonly switching: Signal<boolean>;
  /** The last change, if it failed; cleared by the next one. */
  readonly switchFailure: Signal<FailedSwitch | undefined>;
  /** Asks the service to switch the heating of the whole house. Ignored while `switching`. */
  turn(on: boolean): void;
}

const POLL_EVERY_MS = 30_000;
// a sensor reports every few minutes and counts as silent after a day
const POLL_SENSORS_EVERY_MS = 60_000;
// a bucket is 20 minutes at its narrowest; the query shares a pool of 2 with the control loop
const POLL_HISTORY_EVERY_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class HeatingApi {
  private readonly api = inject(ApiClient);

  /** Call in an injection context: the polling lives as long as the caller. */
  watchStatus(): PollingResource<HeatingStatus> {
    return pollingResource(() => this.api.get<HeatingStatus>('/heating'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  /**
   * The state of the switch with the way to change it. Call in an injection context: the polling
   * lives as long as the caller. A change that is on its way when the caller goes is not
   * aborted with it - a write cut off halfway is carried out or not, and nobody would know
   * which. The one thing that does cut it off is the time limit of `ApiClient`: such a change
   * is a failure of the `network` kind, which says "no answer", not "not carried out".
   */
  watchSwitch(): HeatingSwitchControl {
    const status = this.watchStatus();
    const switching = signal(false);
    const switchFailure = signal<FailedSwitch | undefined>(undefined);

    // the answer of the change repeats the new state, and is not used: the state on screen is
    // the one the service gives when asked, also after a change that failed or timed out
    const readAgain = () => void status.refresh().then(() => switching.set(false));

    return {
      ...status,
      switching: switching.asReadonly(),
      switchFailure: switchFailure.asReadonly(),
      turn: (on) => {
        if (switching()) {
          return;
        }
        switching.set(true);
        switchFailure.set(undefined);
        this.api.post<unknown>('/heating', undefined, { turn: on ? 'on' : 'off' }).subscribe({
          error: (failure: unknown) => {
            switchFailure.set({ on, error: toApiError(failure) });
            readAgain();
          },
          complete: readAgain,
        });
      },
    };
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchActivity(): PollingResource<HeatingActivity> {
    return pollingResource(() => this.api.get<HeatingActivity>('/heating/status/active'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  /**
   * Every room of the house with its temperature, heaters and schedules. The service answers
   * from its memory, so the freshness of the call is not the age of a reading - each reading
   * and each relay report carries its own time. Call in an injection context: the polling lives
   * as long as the caller.
   */
  watchRooms(): PollingResource<readonly Room[] | null> {
    return pollingResource(() => this.api.get<readonly Room[] | null>('/heating/rooms'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  /**
   * One room, by the identifier the list gives it (`living room`, in any case). `name` is read
   * when a call is made, so it may be an input of the caller; a caller that shows another room
   * makes a resource of its own for it, or the answer for one room stands under the name of
   * another for the length of a call. A name the service has no room for fails with a 404 that
   * carries the code `NOT_FOUND_ROOM`; a 404 without it is a route that is not there. Call in
   * an injection context: the polling lives as long as the caller.
   */
  watchRoom(name: () => string): PollingResource<Room | null> {
    return pollingResource(
      () => {
        const asked = name();
        // The name is a path segment: encoded, a space or a slash in it cannot change the path.
        // Dots are not encoded, and a segment of dots alone is one the browser resolves away
        // before it sends anything - such a name cannot be asked for, and is not.
        if (/^\.+$/.test(asked)) {
          return throwError(
            () => new ApiError('unexpected', 0, [], new Error('A name of dots is not a path')),
          );
        }
        return this.api.get<Room | null>(`/heating/rooms/${encodeURIComponent(asked)}`);
      },
      { intervalMs: POLL_EVERY_MS },
    );
  }

  /**
   * The stored temperatures of the room `room()` names for the range `range()` gives - asked
   * again whenever the range changes, the answer tagged with the range it is for. Like
   * `watchRoom`, one resource is for one room: the caller is made anew for another. The page asks
   * with `from` / `to` and never chooses the bucket. Call in an injection context: the polling
   * lives as long as the caller.
   */
  watchRoomHistory(
    room: () => string,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, RoomHistory | null> {
    return queryResource(
      range,
      (asked) => {
        const name = room();
        // a path segment, as in watchRoom: encoded, and a name of dots alone is never asked for
        if (/^\.+$/.test(name)) {
          return throwError(
            () => new ApiError('unexpected', 0, [], new Error('A name of dots is not a path')),
          );
        }
        return this.api.get<RoomHistory | null>(
          `/heating/rooms/${encodeURIComponent(name)}/temperature/history`,
          { ...asked },
        );
      },
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchFloorPump(): PollingResource<FloorPump | null> {
    return pollingResource(() => this.api.get<FloorPump | null>('/heating/floor-pump'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchSensors(): PollingResource<readonly TemperatureSensor[] | null> {
    return pollingResource(
      () => this.api.get<readonly TemperatureSensor[] | null>('/heating/temperature/sensors'),
      { intervalMs: POLL_SENSORS_EVERY_MS },
    );
  }
}

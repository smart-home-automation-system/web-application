import { Injectable, Signal, inject, signal } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { ApiError, toApiError } from '../../core/api/api-error';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

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

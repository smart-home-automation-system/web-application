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

  /** Call in an injection context: the polling lives as long as the caller. */
  watchSensors(): PollingResource<readonly TemperatureSensor[] | null> {
    return pollingResource(
      () => this.api.get<readonly TemperatureSensor[] | null>('/heating/temperature/sensors'),
      { intervalMs: POLL_SENSORS_EVERY_MS },
    );
  }
}

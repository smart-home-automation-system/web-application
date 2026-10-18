import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/**
 * One blind of `GET /home/blinds` (`blinds-service` 0.8.0). A field the service does not know is
 * left out - never answered as closed, zero or unreachable.
 */
export interface Blind {
  /** The id of the device registry. */
  readonly id?: number;
  readonly name?: string;
  readonly room?: string;
  readonly vendor?: string;
  readonly placement?: string;
  /** Whether it can be sent to a position. */
  readonly positioning?: boolean;
  /** `opened`, `closed`, `stopped`, `opening`, `closing`. */
  readonly state?: string;
  /** 0 closed ... 100 open; only for a blind that reports it. */
  readonly position?: number;
  /** House wall-clock time of its last movement. */
  readonly movedAt?: string;
  /** `dashboard`, `schedule`, `protection` or the device itself (`SHC`). */
  readonly source?: string;
  readonly reachable?: boolean;
  /** Its window by its own sensors: `closed`, `open`, `no sensor`, `unknown`. */
  readonly window?: string;
  /** House wall-clock time its schedules are paused since (HAS-232); left out while they are not. */
  readonly schedulePausedSince?: string;
}

/** The blinds of one room, as the service groups them. */
export interface RoomBlinds {
  readonly room?: string;
  readonly blinds?: readonly Blind[];
}

/** What a blind is asked to do. */
export type BlindCommand = 'open' | 'close' | 'stop';

// a blind takes up to a minute to move; its state comes from the devices as it goes
const POLL_EVERY_MS = 10_000;

/**
 * The blinds of `blinds-service`: their state and the commands. A command
 * answers when the device took it (202), never that the blind got there: the caller reads the
 * blinds again and shows what they report - no optimistic state.
 */
@Injectable({ providedIn: 'root' })
export class BlindsApi {
  private readonly api = inject(ApiClient);

  /** Every blind, by room. Call in an injection context: the polling lives as long as the caller. */
  watchBlinds(): PollingResource<readonly RoomBlinds[] | null> {
    return pollingResource(() => this.api.get<readonly RoomBlinds[] | null>('/blinds'), {
      intervalMs: POLL_EVERY_MS,
    });
  }

  move(id: number, command: BlindCommand): Observable<void> {
    return this.api
      .post<unknown>(`/blinds/${id}`, undefined, { command, source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** 0 closed ... 100 open; only a blind with `positioning`. */
  moveTo(id: number, position: number): Observable<void> {
    return this.api
      .post<unknown>(`/blinds/${id}/position`, undefined, { value: position, source: 'dashboard' })
      .pipe(map(() => undefined));
  }

  /** Every schedule of the blind holds back until the next run it would make (HAS-232). */
  pauseSchedules(id: number): Observable<void> {
    return this.api
      .put<unknown>(`/blinds/${id}/schedule-pause`, undefined)
      .pipe(map(() => undefined));
  }

  resumeSchedules(id: number): Observable<void> {
    return this.api.delete<unknown>(`/blinds/${id}/schedule-pause`).pipe(map(() => undefined));
  }
}

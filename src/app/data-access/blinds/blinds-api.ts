import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { toApiError } from '../../core/api/api-error';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { isRecord } from '../../core/util/is-record';
import { BlindSchedule, ScheduleEntry, ScheduleToday } from './blind-schedule';

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
  /** `open`, `closed`, `stopped`, `opening`, `closing` (`BlindState` of the service). */
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

/** One blind of a room command: `code` only for one that was skipped. */
export interface BlindOutcome {
  readonly id?: number;
  readonly name?: string;
  readonly code?: string;
}

/** The answer of a command for a room: the blinds it moved and those it skipped, with why. */
export interface RoomCommandReply {
  readonly room?: string;
  readonly command?: string;
  readonly moved?: readonly BlindOutcome[];
  readonly failed?: readonly BlindOutcome[];
}

// a blind takes up to a minute to move; its state comes from the devices as it goes
const POLL_EVERY_MS = 10_000;

// the engine of the schedules looks once a minute
const SCHEDULES_EVERY_MS = 60_000;

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

  /**
   * Every schedule with what the engine makes of it today (HAS-252): the list, then the day of
   * each, one call after the other. One resource, so the page tells one freshness and one failure
   * for the schedules; the day of one schedule that failed is told at that schedule
   * (`todayError`) and does not fail the list. `null` is a list answered without a body.
   */
  watchSchedules(): PollingResource<readonly ScheduleEntry[] | null> {
    return pollingResource(
      () =>
        this.api
          .get<readonly BlindSchedule[] | null>('/blinds/schedules')
          .pipe(
            concatMap((schedules) =>
              Array.isArray(schedules) ? this.withToday(schedules as unknown[]) : of(null),
            ),
          ),
      { intervalMs: SCHEDULES_EVERY_MS },
    );
  }

  /** Switches a schedule on or off; the rest of it stays as stored. */
  setScheduleEnabled(id: number, enabled: boolean): Observable<void> {
    return this.api
      .post<unknown>(`/blinds/schedules/${id}/${enabled ? 'enable' : 'disable'}`)
      .pipe(map(() => undefined));
  }

  /**
   * Every blind of a room, one after the other in the service. The answer says which of them did
   * not take the command (`failed`, each with its code) - what the command came to, not where
   * the blinds are: they are read again.
   */
  moveRoom(room: string, command: BlindCommand): Observable<readonly BlindOutcome[]> {
    return this.api
      .post<RoomCommandReply | null>(`/blinds/rooms/${encodeURIComponent(room)}`, undefined, {
        command,
        source: 'dashboard',
      })
      .pipe(map((reply) => (Array.isArray(reply?.failed) ? reply.failed : [])));
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

  // a schedule without an id cannot be asked about: it stays in the list without its day
  private withToday(schedules: readonly unknown[]): Observable<readonly ScheduleEntry[]> {
    return from(schedules.filter(isRecord) as BlindSchedule[]).pipe(
      concatMap((schedule) =>
        typeof schedule.id !== 'number'
          ? of<ScheduleEntry>({ schedule })
          : this.api.get<ScheduleToday | null>(`/blinds/schedules/${schedule.id}/today`).pipe(
              map((today): ScheduleEntry => (isRecord(today) ? { schedule, today } : { schedule })),
              catchError((failure: unknown) =>
                of<ScheduleEntry>({ schedule, todayError: toApiError(failure) }),
              ),
            ),
      ),
      toArray(),
    );
  }
}

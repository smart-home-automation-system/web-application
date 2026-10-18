import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Observable, catchError, concatMap, from, map, of, toArray } from 'rxjs';

import { DeviceCommands } from '../../core/api/device-commands';
import { isRecord } from '../../core/util/is-record';
import { ScheduleEntry } from '../../data-access/blinds/blind-schedule';
import { BlindCommand, BlindOutcome, BlindsApi } from '../../data-access/blinds/blinds-api';
import { CalendarApi, holidaysOf } from '../../data-access/calendar/calendar-api';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { FLOORS, OTHER_FLOOR } from '../../shared/floors/floors';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { AddressedBlind, BlindRoomCard, CardStatus, failureOf } from './blind-room-card';
import { ROOM_SCHEDULES_SIZE, RoomSchedules, RoomSchedulesData } from './room-schedules';

/** How far ahead the holidays are listed. */
export const HOLIDAYS_AHEAD_DAYS = 60;

/** A room that has blinds. */
export interface BlindRoom {
  readonly room: string;
  readonly blinds: readonly AddressedBlind[];
}

/** A floor of the house with the rooms on it that have blinds, in the order of the house. */
export interface BlindFloor {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly BlindRoom[];
}

/**
 * The blinds of the house (HAS-252, the administrator's; the layout is the owner's, 2026-10-18): at
 * the top the holidays the schedules count and the whole house at once, side by side; under them
 * the floors as on the devices page, each a row of **cards of one size**, one for every room that
 * has blinds. The schedules of a room are seen in a window of their own, from the button of its
 * card - the one place of the application that shows them.
 *
 * Three calls, each told once in the strip of sources at the top - the blinds, the schedules
 * (with the day of each, one resource) and the calendar - never on a card: the rule of the room
 * view. What a service did not answer is "not known".
 *
 * The protection against wind and frost and whether a move was confirmed come with HAS-249 and
 * HAS-250 of `blinds-service`; nothing here stands in for them until then.
 */
@Component({
  selector: 'app-blinds',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    TranslocoDirective,
    BlindRoomCard,
    DisplayTextPipe,
    HouseDateTimePipe,
    SourcesStrip,
  ],
  templateUrl: './blinds.html',
  styleUrl: './blinds.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  host: { '[style.--blind-lines]': 'blindLines()' },
})
export class Blinds {
  private readonly api = inject(BlindsApi);
  private readonly dialog = inject(MatDialog);
  protected readonly blinds = this.api.watchBlinds();
  protected readonly schedules = this.api.watchSchedules();
  protected readonly days = inject(CalendarApi).watchDays(HOLIDAYS_AHEAD_DAYS);

  protected readonly sources = [
    { id: 'blinds', label: 'blinds.sources.blinds' as MessageKey, resource: this.blinds },
    { id: 'schedules', label: 'blinds.sources.schedules' as MessageKey, resource: this.schedules },
    { id: 'calendar', label: 'blinds.sources.calendar' as MessageKey, resource: this.days },
  ];

  /**
   * The commands of the page - one per blind, per room and for the house at a time, whichever
   * card or window sends them.
   */
  protected readonly blindCommands = new DeviceCommands<number>();
  protected readonly roomCommands = new DeviceCommands<string, readonly BlindOutcome[]>();
  private readonly houseCommands = new DeviceCommands<'house', readonly BlindOutcome[]>();

  protected readonly HOLIDAYS_AHEAD_DAYS = HOLIDAYS_AHEAD_DAYS;
  protected readonly DAY_FORMAT: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  };

  // the cards are given these: each reads its service again after a command
  protected readonly refreshBlinds = () => this.blinds.refresh();
  private readonly refreshSchedules = () => this.schedules.refresh();

  /**
   * Every blind the page can address, in the order of the answer. Nothing checks an answer at
   * runtime: an entry that is not a blind with an id is passed over - a control needs the id.
   * `undefined` while the blinds have not answered with a list.
   */
  protected readonly all = computed(() => blindsOf(this.blinds.value()));

  /** The rooms with blinds by floor - a room without one is not shown (owner, 2026-10-18). */
  protected readonly floors = computed(() => floorsOf(this.all() ?? []));

  protected readonly rooms = computed(() => this.floors().flatMap((floor) => floor.rooms));

  /** Every card has room for as many blinds as the room with the most: the cards are of one size. */
  protected readonly blindLines = computed(() =>
    Math.max(1, ...this.rooms().map((room) => room.blinds.length)),
  );

  protected readonly entries = computed(() => {
    const answer = this.schedules.value();
    return Array.isArray(answer) ? answer : undefined;
  });

  protected readonly holidays = computed(() => holidaysOf(this.days.value()));

  protected readonly house = computed(() => this.houseCommands.stateOf('house'));

  /** A command for the house waits for every other command of the page, and they for it. */
  protected readonly houseBusy = computed(
    () =>
      this.house()?.sending === true ||
      this.rooms().some(
        (room) =>
          this.roomCommands.stateOf(room.room)?.sending ||
          room.blinds.some((blind) => this.blindCommands.stateOf(blind.id)?.sending),
      ),
  );

  /** What the last command for the house came to: its failure, or the blinds that did not take it. */
  protected readonly houseStatus = computed((): CardStatus | undefined => {
    const state = this.house();
    if (state?.error) {
      return { text: failureOf(state) };
    }
    const skipped = state?.answer ?? [];
    return skipped.length === 0
      ? undefined
      : {
          text: { key: 'blinds.house.skipped', params: { count: skipped.length } },
          about: skipped.map((one) => one.name ?? '?').join(', '),
        };
  });

  /** How many schedules move a blind of each room - once per answer, not per check of the view. */
  protected readonly schedulesCount = computed((): ReadonlyMap<string, number> | undefined => {
    const entries = this.entries();
    return entries === undefined
      ? undefined
      : new Map(this.rooms().map((room) => [room.room, schedulesOf(room, entries).length]));
  });

  /**
   * Every room with blinds, one after the other - the service has no command for the house. The
   * blinds a room skipped are told by their names; a room whose command failed by its own name.
   * The rooms after it are sent all the same.
   */
  protected moveHouse(command: BlindCommand): void {
    const rooms = this.rooms().map((room) => room.room);
    const call: Observable<readonly BlindOutcome[]> = from(rooms).pipe(
      concatMap((room) =>
        this.api.moveRoom(room, command).pipe(
          // the house names the room; its own command, from its card, tells why
          catchError(() => of([{ name: room }])),
        ),
      ),
      toArray(),
      map((outcomes) => outcomes.flat()),
    );
    this.houseCommands.send('house', call, this.refreshBlinds);
  }

  protected openSchedules(room: BlindRoom): void {
    const blinds = computed(
      () => this.rooms().find((one) => one.room === room.room)?.blinds ?? room.blinds,
    );
    const data: RoomSchedulesData = {
      room: room.room,
      // signals: the window follows the services while it is open
      blinds,
      entries: computed(() => {
        const entries = this.entries();
        return entries === undefined
          ? undefined
          : schedulesOf({ room: room.room, blinds: blinds() }, entries);
      }),
      commands: this.blindCommands,
      refreshBlinds: this.refreshBlinds,
      refreshSchedules: this.refreshSchedules,
    };
    this.dialog.open(RoomSchedules, { ...ROOM_SCHEDULES_SIZE, data, autoFocus: 'dialog' });
  }
}

/**
 * Every blind of an answer of `GET /blinds` that can be addressed, in its order. Nothing checks an
 * answer at runtime: an entry that is not a blind with an id is passed over - a control needs the
 * id. `undefined` for an answer that is not a list.
 */
export function blindsOf(answer: unknown): readonly AddressedBlind[] | undefined {
  if (!Array.isArray(answer)) {
    return undefined;
  }
  return (answer as unknown[]).filter(isRecord).flatMap((group) => {
    const list = group['blinds'];
    const room = typeof group['room'] === 'string' ? group['room'] : undefined;
    return (Array.isArray(list) ? (list as unknown[]) : [])
      .filter(
        (blind): blind is AddressedBlind =>
          isRecord(blind) && typeof blind['id'] === 'number' && Number.isFinite(blind['id']),
      )
      .map((blind) =>
        blind.room === undefined && room !== undefined ? { ...blind, room } : blind,
      );
  });
}

/** The rooms with blinds by floor, in the order of `FLOORS`; a room it does not know goes last. */
export function floorsOf(blinds: readonly AddressedBlind[]): readonly BlindFloor[] {
  const byRoom = new Map<string, AddressedBlind[]>();
  for (const blind of blinds) {
    const room = blind.room ?? '';
    byRoom.set(room, [...(byRoom.get(room) ?? []), blind]);
  }
  const roomsOf = (names: readonly string[]) =>
    names.flatMap((room) => {
      const here = byRoom.get(room);
      return here ? [{ room, blinds: here }] : [];
    });
  const placed = new Set(FLOORS.flatMap((floor) => floor.rooms));
  return [
    ...FLOORS.map(({ id, label, rooms }) => ({ id, label, rooms: roomsOf(rooms) })),
    { ...OTHER_FLOOR, rooms: roomsOf([...byRoom.keys()].filter((room) => !placed.has(room))) },
  ].filter((floor) => floor.rooms.length > 0);
}

/**
 * The schedules that move a blind of the room: by what the engine says it moves today, and while
 * that is not known by the targets as stored - the room itself, or one of its blinds.
 */
export function schedulesOf(
  room: BlindRoom,
  entries: readonly ScheduleEntry[],
): readonly ScheduleEntry[] {
  const ids = new Set(room.blinds.map((blind) => blind.id));
  const moves = (target: { readonly room?: string; readonly deviceId?: number }) =>
    target.room === room.room || (typeof target.deviceId === 'number' && ids.has(target.deviceId));
  return entries.filter((entry) => {
    const today = entry.today?.targets;
    const targets = Array.isArray(today) ? today : entry.schedule.targets;
    return (Array.isArray(targets) ? targets : []).some(moves);
  });
}

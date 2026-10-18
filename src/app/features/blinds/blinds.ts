import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { isRecord } from '../../core/util/is-record';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { CalendarApi, holidaysOf } from '../../data-access/calendar/calendar-api';
import { MessageKey } from '../../i18n/messages';
import { SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { FLOORS, OTHER_FLOOR } from '../../shared/floors/floors';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { AddressedBlind, BlindRoomCard } from './blind-room-card';
import { ScheduleCard } from './schedule-card';

/** How far ahead the holidays are listed. */
export const HOLIDAYS_AHEAD_DAYS = 60;

/** A room that has blinds, with the floor it lies on. */
export interface BlindRoom {
  readonly room: string;
  /** The key of the name of its floor. */
  readonly floor: MessageKey;
  readonly blinds: readonly AddressedBlind[];
}

/**
 * The blinds of the house (HAS-252, the administrator's): every blind, room by room and floor by
 * floor, with its state and controls; the schedules of the blinds - the one place they are shown
 * (owner, 2026-10-18) - with what each does today; and the holidays the schedules count as days
 * off.
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
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    BlindRoomCard,
    HouseDateTimePipe,
    ScheduleCard,
    SourcesStrip,
  ],
  templateUrl: './blinds.html',
  styleUrl: './blinds.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class Blinds {
  private readonly api = inject(BlindsApi);
  protected readonly blinds = this.api.watchBlinds();
  protected readonly schedules = this.api.watchSchedules();
  protected readonly days = inject(CalendarApi).watchDays(HOLIDAYS_AHEAD_DAYS);

  protected readonly sources = [
    { id: 'blinds', label: 'blinds.sources.blinds' as MessageKey, resource: this.blinds },
    { id: 'schedules', label: 'blinds.sources.schedules' as MessageKey, resource: this.schedules },
    { id: 'calendar', label: 'blinds.sources.calendar' as MessageKey, resource: this.days },
  ];

  protected readonly HOLIDAYS_AHEAD_DAYS = HOLIDAYS_AHEAD_DAYS;
  protected readonly DAY_FORMAT: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  };

  /** One command per blind at a time, whichever card sends it - a room card or a schedule. */
  protected readonly blindCommands = new DeviceCommands<number>();

  // the cards are given these: each reads its service again after a command
  protected readonly refreshBlinds = () => this.blinds.refresh();
  protected readonly refreshSchedules = () => this.schedules.refresh();

  /**
   * Every blind the page can address, in the order of the answer. Nothing checks an answer at
   * runtime: an entry that is not a blind with an id is passed over - a control needs the id.
   * `undefined` while the blinds have not answered with a list.
   */
  protected readonly all = computed((): readonly AddressedBlind[] | undefined => {
    const answer: unknown = this.blinds.value();
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
  });

  /**
   * The rooms that have blinds, floor by floor in the order of `FLOORS`; a room that list does
   * not know comes last, under "Other".
   */
  protected readonly rooms = computed(() => roomsByFloor(this.all() ?? []));

  protected readonly entries = computed(() => {
    const answer = this.schedules.value();
    return Array.isArray(answer) ? answer : undefined;
  });

  protected readonly holidays = computed(() => holidaysOf(this.days.value()));
}

/** The blinds by room, the rooms in the order of the floors of the house. */
export function roomsByFloor(blinds: readonly AddressedBlind[]): readonly BlindRoom[] {
  const byRoom = new Map<string, AddressedBlind[]>();
  for (const blind of blinds) {
    const room = blind.room ?? '';
    byRoom.set(room, [...(byRoom.get(room) ?? []), blind]);
  }
  const placed = new Set(FLOORS.flatMap((floor) => floor.rooms));
  const floors = [
    ...FLOORS,
    { ...OTHER_FLOOR, rooms: [...byRoom.keys()].filter((room) => !placed.has(room)) },
  ];
  return floors.flatMap(({ label, rooms }) =>
    rooms.flatMap((room) => {
      const here = byRoom.get(room);
      return here ? [{ room, floor: label, blinds: here }] : [];
    }),
  );
}

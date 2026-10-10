import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  heaterKindIcon,
  heaterKindLabel,
  heaterStateLabel,
} from '../../shared/room-heating/heater-labels';
import { HeaterWeek } from '../../shared/room-heating/heater-week';
import { RoomView, SchedulePeriod, toRoomViews } from '../../shared/room-heating/room-views';
import { groupByFloor } from './floors';
import { RoomHistory } from './room-history';

/**
 * The rooms of the house, floor by floor: per room its temperature with the age of the reading,
 * the temperature its schedule asks for right now, and each heater with what its relay last
 * reported. A room opens in place into the history of its temperature and the week of its
 * heaters, read-only.
 *
 * One call feeds all of it, so it is one card: the freshness and a failure are told once. The
 * freshness is that of the call - the service answers from its memory, which is why every
 * reading and every relay report is shown with its own age. What the service has not measured,
 * heard from a relay or decided yet is said to be unknown, never drawn as cold or off: right
 * after a start of the service most rooms have a temperature and nothing else.
 */
@Component({
  selector: 'app-heating-rooms',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    LocalNumberPipe,
    HeaterWeek,
    RoomHistory,
  ],
  templateUrl: './rooms.html',
  styleUrl: './rooms.scss',
  // a card is rows of several pieces of text side by side: stripped of the white space between
  // them a screen reader and the clipboard get "heatingCalls for heat"
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rooms {
  protected readonly rooms = inject(HeatingApi).watchRooms();

  protected readonly floors = computed(() => groupByFloor(toRoomViews(this.rooms.value())));

  /** Whether the answer is a list at all: a 200 without a body is not "no rooms". */
  protected readonly listed = computed(() => Array.isArray(this.rooms.value()));

  /** The identifier of the room whose week is shown; one at a time. */
  protected readonly open = signal<string | undefined>(undefined);

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly TARGET: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

  protected toggle(room: string): void {
    this.open.update((current) => (current === room ? undefined : room));
  }

  private readonly schedules = new Map<
    string,
    { readonly key: string; readonly periods: readonly (readonly SchedulePeriod[])[] }
  >();

  /**
   * The periods of every heater of the room, for the schedule line of its history. **The same
   * list for as long as the schedules are the same**: the rooms are read anew with every poll,
   * and a list made anew each time would have the chart drawn again every half minute, under
   * the hand of whoever reads a value off it.
   */
  protected schedulesOf(room: RoomView): readonly (readonly SchedulePeriod[])[] {
    const periods = (room.heaters ?? []).map((heater) => heater.periods ?? []);
    const key = JSON.stringify(periods);
    const kept = this.schedules.get(room.name);
    if (kept?.key === key) {
      return kept.periods;
    }
    this.schedules.set(room.name, { key, periods });
    return periods;
  }

  protected readonly kindLabel = heaterKindLabel;
  protected readonly kindIcon = heaterKindIcon;
  protected readonly stateLabel = heaterStateLabel;

  /**
   * An address inside the page for the panel of a room. By its place, not by its name: a name
   * is text from outside, and two rooms may share one.
   */
  protected panelId(floor: string, index: number): string {
    return `room-panel-${floor}-${index}`;
  }
}

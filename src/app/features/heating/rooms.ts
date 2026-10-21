import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  heaterKindIcon,
  heaterKindLabel,
  heaterState,
  heaterStateLabel,
} from '../../shared/room-heating/heater-labels';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { windowStateIcon, windowStateLabel } from '../../shared/room-heating/window-labels';
import { groupByFloor } from './floors';
import {
  ROOM_SCHEDULE_DIALOG_SIZE,
  RoomScheduleDialog,
  RoomScheduleDialogData,
} from './room-schedule-dialog';

/**
 * The rooms of the house, floor by floor as on the devices page: a tile of one size per room
 * (owner, 2026-10-21, HAS-266) - its temperature with the age of the reading, the temperature
 * its schedule asks for right now, each heater with what its relay last reported, its windows -
 * and a button that opens the schedule of the room in a window.
 *
 * One call feeds all of it, so it is one card: the freshness and a failure are told once. The
 * freshness is that of the call - the service answers from its memory, which is why every
 * reading is shown with its own age. What the service has not measured, heard from a relay or
 * decided yet is said to be unknown, never drawn as cold or off.
 */
@Component({
  selector: 'app-heating-rooms',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    LocalNumberPipe,
  ],
  templateUrl: './rooms.html',
  styleUrl: './rooms.scss',
  // a tile is rows of several pieces of text side by side: stripped of the white space between
  // them a screen reader and the clipboard get "heatingCalls for heat"
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rooms {
  protected readonly rooms = inject(HeatingApi).watchRooms();
  private readonly dialog = inject(MatDialog);

  private readonly views = computed(() => toRoomViews(this.rooms.value()));
  protected readonly floors = computed(() => groupByFloor(this.views()));

  /** Whether the answer is a list at all: a 200 without a body is not "no rooms". */
  protected readonly listed = computed(() => Array.isArray(this.rooms.value()));

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly TARGET: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

  protected readonly kindLabel = heaterKindLabel;
  protected readonly kindIcon = heaterKindIcon;
  protected readonly state = heaterState;
  protected readonly stateLabel = heaterStateLabel;
  protected readonly windowIcon = windowStateIcon;
  protected readonly windowLabel = windowStateLabel;

  /** The schedule of a room, in a window that follows the polled rooms. */
  protected openSchedule(name: string, floor: MessageKey): void {
    const data: RoomScheduleDialogData = {
      name,
      floor,
      rooms: this.rooms,
      room: computed(() => this.views().find((room) => room.name === name)),
    };
    this.dialog.open(RoomScheduleDialog, {
      ...ROOM_SCHEDULE_DIALOG_SIZE,
      data,
      autoFocus: 'dialog',
    });
  }
}

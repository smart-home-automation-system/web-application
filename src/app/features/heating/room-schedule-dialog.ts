import { ChangeDetectionStrategy, Component, Signal, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { PollingResource } from '../../core/api/polling-resource';
import { Room } from '../../data-access/heating/heating-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { heaterKindLabel, heaterStateLabel } from '../../shared/room-heating/heater-labels';
import { HeaterWeek } from '../../shared/room-heating/heater-week';
import { RoomView, SchedulePeriod } from '../../shared/room-heating/room-views';
import { RoomHistory } from './room-history';

/** What the window of a room is opened with: signals, so that it follows the polled rooms. */
export interface RoomScheduleDialogData {
  /** The room as the last answer has it; `undefined` once the answer no longer lists it. */
  readonly room: Signal<RoomView | undefined>;
  /** The identifier of the room, which the window is about even while the answer lacks it. */
  readonly name: string;
  readonly floor: MessageKey;
  readonly rooms: PollingResource<readonly Room[] | null>;
}

/** One size for every room: the history and the weeks scroll inside it. */
export const ROOM_SCHEDULE_DIALOG_SIZE = {
  width: 'min(960px, calc(100vw - 32px))',
  maxWidth: '100vw',
  maxHeight: 'calc(100dvh - 48px)',
} as const;

/**
 * The schedule of one room (owner, 2026-10-21, HAS-266): the week of each of its heaters and the
 * history of its temperature with the schedule laid over it. Read-only - `heating-service` takes
 * no change to a schedule yet, and the window says so.
 */
@Component({
  selector: 'app-room-schedule-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    HeaterWeek,
    RoomHistory,
  ],
  templateUrl: './room-schedule-dialog.html',
  styleUrl: './room-schedule-dialog.scss',
  // "Radiator · heating · reported 4 min ago" are pieces side by side
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomScheduleDialog {
  protected readonly data = inject<RoomScheduleDialogData>(MAT_DIALOG_DATA);

  /**
   * The periods of every heater, for the schedule line of the history. **The same list for as
   * long as the schedules are the same**: the rooms are read anew with every poll, and a list
   * made anew each time would have the chart drawn again every half minute, under the hand of
   * whoever reads a value off it.
   */
  protected readonly schedules = computed<readonly (readonly SchedulePeriod[])[]>(
    () => (this.data.room()?.heaters ?? []).map((heater) => heater.periods ?? []),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  protected readonly kindLabel = heaterKindLabel;
  protected readonly stateLabel = heaterStateLabel;
}

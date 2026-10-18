import { ChangeDetectionStrategy, Component, Signal, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';

import { DeviceCommands } from '../../core/api/device-commands';
import { ScheduleEntry } from '../../data-access/blinds/blind-schedule';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { doorsFirst, shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { AddressedBlind, failureOf } from './blind-room-card';
import { ScheduleCard } from './schedule-card';

/** What the window of the schedules of a room is opened with: signals, so that it follows the services. */
export interface RoomSchedulesData {
  readonly room: string;
  /** The blinds of the room. */
  readonly blinds: Signal<readonly AddressedBlind[]>;
  /** The schedules that move a blind of the room; `undefined` while the service has not said. */
  readonly entries: Signal<readonly ScheduleEntry[] | undefined>;
  /** The commands to the blinds, the page's: one per blind at a time, from the card or from here. */
  readonly commands: DeviceCommands<number>;
  readonly refreshBlinds: () => Promise<void>;
  readonly refreshSchedules: () => Promise<void>;
}

/** The size of the window: the one of the window of a room on the devices and rooms pages. */
export const ROOM_SCHEDULES_SIZE = {
  width: 'min(760px, calc(100vw - 32px))',
  height: 'min(760px, calc(100dvh - 48px))',
  maxWidth: '100vw',
} as const;

/**
 * The schedules of one room in a window of their own (owner, 2026-10-18: they are seen only after
 * the button of the room is pressed). At the top the pause of each blind of the room - every
 * schedule of that blind holds back until the next run it would make (HAS-232) - then a card per
 * schedule that moves a blind of the room, with the switch of the schedule.
 *
 * The pause does not flip itself either: the blinds and then the schedules are read again, and
 * only their answer moves it.
 */
@Component({
  selector: 'app-room-schedules',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSlideToggleModule,
    RouterLink,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    ScheduleCard,
  ],
  templateUrl: './room-schedules.html',
  styleUrl: './room-schedules.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class RoomSchedules {
  protected readonly data = inject<RoomSchedulesData>(MAT_DIALOG_DATA);
  private readonly api = inject(BlindsApi);

  constructor() {
    // a link of the window leads to the editor of a schedule (HAS-253): the window goes with it -
    // a dialog stays over whatever page comes next otherwise
    const window = inject(MatDialogRef);
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => window.close());
  }

  protected readonly failureOf = failureOf;

  protected nameOf(blind: AddressedBlind): string | undefined {
    return shortName(blind.name, this.data.room, 'blinds');
  }

  protected sorted(): readonly AddressedBlind[] {
    return [...this.data.blinds()].sort(doorsFirst);
  }

  protected stateOf(id: number) {
    return this.data.commands.stateOf(id);
  }

  /** A click asks for the other state; the blinds, then the schedules, are read again. */
  protected pause(blind: AddressedBlind): void {
    const call =
      blind.schedulePausedSince === undefined
        ? this.api.pauseSchedules(blind.id)
        : this.api.resumeSchedules(blind.id);
    this.data.commands.send(blind.id, call, () =>
      this.data.refreshBlinds().then(() => this.data.refreshSchedules()),
    );
  }
}

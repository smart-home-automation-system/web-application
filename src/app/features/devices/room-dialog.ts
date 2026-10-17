import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceRegistry, SmartDevice } from '../../data-access/devices/device-registry-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { RoomDevices as RoomGroup } from './device-groups';
import { RoomDevices } from './room-devices';

/** What the window of a room is opened with: signals, so that it follows the registry. */
export interface RoomDialogData {
  /** The room and its devices, as the registry has them now. */
  readonly group: Signal<RoomGroup>;
  /** False while the registry answers with no list: then nothing is known of the room. */
  readonly readable: Signal<boolean>;
  /** The key of the name of the floor the room lies on. */
  readonly floor: MessageKey;
  /** Everything the registry answered: what a binding must not repeat. */
  readonly all: Signal<readonly SmartDevice[]>;
  readonly registry: DeviceRegistry;
  /** Opened with "Add" of the card: the form of a new device is open from the start. */
  readonly startAdding: boolean;
}

/** The size of the window, the same for every room (owner, 2026-10-17): the list scrolls in it. */
export const ROOM_DIALOG_SIZE = {
  width: 'min(760px, calc(100vw - 32px))',
  height: 'min(760px, calc(100dvh - 48px))',
  maxWidth: '100vw',
} as const;

/**
 * The devices of one room in a window of their own (HAS-290): the list, the forms and the
 * questions of `RoomDevices`, which change the registry as they did on the page. The window
 * follows the registry - a device moved to another room leaves it - and closes only when asked.
 */
@Component({
  selector: 'app-room-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    RoomDevices,
  ],
  templateUrl: './room-dialog.html',
  styleUrl: './room-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDialog {
  protected readonly data = inject<RoomDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef);
  private readonly room = viewChild(RoomDevices);

  constructor() {
    // Escape and a click beside the window close it only while nothing is open in it: a form
    // would lose what was typed, a change on its way the place its failure is told
    effect(() => {
      this.dialogRef.disableClose = this.room()?.holding() ?? false;
    });
  }
}

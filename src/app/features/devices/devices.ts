import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { isRecord } from '../../core/util/is-record';
import {
  DeviceRegistryApi,
  RegisteredDevice,
  SmartDevice,
} from '../../data-access/devices/device-registry-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { RoomDevices as RoomGroup, groupByFloor } from './device-groups';
import { RoomCard } from './room-card';
import { ROOM_DIALOG_SIZE, RoomDialog, RoomDialogData } from './room-dialog';

/**
 * The administration of the device registry: every device `database-service` holds for the
 * house - blinds, lights, sensors, whatever their vendor - with its room, its kind and the
 * way it is reached, and the one place of the application that changes that registry.
 *
 * **The administrator's page** (its route says nothing about access, which means exactly
 * that). Like the roles themselves this is navigation, not access control: the registry
 * answers whoever reaches the gateway.
 *
 * The registry is what the services read to know their devices, and - for an Eaton device -
 * what `amx-service` asks with every datagram of its point: a change here takes effect in the
 * house, which is why nothing is changed without a form or a question.
 *
 * **A room is a card of one size, a floor a row of them** (owner, 2026-10-17, HAS-290): the card
 * counts the devices of its room by kind; the devices, and every change of them - adding one
 * included - are in a window of one size for every room (`RoomDialog`). Every room of the
 * house has its card, an empty one too: that is where a device is added to it.
 */
@Component({
  selector: 'app-devices',
  imports: [
    MatCardModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    RoomCard,
  ],
  templateUrl: './devices.html',
  styleUrl: './devices.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Devices {
  protected readonly registry = inject(DeviceRegistryApi).watchDevices();

  /**
   * What the registry answered, or `undefined` when the answer is not a list. Every entry that
   * is an object, shown or not: a binding one of them holds is taken.
   */
  protected readonly entries = computed((): readonly SmartDevice[] | undefined => {
    const answer: unknown = this.registry.value();
    return Array.isArray(answer)
      ? (answer as unknown[]).filter((entry): entry is SmartDevice => isRecord(entry))
      : undefined;
  });

  /**
   * The devices that can be shown. Nothing checks an answer at runtime: an entry without an
   * id cannot be addressed, so it gets no row with the buttons that would address it - it is
   * counted instead (`skipped`), not dropped without a word.
   */
  protected readonly devices = computed((): readonly RegisteredDevice[] | undefined =>
    this.entries()?.filter(
      (entry): entry is RegisteredDevice =>
        typeof entry.id === 'number' && Number.isFinite(entry.id),
    ),
  );

  /** How many entries of the answer are not shown, for want of an id. */
  protected readonly skipped = computed(() => {
    const answer: unknown = this.registry.value();
    return Array.isArray(answer) ? answer.length - (this.devices()?.length ?? 0) : 0;
  });

  protected readonly floors = computed(() => groupByFloor(this.devices() ?? []));

  private readonly dialog = inject(MatDialog);

  /**
   * The window of a room. It is given signals, not values: the registry is read again after every
   * change, and the window shows the room as it is then - a room the registry no longer has a
   * device in is still the room, with none.
   */
  protected openRoom(room: string, floor: MessageKey, startAdding: boolean): void {
    const group = computed(
      (): RoomGroup =>
        this.floors()
          .flatMap((one) => one.rooms)
          .find((one) => one.room === room) ?? { room, devices: [] },
    );
    const data: RoomDialogData = {
      group,
      readable: computed(() => this.devices() !== undefined),
      floor,
      all: computed(() => this.entries() ?? []),
      registry: this.registry,
      startAdding,
    };
    this.dialog.open(RoomDialog, {
      ...ROOM_DIALOG_SIZE,
      data,
      autoFocus: startAdding ? 'first-tabbable' : 'dialog',
    });
  }
}

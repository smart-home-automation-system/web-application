import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { isRecord } from '../../core/util/is-record';
import { DeviceRegistryApi, SmartDevice } from '../../data-access/devices/device-registry-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { MessageKey } from '../../i18n/messages';

/** The kinds of the card, in its order, each with the words of its group. */
const GROUPS: readonly {
  readonly kind: string;
  readonly title: MessageKey;
  readonly icon: string;
}[] = [
  { kind: 'motion sensor', title: 'rooms.row.motion', icon: 'motion_sensor_active' },
  { kind: 'presence sensor', title: 'rooms.row.presence', icon: 'person' },
];

/**
 * The motion and presence sensors of one room on "My room" (HAS-254), read only: what the device
 * registry places in the room. **What they sense is kept by no service yet**, so each is listed
 * with its state "not known yet" - never as "nobody there". The presence sensors are what they
 * sense, never who of the household is at home (that is the presence page).
 *
 * No card for a room without such a sensor - also while the first answer is on its way; a failure
 * before any answer is told. A switched-off sensor is left out (the registry is asked for the
 * switched-on devices of the room only).
 */
@Component({
  selector: 'app-room-sensors',
  imports: [MatCardModule, MatIconModule, TranslocoDirective, ApiErrorStrip, DataFreshness],
  templateUrl: './room-sensors.html',
  styleUrl: './room-sensors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomSensors {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  protected readonly answer = inject(DeviceRegistryApi).watchRoom(() => this.room());

  /** The groups that have a sensor; `undefined` while the registry has not answered with a list. */
  protected readonly groups = computed(() => {
    const answer: unknown = this.answer.value();
    if (!Array.isArray(answer)) {
      return undefined;
    }
    const devices = (answer as unknown[]).filter(isRecord) as SmartDevice[];
    return GROUPS.map((group) => ({
      ...group,
      // the room the registry was asked for, checked again: an answer is not checked at runtime
      sensors: devices.filter(
        (device) =>
          device.kind === group.kind && device.room === this.room() && device.enabled !== false,
      ),
    })).filter((group) => group.sensors.length > 0);
  });

  protected readonly shown = computed(() => {
    const groups = this.groups();
    return groups === undefined ? this.answer.error() !== undefined : groups.length > 0;
  });
}

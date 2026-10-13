import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { isRecord } from '../../core/util/is-record';
import {
  DeviceDetails,
  DeviceRegistryApi,
  RegisteredDevice,
  SmartDevice,
} from '../../data-access/devices/device-registry-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { groupByFloor } from './device-groups';
import { RoomDevices } from './room-devices';
import { SmartDeviceForm } from './smart-device-form';

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
 */
@Component({
  selector: 'app-devices',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    RoomDevices,
    SmartDeviceForm,
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

  protected readonly adding = signal(false);
  /** Why the device of the form was not added. */
  protected readonly addFailure = signal<ApiError | undefined>(undefined);

  protected startAdding(): void {
    this.addFailure.set(undefined);
    this.adding.set(true);
  }

  protected stopAdding(): void {
    this.addFailure.set(undefined);
    this.adding.set(false);
  }

  protected async add(details: DeviceDetails): Promise<void> {
    this.addFailure.set(undefined);
    const outcome = await this.registry.add(details);
    if (outcome.carriedOut) {
      this.adding.set(false);
    } else {
      this.addFailure.set(outcome.failure);
    }
  }
}

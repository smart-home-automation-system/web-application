import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { isRecord } from '../../core/util/is-record';
import { DeviceRegistryApi, SmartDevice } from '../../data-access/devices/device-registry-api';
import { LightApi, Occupancy, OccupancySensor } from '../../data-access/light/light-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import {
  OCCUPANCY_LABELS,
  illuminationText,
  isLux,
  occupancyOf,
} from '../../shared/lights/light-labels';
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
 * What one sensor of the registry last reported, as the occupancy of `light-service` has it:
 * `pending` while the service has not answered for the room, `unreported` when its answer does not
 * name the sensor - never read as silent or unreachable.
 */
interface SensorReport {
  readonly kind: 'pending' | 'unreported' | 'reported';
  readonly lastReportAt?: string;
  readonly reachable?: boolean;
}

/**
 * The motion and presence sensors of one room on "My room" (HAS-254, HAS-369): the registry says
 * which sensors the room has (names, kinds; a switched-off one left out), the occupancy of
 * `light-service` what they sense - the room occupied, empty or not known, its motion and light, and
 * per sensor when it was last heard and whether it is reachable. **Missing is never off**: a room
 * the service says nothing of is "not known", a sensor it does not name is "not reported". The
 * presence sensors are what they sense, never who of the household is at home.
 *
 * Two calls, each with its freshness and its failure on the card. No card for a room without such a
 * sensor - also while the registry's first answer is on its way; a failure of the registry before
 * any answer is told, since nobody knows then whether the room has any.
 */
@Component({
  selector: 'app-room-sensors',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    HouseAgePipe,
  ],
  templateUrl: './room-sensors.html',
  styleUrl: './room-sensors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class RoomSensors {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  protected readonly answer = inject(DeviceRegistryApi).watchRoom(() => this.room());
  protected readonly occupancyAnswer = inject(LightApi).watchOccupancy(() => this.room());

  protected readonly OCCUPANCY_LABELS = OCCUPANCY_LABELS;
  protected readonly illuminationText = illuminationText;
  protected readonly isLux = isLux;

  /** The occupancy of the room; `undefined` while the service has not answered for this room. */
  protected readonly occupancy = computed((): Occupancy | undefined => {
    const answer: unknown = this.occupancyAnswer.value();
    if (!isRecord(answer)) {
      return undefined;
    }
    const occupancy = answer as Occupancy;
    // the room the service was asked for, checked again: an answer is not checked at runtime
    return occupancy.room === undefined || occupancy.room === this.room() ? occupancy : undefined;
  });
  protected readonly occupancyState = computed(() => occupancyOf(this.occupancy()));

  /** What the service reported of each sensor, by its registry id. */
  private readonly reports = computed((): ReadonlyMap<number, OccupancySensor> | undefined => {
    const sensors: unknown = this.occupancy()?.sensors;
    if (!Array.isArray(sensors)) {
      return undefined;
    }
    const known = (sensors as unknown[]).filter(isRecord) as OccupancySensor[];
    return new Map(
      known.flatMap((sensor) =>
        typeof sensor.id === 'number' ? [[sensor.id, sensor] as const] : [],
      ),
    );
  });

  /** The groups that have a sensor; `undefined` while the registry has not answered with a list. */
  protected readonly groups = computed(() => {
    const answer: unknown = this.answer.value();
    if (!Array.isArray(answer)) {
      return undefined;
    }
    const devices = (answer as unknown[]).filter(isRecord) as SmartDevice[];
    const reports = this.reports();
    return GROUPS.map((group) => ({
      ...group,
      // the room the registry was asked for, checked again: an answer is not checked at runtime
      sensors: devices
        .filter(
          (device) =>
            device.kind === group.kind && device.room === this.room() && device.enabled !== false,
        )
        .map((device) => ({ device, report: reportOf(device, reports) })),
    })).filter((group) => group.sensors.length > 0);
  });

  protected readonly shown = computed(() => {
    const groups = this.groups();
    return groups === undefined ? this.answer.error() !== undefined : groups.length > 0;
  });
}

function reportOf(
  device: SmartDevice,
  reports: ReadonlyMap<number, OccupancySensor> | undefined,
): SensorReport {
  if (reports === undefined) {
    return { kind: 'pending' };
  }
  const sensor = device.id === undefined ? undefined : reports.get(device.id);
  return sensor === undefined
    ? { kind: 'unreported' }
    : { kind: 'reported', lastReportAt: sensor.lastReportAt, reachable: sensor.reachable };
}

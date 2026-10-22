import { ChangeDetectionStrategy, Component, Signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';

import { DeviceCommands } from '../../core/api/device-commands';
import { Occupancy, RoomRule } from '../../data-access/light/light-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LightControl } from '../../shared/lights/light-control';
import {
  OCCUPANCY_LABELS,
  illuminationText,
  isLux,
  occupancyOf,
  sensorKindText,
} from '../../shared/lights/light-labels';
import { ROOM_DETAIL_SIZE } from '../rooms/room-detail';
import { AddressedLight } from './light-rooms';
import { periodText } from './rule-summary';
import { RuleRuns } from './rule-runs';

/** What the window of a room is opened with: signals, so that it follows the service. */
export interface LightRoomWindowData {
  readonly room: string;
  readonly lights: Signal<readonly AddressedLight[]>;
  readonly occupancy: Signal<Occupancy | undefined>;
  /** `undefined` while the rules are not known; `{ rule: undefined }` when the room has none. */
  readonly rule: Signal<{ readonly rule?: RoomRule } | undefined>;
  /** The commands to the lights, the page's: one per light at a time, from the card or from here. */
  readonly commands: DeviceCommands<number>;
  /** Whether a command for the whole room is on its way: the lights wait for it, from here too. */
  readonly roomBusy: Signal<boolean>;
  readonly refresh: () => Promise<void>;
}

/** The size of the window: the one of the window of a room on the rooms page. */
export const LIGHT_ROOM_WINDOW_SIZE = ROOM_DETAIL_SIZE;

/**
 * One room of the lights page in a window of its own (HAS-266): every light with what the card has
 * no room for - the shared `LightControl` of My room (HAS-268): when it changed and by whom, the
 * manual hold, the brightness of a light that dims and the colour of an rgbw light - then the sensors
 * of the room, its rule as stored and what the engine sent there in the last 24 hours.
 *
 * The rule is written by its editor (HAS-267), a page of its own: the button of the rule leads there,
 * and the window **closes itself on `NavigationStart`** - a dialog stays over the next page otherwise.
 */
@Component({
  selector: 'app-light-room-window',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    RouterLink,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    LightControl,
    RuleRuns,
  ],
  templateUrl: './light-room-window.html',
  styleUrl: './light-room-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class LightRoomWindow {
  protected readonly data = inject<LightRoomWindowData>(MAT_DIALOG_DATA);

  constructor() {
    const window = inject(MatDialogRef);
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => window.close());
  }

  protected readonly OCCUPANCY_LABELS = OCCUPANCY_LABELS;
  protected readonly illuminationText = illuminationText;
  protected readonly sensorKindText = sensorKindText;
  protected readonly periodText = periodText;
  protected readonly isLux = isLux;

  protected readonly shown = computed(() =>
    [...this.data.lights()]
      .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
      .map((light) => ({ light, name: shortName(light.name, this.data.room, 'light') })),
  );

  /** The names of the lights of the room by their id, for the runs. */
  protected readonly names = computed(
    () => new Map(this.shown().map(({ light, name }) => [light.id, name ?? light.name])),
  );

  protected readonly occupancyState = computed(() => occupancyOf(this.data.occupancy()));

  protected readonly sensors = computed(() => {
    const sensors = this.data.occupancy()?.sensors;
    return Array.isArray(sensors) ? sensors : [];
  });

  /** The address of the editor of the rule of the room. */
  protected readonly editor = ['/lights/rooms', this.data.room, 'rules'];
}

import { ChangeDetectionStrategy, Component, Signal, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { PollingResource } from '../../core/api/polling-resource';
import { TemperatureSensor } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { SensorRow } from './sensor-rows';

/** What the window of the sensors is opened with: the call of the page, so that it follows it. */
export interface SensorsDialogData {
  readonly sensors: PollingResource<readonly TemperatureSensor[] | null>;
  readonly rows: Signal<readonly SensorRow[]>;
}

export const SENSORS_DIALOG_SIZE = {
  width: 'min(640px, calc(100vw - 32px))',
  maxWidth: '100vw',
  maxHeight: 'calc(100dvh - 48px)',
} as const;

/**
 * Every temperature sensor of the heating (owner, 2026-10-21, HAS-266): which room last reported
 * when, which sensor fell silent and which is left out of the alerts. The card of the page only
 * says whether all of them report; this window is the list it had before.
 */
@Component({
  selector: 'app-sensors-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './sensors-dialog.html',
  styleUrl: './sensors-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SensorsDialog {
  protected readonly data = inject<SensorsDialogData>(MAT_DIALOG_DATA);
}

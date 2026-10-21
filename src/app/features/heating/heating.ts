import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HeatingSwitch } from '../../shared/heating-switch/heating-switch';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { SignalLight } from '../../shared/signal-light/signal-light';
import { Rooms } from './rooms';
import { SENSORS_DIALOG_SIZE, SensorsDialog, SensorsDialogData } from './sensors-dialog';
import { summarise, toSensorRows } from './sensor-rows';

/**
 * Heating: a row of four cards - the switch of the whole system, whether any room is being
 * heated right now, the pump of the floor heating and whether every temperature sensor reports
 * (a red light when one is silent; the list of them in a window) - and the rooms under them, a
 * tile of one size per room, floor by floor, with the window of its schedule (owner, 2026-10-21).
 *
 * Five calls feed the page, and each has one card: its freshness and its failure are told once.
 * The switch is the one thing here that changes the house; it is a card shared with other views
 * (`shared/heating-switch`).
 */
@Component({
  selector: 'app-heating',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HeatingSwitch,
    HouseAgePipe,
    Rooms,
    SignalLight,
  ],
  templateUrl: './heating.html',
  styleUrl: './heating.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Heating {
  private readonly api = inject(HeatingApi);
  private readonly dialog = inject(MatDialog);
  protected readonly heating = this.api.watchSwitch();
  protected readonly activity = this.api.watchActivity();
  protected readonly sensors = this.api.watchSensors();
  protected readonly pump = this.api.watchFloorPump();

  /** True, false, or `undefined` until the relay of the pump has answered - never "stopped". */
  protected readonly pumpRunning = computed(() => {
    const working: unknown = this.pump.value()?.working;
    return typeof working === 'boolean' ? working : undefined;
  });

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingRooms = computed(() => {
    const active: unknown = this.activity.value()?.active;
    return typeof active === 'boolean' ? active : undefined;
  });

  protected readonly rows = computed(() => toSensorRows(this.sensors.value()));
  protected readonly summary = computed(() => summarise(this.rows()));

  /** The list of every sensor, in a window that follows the call of the page. */
  protected openSensors(): void {
    const data: SensorsDialogData = { sensors: this.sensors, rows: this.rows };
    this.dialog.open(SensorsDialog, { ...SENSORS_DIALOG_SIZE, data, autoFocus: 'dialog' });
  }

  constructor() {
    // "Rooms are being heated" depends on the switch: left to its own interval, the card next
    // to a switch that was just turned would contradict it for half a minute.
    let switching = false;
    effect(() => {
      const before = switching;
      switching = this.heating.switching();
      if (before && !switching) {
        void this.activity.refresh();
      }
    });
  }
}

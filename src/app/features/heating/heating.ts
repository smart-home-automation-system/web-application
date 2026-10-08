import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HeatingSwitch } from '../../shared/heating-switch/heating-switch';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { summarise, toSensorRows } from './sensor-rows';

/**
 * Heating: the switch of the whole system, whether any room is being heated right now, and the
 * health of the temperature sensors - which room last reported when, which sensor fell silent
 * and which is left out of the alerts.
 *
 * Three calls feed the page, and each has one card: its freshness and its failure are told once.
 * The switch is the one thing here that changes the house; it is a card shared with other views
 * (`shared/heating-switch`).
 */
@Component({
  selector: 'app-heating',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HeatingSwitch,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './heating.html',
  styleUrl: './heating.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Heating {
  private readonly api = inject(HeatingApi);
  protected readonly heating = this.api.watchSwitch();
  protected readonly activity = this.api.watchActivity();
  protected readonly sensors = this.api.watchSensors();

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingRooms = computed(() => {
    const active: unknown = this.activity.value()?.active;
    return typeof active === 'boolean' ? active : undefined;
  });

  protected readonly rows = computed(() => toSensorRows(this.sensors.value()));
  protected readonly summary = computed(() => summarise(this.rows()));

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

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import { HOT_WATER_BAND, WaterApi } from '../../data-access/water/water-api';
import { isOutOfDate, toWaterReading } from '../../data-access/water/water-reading';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { TemperatureGauge } from './temperature-gauge';
import { WaterHistory } from './water-history';

/**
 * Hot water: the temperature of the water in the tank on a gauge with the band it is kept in,
 * the temperature of the circulation, whether the water asks to be heated, and the history of
 * both temperatures. Read-only - the backend has nothing to set here.
 *
 * Three calls feed the page, and each has one card: its freshness and its failure are told
 * once. They come from the same service, but one can be answered while another is not.
 *
 * The freshness of a card is that of its call. For the temperatures that is not the age of the
 * reading: the service repeats its last row for as long as the sensor is silent, so the card
 * says when the sensors were read (`measuredAt`) and calls the reading out of date once two
 * polls of the service were missed. An answer without that time - an older `water-service` -
 * gets neither.
 */
@Component({
  selector: 'app-hot-water',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    LocalNumberPipe,
    TemperatureGauge,
    WaterHistory,
  ],
  templateUrl: './hot-water.html',
  styleUrl: './hot-water.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotWater {
  private readonly api = inject(WaterApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  protected readonly temperatures = this.api.watchTemperatures();
  protected readonly demand = this.api.watchHeatingDemand();
  protected readonly band = HOT_WATER_BAND;
  protected readonly oneDecimal: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  private readonly reading = computed(() => toWaterReading(this.temperatures.value(), this.zone));
  protected readonly tank = computed(() => this.reading().tank);
  protected readonly circulation = computed(() => this.reading().circulation);
  /** House wall-clock time the sensors were read; `undefined` when the answer does not say. */
  protected readonly measuredAt = computed(() => this.reading().measuredAt);
  /** The service has missed two of its polls: the card shows its last row, not the water as it is. */
  protected readonly outOfDate = computed(() => isOutOfDate(this.reading(), this.ticker.now()));

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingNeeded = computed(() => {
    const active: unknown = this.demand.value()?.active;
    return typeof active === 'boolean' ? active : undefined;
  });
}

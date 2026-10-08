import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HOT_WATER_BAND, WaterApi } from '../../data-access/water/water-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { TemperatureGauge } from './temperature-gauge';

/**
 * Hot water: the temperature of the water in the tank on a gauge with the band it is kept in,
 * the temperature of the circulation, and whether the water asks to be heated. Read-only - the
 * backend has nothing to set here.
 *
 * Two calls feed the page, and each has one card: its freshness and its failure are told once.
 * The temperatures and the demand come from the same service, but one can be answered while the
 * other is not.
 *
 * The freshness is that of the call. The answer does not say when the sensors were read, so a
 * sensor that fell silent keeps showing its last temperature as current - a gap of the API
 * (`water-api.ts`), not something this page can tell.
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
    LocalNumberPipe,
    TemperatureGauge,
  ],
  templateUrl: './hot-water.html',
  styleUrl: './hot-water.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotWater {
  private readonly api = inject(WaterApi);
  protected readonly temperatures = this.api.watchTemperatures();
  protected readonly demand = this.api.watchHeatingDemand();
  protected readonly band = HOT_WATER_BAND;
  protected readonly oneDecimal: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  protected readonly tank = computed(() => reading(this.temperatures.value()?.water?.temperature));
  protected readonly circulation = computed(() =>
    reading(this.temperatures.value()?.circulation?.temperature),
  );
  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingNeeded = computed(() => {
    const active: unknown = this.demand.value()?.active;
    return typeof active === 'boolean' ? active : undefined;
  });
}

/**
 * A temperature, or `undefined` for anything else. Nothing checks an answer at runtime, and
 * before its first reading the service answers with no body at all.
 */
function reading(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/**
 * Landing page. For now it holds one read-only tile, which proves the whole path from the
 * screen to a backend service; the dashboards add their tiles as they arrive.
 */
@Component({
  selector: 'app-overview',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  protected readonly heating = inject(HeatingApi).watchStatus();

  /** True, false, or `undefined` while the answer does not say - never "disabled" by default. */
  protected readonly enabled = computed(() => {
    const enabled: unknown = this.heating.value()?.isHeatingEnabled;
    return typeof enabled === 'boolean' ? enabled : undefined;
  });
}

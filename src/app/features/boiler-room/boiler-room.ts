import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { BoilerApi } from '../../data-access/boiler/boiler-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { MessageKey } from '../../i18n/messages';
import { BoilerDevice, DeviceView, toDeviceView } from './boiler-device';

/**
 * The boiler room as a schematic: the furnace, the two pumps it feeds, and where each of them
 * sends the heat - the hot-water tank and the heating circuits. Every device shows whether it
 * runs and the last thing `boiler-service` noted about it; a pipe is drawn in the colour of the
 * domain while its pump runs. Read-only - the backend has nothing to set here.
 *
 * The furnace feeds both pumps, so its pipe to a pump is "flowing" by the pump alone: a pump
 * that runs while the furnace is off still moves the water.
 *
 * The schematic is drawn once the service has answered, whatever it answered: a device the
 * answer says nothing about - also when there is no body at all - shows "no status yet", and so
 * does the place its heat would go. Nothing here reads silence as "off".
 */
@Component({
  selector: 'app-boiler-room',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    BoilerDevice,
  ],
  templateUrl: './boiler-room.html',
  styleUrl: './boiler-room.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoilerRoom {
  protected readonly status = inject(BoilerApi).watchStatus();

  protected readonly furnace = computed(() => toDeviceView(this.status.value()?.furnace));
  protected readonly hotWaterPump = computed(() =>
    toDeviceView(this.status.value()?.pumps?.hot_water),
  );
  protected readonly heatingPump = computed(() =>
    toDeviceView(this.status.value()?.pumps?.heating),
  );

  /** What is said about the place a pump sends the heat to: it flows, it does not, or unknown. */
  protected flow(pump: DeviceView): MessageKey {
    if (pump.working === undefined) {
      return 'boilerRoom.noStatus';
    }
    return pump.working ? 'boilerRoom.flowing' : 'boilerRoom.noFlow';
  }
}

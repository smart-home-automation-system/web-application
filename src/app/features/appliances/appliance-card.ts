import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { ApplianceSettings } from '../../data-access/devices/device-registry-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { APPLIANCE_STATE_LABELS, ApplianceView } from '../../shared/appliances/appliance-views';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { CounterRow } from './counter-row';
import { COUNTER_PRESETS, Counter, CounterPreset, energyParts, RunView } from './appliance-history';

/**
 * One appliance of the appliances page (HAS-283): its state, its counters of 24 hours, 7 and 30 days, its
 * settings as the registry holds them (read only - changed on the devices page) and its cycles of the
 * period of the list. What the answer leaves out stays "not known"; the energy of a cycle the service does
 * not know is never 0 Wh.
 */
@Component({
  selector: 'app-appliance-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoDirective,
    ApiErrorStrip,
    CounterRow,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './appliance-card.html',
  styleUrl: './appliance-card.scss',
  // rows are pieces of text side by side: without the white space a screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplianceCard {
  readonly appliance = input.required<ApplianceView>();
  readonly settings = input<ApplianceSettings | undefined>();
  /** The counters of the three periods; `undefined` while the runs of the appliance are not known. */
  readonly counters = input<Readonly<Record<CounterPreset, Counter>> | undefined>();
  /** The cycles of the period of the list; `undefined` while not known. */
  readonly runs = input<readonly RunView[] | undefined>();
  /** The failure of the call of the runs of this appliance - the others are told all the same. */
  readonly runsError = input<ApiError | undefined>();

  protected readonly STATE_LABELS = APPLIANCE_STATE_LABELS;
  protected readonly presets = COUNTER_PRESETS;
  protected readonly TIME: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly KWH: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  protected readonly energyParts = energyParts;

  protected readonly quietHours = computed(() => {
    const settings = this.settings();
    return settings?.quietFrom !== undefined && settings.quietTo !== undefined
      ? `${settings.quietFrom}–${settings.quietTo}`
      : undefined;
  });

  /** A run as its line: how long it took, in hours and minutes. */
  protected hoursOf(minutes: number): { hours: number; minutes: number } {
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  }
}

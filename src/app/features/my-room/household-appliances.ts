import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { ProfileStore } from '../../core/profile/profile-store';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import {
  APPLIANCE_STATE_LABELS,
  cycleTimeFormat,
  describeApplianceError,
  toApplianceViews,
} from '../../shared/appliances/appliance-views';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { MessageKey } from '../../i18n/messages';

/**
 * The appliances of the household on "My room" (HAS-282): the washing machine, the dryer and the
 * dishwasher with their state - running since, finished at - and **"Emptied"** for a finished one,
 * for every member and not by room: the appliances are the household's, so the card stands once,
 * after the cards of the rooms. Until the tags of HAS-343 every member acknowledges here (owner,
 * 2026-10-25); then the button becomes the administrator's "Mute the reminders" (HAS-346).
 *
 * It reads the resource of the whole application (`ApplianceStore`), which the notice of the shell
 * reads too, so the two never disagree. Nothing optimistic: after an acknowledgement the list is
 * read again, and only that answer moves the card. **No card while the household has no appliance**
 * - an empty list, also while the first answer is on its way; a failure before any answer is told.
 */
@Component({
  selector: 'app-household-appliances',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './household-appliances.html',
  styleUrl: './household-appliances.scss',
  // a row is a name and its state side by side: without the white space a screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HouseholdAppliances {
  protected readonly appliances = inject(ApplianceStore).appliances;
  private readonly profiles = inject(ProfileStore);
  protected readonly STATE_LABELS = APPLIANCE_STATE_LABELS;
  private readonly ticker = inject(Ticker);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  // the day of the house now: a cycle of another day is told with its date
  private readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  protected readonly describeError = describeApplianceError;

  protected readonly views = computed(() => toApplianceViews(this.appliances.value()));

  /** Drawn once there is something to show, or a failure before any answer. */
  protected readonly shown = computed(
    () =>
      this.views().length > 0 ||
      (this.appliances.value() === undefined && this.appliances.error() !== undefined),
  );

  protected readonly failure = computed(() => {
    const failed = this.appliances.acknowledgeFailure();
    return failed === undefined
      ? undefined
      : {
          id: failed.id,
          error: failed.error,
          // one without an answer may have been carried out all the same: never "not marked"
          summary: (failed.error.kind === 'network'
            ? 'appliances.acknowledgeNoAnswer'
            : 'appliances.acknowledgeFailed') satisfies MessageKey,
        };
  });

  protected timeFormat(text: string): Intl.DateTimeFormatOptions {
    return cycleTimeFormat(text, this.today());
  }

  protected acknowledge(id: number): void {
    this.appliances.acknowledge(id, this.profiles.profile()?.name);
  }
}

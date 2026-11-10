import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { SoftenerApi } from '../../data-access/water/softener-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { alertLevelOf } from './softener-views';
import { describeWaterError } from './water-errors';

/** At most this many unread alerts of the cloud are listed - a card of the first row of the page; the service reads 20. */
export const SOFTENER_ALERTS_SHOWN = 4;

/**
 * The alerts the iQua cloud keeps of the softener (HAS-402, `GET /water/softener/alerts`, `water-service` >= 0.17.0):
 * the alerts not yet read in the iQua application (HAS-412, owner 2026-11-10 - an alert read there leaves the card
 * within the five minutes the service keeps the list), newest first, each coloured by its level - critical on the
 * strip of an error, a warning outlined, the rest plain. An alert the cloud sent without `read` is shown: missing is
 * never taken for read. With none unread the card says so, with the date of the newest alert the cloud keeps. The
 * title and the message are the words of the cloud, in English, as it sent them; a field it left out is left out.
 * One call, one card.
 */
@Component({
  selector: 'app-softener-alerts',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './softener-alerts.html',
  styleUrl: './softener-alerts.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftenerAlerts {
  protected readonly alerts = inject(SoftenerApi).watchAlerts();
  protected readonly describe = describeWaterError;

  /** The alerts not read in the iQua application, newest first as the service sends them. */
  private readonly unread = computed(() => (this.alerts.value() ?? []).filter((alert) => alert.read !== true));

  protected readonly shown = computed(() =>
    this.unread()
      .slice(0, SOFTENER_ALERTS_SHOWN)
      .map((alert) => ({ alert, level: alertLevelOf(alert) })),
  );
  /** The unread alerts past the ones shown - counted, never dropped unseen. */
  protected readonly hidden = computed(() => Math.max(0, this.unread().length - SOFTENER_ALERTS_SHOWN));
  /** The newest alert the cloud keeps, read or not - its date said while none is unread, so an empty card shows it works. */
  protected readonly lastAt = computed(() => (this.alerts.value() ?? []).find((alert) => alert.at)?.at);
}

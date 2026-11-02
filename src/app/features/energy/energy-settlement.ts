import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { EnergyApi } from '../../data-access/energy/energy-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { describeEnergyError } from './energy-errors';
import { BILLING_YEAR_STARTS, billingYearOf, monthsOf, numberOf, storedNow } from './energy-views';

/**
 * The net-metering of the billing year (HAS-341, `GET /energy/months`): the house settles by
 * "opusty", so everything is kWh and **no money is shown anywhere**. Per month what was returned,
 * what of it is credited at the ratio, what was taken, how much of that the credit covered and what
 * was bought; the credit that lapsed and what is left "in the grid" - the rolling twelve months. A
 * month without a closed day has no figures, never zeros. The house's estimate by whole months,
 * not the invoice - the card says so. Its own call: freshness and failure here.
 */
@Component({
  selector: 'app-energy-settlement',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card
        appearance="outlined"
        class="settlement card--domain"
        data-testid="energy-settlement"
      >
        <mat-card-header>
          <div mat-card-avatar class="domain-badge">
            <mat-icon>account_balance</mat-icon>
          </div>
          <mat-card-title>{{ t('energy.settlement.title') }}</mat-card-title>
          <mat-card-subtitle>
            <app-data-freshness [lastUpdated]="months.lastUpdated()" [stale]="months.stale()" />
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="settlement__year">
            <button
              mat-icon-button
              type="button"
              data-testid="year-before"
              [attr.aria-label]="t('energy.settlement.yearBefore')"
              (click)="year.set(year() - 1)"
            >
              <mat-icon>chevron_left</mat-icon>
            </button>
            <strong data-testid="billing-year">{{ year() }}/{{ year() + 1 }}</strong>
            <button
              mat-icon-button
              type="button"
              data-testid="year-after"
              [disabled]="year() >= currentYear()"
              [attr.aria-label]="t('energy.settlement.yearAfter')"
              (click)="year.set(year() + 1)"
            >
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>

          @if (waiting()) {
            <mat-progress-bar
              mode="indeterminate"
              [attr.aria-label]="t('energy.settlement.loading')"
            />
          } @else if (shown(); as answer) {
            @let rows = rowsOf(answer.months);
            @let stored = stored_(rows);
            <p class="settlement__lead" data-testid="in-the-grid">
              <span>{{ t('energy.settlement.inTheGrid') }}</span>
              @if (stored !== undefined) {
                <strong>{{ stored | localNumber: TWO }} kWh</strong>
              } @else {
                <strong>{{ t('energy.notKnown') }}</strong>
              }
            </p>
            @if (ratioOf(answer.ratio); as ratio) {
              <p class="settlement__note">
                {{ t('energy.settlement.ratio', { ratio: (ratio | localNumber: TWO) }) }}
              </p>
            }
            <div class="settlement__scroll">
              <table class="settlement__table">
                <thead>
                  <tr>
                    <th scope="col">{{ t('energy.settlement.month') }}</th>
                    <th scope="col">{{ t('energy.settlement.exported') }}</th>
                    <th scope="col">{{ t('energy.settlement.credited') }}</th>
                    <th scope="col">{{ t('energy.settlement.imported') }}</th>
                    <th scope="col">{{ t('energy.settlement.drawn') }}</th>
                    <th scope="col">{{ t('energy.settlement.bought') }}</th>
                    <th scope="col">{{ t('energy.settlement.expired') }}</th>
                    <th scope="col">{{ t('energy.settlement.stored') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows; track row.month) {
                    <tr [attr.data-month]="row.month">
                      <th scope="row">{{ monthName(row.month) }}</th>
                      @if ((row.days ?? 0) > 0) {
                        <td>
                          {{ row.exported === undefined ? '–' : (row.exported | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.credited === undefined ? '–' : (row.credited | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.imported === undefined ? '–' : (row.imported | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.drawn === undefined ? '–' : (row.drawn | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.bought === undefined ? '–' : (row.bought | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.expired === undefined ? '–' : (row.expired | localNumber: TWO) }}
                        </td>
                        <td>
                          {{ row.stored === undefined ? '–' : (row.stored | localNumber: TWO) }}
                        </td>
                      } @else {
                        <td colspan="7" class="settlement__none">
                          {{ t('energy.settlement.noDays') }}
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="settlement__note">{{ t('energy.settlement.note') }}</p>
          }
          <app-api-error-strip [error]="months.error()" [describeWith]="describe" />
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .settlement {
      --app-domain: var(--app-domain-energy);

      height: 100%;
      box-sizing: border-box;
    }

    mat-card-header {
      padding: 12px 12px 0;
    }

    mat-card-content {
      padding: 8px 12px 12px;
    }

    .settlement__year {
      display: flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-title-medium);
    }

    .settlement__lead {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 4px 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface-variant);

      strong {
        color: var(--mat-sys-on-surface);
      }
    }

    .settlement__scroll {
      overflow-x: auto;
    }

    .settlement__table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface);

      th,
      td {
        padding: 4px 8px;
        text-align: right;
        white-space: nowrap;
        border-bottom: 1px solid var(--app-glass-edge);
      }

      th[scope='row'],
      thead th:first-child {
        text-align: left;
      }

      thead th {
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-on-surface-variant);
        white-space: normal;
      }
    }

    .settlement__none {
      text-align: left !important;
      color: var(--mat-sys-on-surface-variant);
    }

    .settlement__note {
      margin: 6px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySettlement {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly locale = inject(LanguageStore).locale;

  protected readonly TWO: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  /** The billing year of today; the one on screen starts there, and can go back. */
  protected readonly currentYear = computed(() =>
    billingYearOf(houseDay(this.ticker.now(), this.zone), BILLING_YEAR_STARTS),
  );
  protected readonly year = signal(this.currentYear());

  protected readonly months = inject(EnergyApi).watchMonths(this.year);

  protected readonly shown = computed(() => {
    const answered = this.months.value();
    return answered?.query === this.year() ? (answered?.answer ?? undefined) : undefined;
  });

  protected readonly waiting = computed(
    () =>
      this.months.value()?.query !== this.year() && this.months.settledFor()?.query !== this.year(),
  );

  protected readonly rowsOf = monthsOf;
  protected readonly describe = describeEnergyError;
  protected readonly stored_ = storedNow;
  protected readonly ratioOf = numberOf;

  /** `2026-10` as "October 2026" in the language of the interface. */
  protected monthName(month: string): string {
    const at = Date.parse(`${month}-01T00:00:00Z`);
    return Number.isNaN(at)
      ? month
      : dateTimeFormat(this.locale(), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
          at,
        );
  }
}

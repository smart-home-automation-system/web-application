import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { dateTimeFormat, numberFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { HistoryPreset } from '../../core/time/history-range';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { EnergyApi, EnergyDay } from '../../data-access/energy/energy-api';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { daysIn, daysQuery } from './energy-days';
import { describeEnergyError } from './energy-errors';
import { ELICZNIK_DAY_DIALOG_SIZE, ElicznikDayDialog } from './elicznik-day-dialog';
import { anyOperator, operatorDays, operatorTotals } from './energy-operator-views';

/**
 * The meter of the operator beside the house's 3EM (HAS-417): the import and the export of every closed day as the
 * eLicznik portal of Tauron counts them (energy-service >= 0.17.0, HAS-340) next to the 3EM of the same day, and how
 * far apart in % - the 3EM the base. One call, `GET /energy/days`, which holds both since 0.17.0. **A day the portal
 * has not served yet is "not yet", never 0** (the portal serves a day the morning after it). A day with values of the
 * operator opens the window of its hours.
 */
@Component({
  selector: 'app-energy-operator',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoDirective,
    HistoryFrame,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="operator card--domain" data-testid="energy-operator">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge">
            <mat-icon>electric_meter</mat-icon>
          </div>
          <mat-card-title>{{ t('energy.operator.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="preset"
            [presets]="presets"
            [waiting]="waiting()"
            [empty]="shown() === undefined || !known()"
            [error]="days.error()"
            [lastUpdated]="days.lastUpdated()"
            [stale]="days.stale()"
            [describeWith]="describe"
          >
            <ng-template>
              @let total = totals();
              <div class="operator__scroll">
                <table class="operator__table" data-testid="operator-table">
                  <caption class="visually-hidden">
                    {{
                      t('energy.operator.title')
                    }}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{{ t('energy.operator.day') }}</th>
                      <th scope="col">{{ t('energy.operator.importMeter') }}</th>
                      <th scope="col">{{ t('energy.operator.importOperator') }}</th>
                      <th scope="col">{{ t('energy.operator.apart') }}</th>
                      <th scope="col">{{ t('energy.operator.exportMeter') }}</th>
                      <th scope="col">{{ t('energy.operator.exportOperator') }}</th>
                      <th scope="col">{{ t('energy.operator.apart') }}</th>
                      <th scope="col">
                        <span class="visually-hidden">{{ t('energy.operator.hours') }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.day) {
                      <tr [attr.data-day]="row.day">
                        <th scope="row">{{ dayName(row.day) }}</th>
                        <td>{{ kwh(row.meterImport) }}</td>
                        <td>
                          @if (row.operatorImport !== undefined) {
                            {{ row.operatorImport | localNumber: TWO }}
                          } @else {
                            <span class="operator__not-yet">{{ t('energy.operator.notYet') }}</span>
                          }
                        </td>
                        <td data-apart="import">{{ apart(row.importApart) }}</td>
                        <td>{{ kwh(row.meterExport) }}</td>
                        <td>
                          @if (row.operatorExport !== undefined) {
                            {{ row.operatorExport | localNumber: TWO }}
                          } @else {
                            <span class="operator__not-yet">{{ t('energy.operator.notYet') }}</span>
                          }
                        </td>
                        <td data-apart="export">{{ apart(row.exportApart) }}</td>
                        <td>
                          @if (
                            row.operatorImport !== undefined || row.operatorExport !== undefined
                          ) {
                            <button
                              mat-icon-button
                              type="button"
                              data-testid="operator-hours"
                              [attr.aria-label]="
                                t('energy.operator.hoursOf', { day: dayName(row.day) })
                              "
                              [matTooltip]="t('energy.operator.hoursOf', { day: dayName(row.day) })"
                              matTooltipTouchGestures="off"
                              (click)="openDay(row.day)"
                            >
                              <mat-icon>bar_chart</mat-icon>
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                  @if (total.days > 0) {
                    <tfoot>
                      <tr data-testid="operator-total">
                        <th scope="row">
                          {{ t('energy.operator.total', { days: total.days }) }}
                        </th>
                        <td>{{ total.meterImport | localNumber: TWO }}</td>
                        <td>{{ total.operatorImport | localNumber: TWO }}</td>
                        <td>{{ apart(total.importApart) }}</td>
                        <td>{{ total.meterExport | localNumber: TWO }}</td>
                        <td>{{ total.operatorExport | localNumber: TWO }}</td>
                        <td>{{ apart(total.exportApart) }}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  }
                </table>
              </div>
              <p class="operator__note">{{ t('energy.operator.note') }}</p>
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .operator {
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

    .operator__scroll {
      overflow-x: auto;
    }

    .operator__table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface);

      th,
      td {
        padding: 2px 8px;
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

      tfoot th,
      tfoot td {
        font-weight: 600;
        border-bottom: none;
      }
    }

    /* every row as tall as one with the button of its hours: a smaller button, the rows of one height */
    .operator__table tbody tr {
      height: 40px;
    }

    .operator__table button {
      --mat-icon-button-state-layer-size: 32px;
      --mat-icon-button-icon-size: 20px;
    }

    .operator__not-yet {
      color: var(--mat-sys-on-surface-variant);
    }

    .operator__note {
      margin: 6px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyOperator {
  protected readonly describe = describeEnergyError;
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly locale = inject(LanguageStore).locale;
  private readonly dialog = inject(MatDialog);

  protected readonly TWO: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  protected readonly presets: readonly HistoryPreset[] = ['week', 'month'];
  protected readonly preset = signal<HistoryPreset>('week');

  /** The question: the same object while it is the same range, which the resource compares by. */
  private readonly query = computed(
    () => daysQuery(this.preset(), houseDay(this.ticker.now(), this.zone)),
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );

  protected readonly days = inject(EnergyApi).watchDays(this.query);

  /** The answer of the range on screen; `undefined` until it is in. */
  protected readonly shown = computed(() => {
    const answered = this.days.value();
    return answered?.query === this.query() ? answered?.answer : undefined;
  });

  protected readonly waiting = computed(
    () => this.shown() === undefined && this.days.settledFor()?.query !== this.query(),
  );

  private readonly byDay = computed(() => {
    const answer: unknown = this.shown();
    const known = new Map<string, EnergyDay>();
    if (Array.isArray(answer)) {
      for (const day of answer as EnergyDay[]) {
        if (typeof day?.day === 'string') {
          known.set(day.day, day);
        }
      }
    }
    return known;
  });

  protected readonly rows = computed(() => operatorDays(daysIn(this.query()), this.byDay()));
  protected readonly totals = computed(() => operatorTotals(this.rows()));
  protected readonly known = computed(() => anyOperator(this.rows()));

  /** `2026-11-08` as "Sun, 8 Nov" in the language of the interface. */
  protected dayName(day: string): string {
    return dateTimeFormat(this.locale(), {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(Date.parse(`${day}T00:00:00Z`));
  }

  protected kwh(value: number | undefined): string {
    return value === undefined
      ? '–'
      : numberFormat(this.locale(), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
  }

  /** "+0.7 %", "−1.2 %", "0.0 %"; "–" when not both are known. */
  protected apart(value: number | undefined): string {
    if (value === undefined) {
      return '–';
    }
    const text = numberFormat(this.locale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value);
    return `${text} %`;
  }

  protected openDay(day: string): void {
    this.dialog.open(ElicznikDayDialog, {
      ...ELICZNIK_DAY_DIALOG_SIZE,
      data: { day, title: this.dayName(day) },
      autoFocus: 'dialog',
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { numberFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { EnergyApi } from '../../data-access/energy/energy-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { BarSeries, BarsChart } from '../../shared/history-chart/bars-chart';
import { describeEnergyError } from './energy-errors';
import { operatorHours } from './energy-operator-views';
import { numberOf } from './energy-views';

/** What the window of a day is opened with: the day (`YYYY-MM-DD`) and its name in the language of the page. */
export interface ElicznikDayDialogData {
  readonly day: string;
  readonly title: string;
}

export const ELICZNIK_DAY_DIALOG_SIZE = {
  width: 'min(720px, calc(100vw - 32px))',
  maxWidth: '100vw',
  maxHeight: 'calc(100dvh - 48px)',
} as const;

/**
 * One day of the meter of the operator, hour by hour (HAS-417): `GET /energy/elicznik` for that day - its own call,
 * its freshness and failure in the window. The import and the export of every hour as bars (25 the night the clocks go
 * back, the repeated 02:00 marked; 23 the night they go forward), the sums of the day and the registers of the meter
 * at its end when the portal served them. An hour the answer leaves out has no bar.
 */
@Component({
  selector: 'app-elicznik-day-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    BarsChart,
    DataFreshness,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="dialog__title" mat-dialog-title>
        <div class="domain-badge"><mat-icon>electric_meter</mat-icon></div>
        <div class="dialog__heading">
          <span data-testid="elicznik-day-title">{{
            t('energy.operator.dayTitle', { day: data.title })
          }}</span>
          <app-data-freshness [lastUpdated]="answer.lastUpdated()" [stale]="answer.stale()" />
        </div>
      </div>

      <mat-dialog-content class="dialog__content" data-testid="elicznik-day">
        <app-api-error-strip [error]="answer.error()" [describeWith]="describe" />
        @if (waiting()) {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('energy.operator.loading')" />
        } @else if (hours().length > 0) {
          <app-bars-chart
            [categories]="categories()"
            [series]="series()"
            unit="kWh"
            [decimals]="3"
            [label]="t('energy.operator.hoursLabel')"
          />
          <ul class="dialog__facts" data-testid="elicznik-day-facts">
            <li>
              <span>{{ t('energy.operator.importOperator') }}</span>
              <strong>{{ sum('imported') }}</strong>
            </li>
            <li>
              <span>{{ t('energy.operator.exportOperator') }}</span>
              <strong>{{ sum('exported') }}</strong>
            </li>
            <li data-testid="elicznik-registers">
              <span>{{ t('energy.operator.registers') }}</span>
              @if (registers(); as reading) {
                <strong>{{ t('energy.operator.registerValues', reading) }}</strong>
              } @else {
                <strong>{{ t('energy.notKnown') }}</strong>
              }
            </li>
          </ul>
          @if (doubled()) {
            <p class="dialog__note">{{ t('energy.operator.repeatedNote') }}</p>
          }
        } @else if (!answer.error()) {
          <p class="dialog__note">{{ t('energy.operator.noDay') }}</p>
        }
      </mat-dialog-content>

      <mat-dialog-actions class="dialog__actions">
        <button matButton type="button" mat-dialog-close>{{ t('energy.operator.close') }}</button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
      --app-domain: var(--app-domain-energy);
    }

    .dialog__title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .dialog__heading {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .dialog__actions {
      justify-content: flex-end;
    }

    .dialog__facts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 24px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);

      strong {
        margin-left: 6px;
        color: var(--mat-sys-on-surface);
        font-variant-numeric: tabular-nums;
      }
    }

    .dialog__note {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElicznikDayDialog {
  protected readonly data = inject<ElicznikDayDialogData>(MAT_DIALOG_DATA);
  protected readonly describe = describeEnergyError;
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;
  private readonly locale = inject(LanguageStore).locale;

  private readonly day = signal(this.data.day);
  protected readonly answer = inject(EnergyApi).watchElicznikDay(this.day);

  private readonly shown = computed(() => {
    const answered = this.answer.value();
    return answered?.query === this.day()
      ? answered.answer?.days?.find((day) => day?.day === this.day())
      : undefined;
  });

  protected readonly waiting = computed(
    () =>
      this.answer.value()?.query !== this.day() && this.answer.settledFor()?.query !== this.day(),
  );

  protected readonly hours = computed(() => operatorHours(this.shown()));
  protected readonly categories = computed(() => this.hours().map((hour) => hour.label));
  protected readonly doubled = computed(() => this.hours().some((hour) => hour.repeated));

  protected readonly series = computed((): readonly BarSeries[] => {
    // read so that the names follow the language
    this.language();
    return [
      {
        key: 'imported',
        name: this.transloco.translate('energy.operator.importOperator'),
        color: 2,
        values: this.hours().map((hour) => hour.imported ?? null),
      },
      {
        key: 'exported',
        name: this.transloco.translate('energy.operator.exportOperator'),
        color: 5,
        values: this.hours().map((hour) => hour.exported ?? null),
      },
    ];
  });

  /** The sum of the day the answer gives, "not known" without one. */
  protected sum(of: 'imported' | 'exported'): string {
    const value = numberOf(this.shown()?.[of]);
    return value === undefined
      ? this.transloco.translate('energy.notKnown')
      : `${numberFormat(this.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} kWh`;
  }

  /** The registers at the end of the day, both or none. */
  protected readonly registers = computed(() => {
    const imported = numberOf(this.shown()?.meterImported);
    const exported = numberOf(this.shown()?.meterExported);
    const whole = numberFormat(this.locale(), { maximumFractionDigits: 0 });
    return imported === undefined || exported === undefined
      ? undefined
      : { imported: whole.format(imported), exported: whole.format(exported) };
  });
}

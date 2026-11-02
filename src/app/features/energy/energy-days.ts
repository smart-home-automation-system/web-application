import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { HistoryPreset } from '../../core/time/history-range';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { DaysQuery, EnergyApi, EnergyDay } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { BarSeries, BarsChart } from '../../shared/history-chart/bars-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { describeEnergyError } from './energy-errors';
import { numberOf } from './energy-views';

const DAY_MS = 24 * 60 * 60 * 1_000;

/** The closed days a period looks back over: 7 or 30, the last one yesterday. */
const DAYS_OF: Readonly<Partial<Record<HistoryPreset, number>>> = { week: 7, month: 30 };

/** A day `days` before or after `day` (`YYYY-MM-DD`), on the calendar - no zone in it. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The closed days of a period, as `GET /energy/days` takes them: both ends included. */
export function daysQuery(preset: HistoryPreset, today: string): DaysQuery {
  const to = shiftDay(today, -1);
  return { from: shiftDay(to, -((DAYS_OF[preset] ?? 7) - 1)), to };
}

/** Every day of a query, oldest first. */
export function daysIn(query: DaysQuery): readonly string[] {
  const days: string[] = [];
  for (let day = query.from; day <= query.to; day = shiftDay(day, 1)) {
    days.push(day);
  }
  return days;
}

interface SeriesSpec {
  readonly key: 'production' | 'imported' | 'exported';
  readonly name: MessageKey;
  readonly color: 1 | 2 | 5;
}

const SERIES: readonly SeriesSpec[] = [
  { key: 'production', name: 'energy.days.production', color: 1 },
  { key: 'imported', name: 'energy.days.imported', color: 2 },
  { key: 'exported', name: 'energy.days.exported', color: 5 },
];

/**
 * The closed days of the energy (HAS-341): the production, what the house took from the grid and
 * what it returned, kWh per day as bars - 7 or 30 days up to yesterday, the day the service closed
 * last. **A day the answer leaves out, or a value it leaves out, has no bar** (a day of the meter
 * alone has no production, never 0), and the sums under the chart count only what is known, with
 * how many days that is. Its own call, freshness and failure in the frame; a period is asked anew
 * and shown only once its answer is in (`settledFor`, the rule of a report).
 */
@Component({
  selector: 'app-energy-days',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    BarsChart,
    HistoryFrame,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="chart card--domain" data-testid="energy-days">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge">
            <mat-icon>calendar_month</mat-icon>
          </div>
          <mat-card-title>{{ t('energy.days.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="preset"
            [presets]="presets"
            [waiting]="waiting()"
            [empty]="shown() === undefined || !anyKnown()"
            [error]="days.error()"
            [lastUpdated]="days.lastUpdated()"
            [stale]="days.stale()"
            [describeWith]="describe"
          >
            <ng-template>
              <app-bars-chart
                [categories]="categories()"
                [series]="series()"
                unit="kWh"
                [decimals]="1"
                [label]="t('energy.days.label')"
              />
              <ul class="chart__facts" data-testid="days-facts">
                @for (total of totals(); track total.key) {
                  <li [attr.data-total]="total.key">
                    <span class="chart__name">{{ t(total.name) }}</span>
                    <span>{{ total.sum | localNumber: ONE_DECIMAL }} kWh</span>
                    <span class="chart__name">{{
                      t('energy.days.known', { known: total.known, days: categories().length })
                    }}</span>
                  </li>
                }
              </ul>
              <p class="chart__note">{{ t('energy.days.note') }}</p>
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './energy-chart-card.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyDays {
  protected readonly describe = describeEnergyError;
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LanguageStore).locale;
  private readonly language = inject(LanguageStore).language;

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
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
    return answered !== undefined && answered.query === this.query() ? answered.answer : undefined;
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

  private readonly dayList = computed(() => daysIn(this.query()));

  protected readonly categories = computed(() => {
    const format = dateTimeFormat(this.locale(), {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    });
    return this.dayList().map((day) => format.format(Date.parse(`${day}T00:00:00Z`)));
  });

  protected readonly series = computed((): readonly BarSeries[] => {
    // read so that the names follow the language
    this.language();
    return SERIES.map((spec) => ({
      key: spec.key,
      name: this.transloco.translate(spec.name),
      color: spec.color,
      values: this.dayList().map((day) => numberOf(this.byDay().get(day)?.[spec.key]) ?? null),
    }));
  });

  protected readonly anyKnown = computed(() =>
    this.series().some((series) => series.values.some((value) => value !== null)),
  );

  protected readonly totals = computed(() =>
    SERIES.map((spec, index) => {
      const values = this.series()[index].values.filter((value): value is number => value !== null);
      return {
        key: spec.key,
        name: spec.name,
        sum: Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100,
        known: values.length,
      };
    }),
  );
}

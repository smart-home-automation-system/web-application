import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { LanguageStore } from '../../core/i18n/language-store';
import { HistoryRange, sameRange } from '../../core/time/history-range';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { SoftenerApi } from '../../data-access/water/softener-api';
import { ConsumptionQuery, WaterApi } from '../../data-access/water/water-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { BarSeries, BarsChart } from '../../shared/history-chart/bars-chart';
import { ChartLine, axisOf, summarise, toLine } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { regenerationMarks } from './softener-views';
import { describeWaterError } from './water-errors';

/** How far back the salt is drawn (HAS-402): its level moves a few per cent a week, a regeneration every few days. */
export const SALT_HISTORY_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** The last `days` days of the house up to the midnight after today, as a range the services take. */
export function lastDays(days: number, instant: number, timeZone: string): HistoryRange {
  const end = Date.parse(`${houseDay(instant, timeZone)}T00:00:00Z`) + DAY_MS;
  return {
    from: new Date(end - days * DAY_MS).toISOString().slice(0, 19),
    to: new Date(end).toISOString().slice(0, 19),
  };
}

/** The month of the house of `instant`: its first day to the first day of the next. */
export function monthOf(instant: number, timeZone: string): HistoryRange {
  const day = houseDay(instant, timeZone);
  const first = `${day.slice(0, 7)}-01`;
  const next = new Date(Date.parse(`${first}T00:00:00Z`));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: `${first}T00:00:00`, to: `${next.toISOString().slice(0, 10)}T00:00:00` };
}

/** The days of a range, `YYYY-MM-DD`, the end not included. */
export function daysIn(range: HistoryRange): string[] {
  const days: string[] = [];
  for (
    let at = Date.parse(`${range.from.slice(0, 10)}T00:00:00Z`);
    at < Date.parse(`${range.to.slice(0, 10)}T00:00:00Z`);
    at += DAY_MS
  ) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * The history of the water softener (HAS-402): the salt over the last 90 days with the regenerations marked across it
 * (`/water/softener/history?metric=saltLevel`, `/water/softener/regenerations`), and the litres through the softener
 * per day of this month beside the day of the water meter (`/water/softener/days`, `/water/consumption?range=month`) -
 * the difference is water that did not go through the softener. Two cards, each of two calls: the freshness is the
 * first call's, a failure of either told in its card. A day the service did not read has no bar - never 0.
 */
@Component({
  selector: 'app-softener-history',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    BarsChart,
    DataFreshness,
    HistoryChart,
    LocalNumberPipe,
  ],
  templateUrl: './softener-history.html',
  styleUrl: './softener-history.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftenerHistory {
  private readonly softenerApi = inject(SoftenerApi);
  private readonly waterApi = inject(WaterApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;
  protected readonly describe = describeWaterError;
  protected readonly whole: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  /** A new object only when the day changes - the question of the salt and the regenerations. */
  protected readonly saltRange = computed(
    () => lastDays(SALT_HISTORY_DAYS, this.ticker.now(), this.zone),
    { equal: sameRange },
  );
  protected readonly month = computed(() => monthOf(this.ticker.now(), this.zone), { equal: sameRange });
  private readonly consumptionQuery = computed(
    (): ConsumptionQuery => ({ range: 'month', at: this.month().from.slice(0, 10) }),
    { equal: (a, b) => a.range === b.range && a.at === b.at },
  );

  protected readonly salt = this.softenerApi.watchSaltHistory(() => this.saltRange());
  protected readonly regenerations = this.softenerApi.watchRegenerations(() => this.saltRange());
  protected readonly days = this.softenerApi.watchDays(() => this.month());
  protected readonly meter = this.waterApi.watchConsumption(() => this.consumptionQuery());

  // ---- the salt ----

  /** The answer of the salt for the range on screen; `undefined` until it arrives. */
  private readonly saltAnswer = computed(() => {
    const answered = this.salt.value();
    return answered?.query === this.saltRange() ? answered.answer : undefined;
  });
  protected readonly saltWaiting = computed(() => this.saltAnswer() === undefined && !this.salt.error());
  protected readonly saltAxis = computed(() => {
    const range = this.saltRange();
    return axisOf(range);
  });
  protected readonly saltLines = computed((): ChartLine[] => {
    this.language();
    const answer = this.saltAnswer();
    // a row is stored on a change only: a day without a point is a day the salt held, drawn through - never a gap
    const points = toLine(answer?.points, answer?.bucketSeconds, (point) => point['avg'], SALT_HISTORY_DAYS * DAY_MS / 1_000);
    return points.length === 0
      ? []
      : [{ key: 'salt', name: this.transloco.translate('softener.history.saltLine'), color: 1, points }];
  });
  protected readonly saltFacts = computed(() => {
    const line = this.saltLines()[0];
    return line === undefined ? undefined : summarise(line.points);
  });
  protected readonly marks = computed(() => {
    const answered = this.regenerations.value();
    return answered?.query === this.saltRange() ? regenerationMarks(answered.answer) : [];
  });
  protected readonly regenerationCount = computed(() => this.marks().length);

  // ---- the water per day ----

  private readonly dayList = computed(() => daysIn(this.month()));
  protected readonly categories = computed(() => this.dayList().map((day) => String(Number(day.slice(8, 10)))));
  protected readonly daySeries = computed((): BarSeries[] => {
    this.language();
    const days = this.days.value();
    const meter = this.meter.value();
    const softener = new Map<string, number>();
    if (days?.query === this.month()) {
      for (const entry of days.answer ?? []) {
        if (typeof entry.day === 'string' && typeof entry.litres === 'number') {
          softener.set(entry.day, entry.litres);
        }
      }
    }
    const metered = new Map<string, number>();
    if (meter?.query === this.consumptionQuery()) {
      for (const bucket of meter.answer?.buckets ?? []) {
        if (typeof bucket.at === 'string' && typeof bucket.volume === 'number') {
          metered.set(bucket.at.slice(0, 10), Math.round(bucket.volume * 1_000));
        }
      }
    }
    if (softener.size === 0 && metered.size === 0) {
      return [];
    }
    return [
      {
        key: 'softener',
        name: this.transloco.translate('softener.history.softenerSeries'),
        color: 1,
        values: this.dayList().map((day) => softener.get(day) ?? null),
      },
      {
        key: 'meter',
        name: this.transloco.translate('softener.history.meterSeries'),
        color: 2,
        values: this.dayList().map((day) => metered.get(day) ?? null),
      },
    ];
  });
  protected readonly daysWaiting = computed(
    () => this.days.value()?.query !== this.month() && !this.days.error(),
  );
}

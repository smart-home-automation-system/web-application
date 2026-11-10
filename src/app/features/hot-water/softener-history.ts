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
import { SoftenerApi, SoftenerDay } from '../../data-access/water/softener-api';
import { ConsumptionQuery, WaterApi, WaterConsumption } from '../../data-access/water/water-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { BarSeries, BarsChart } from '../../shared/history-chart/bars-chart';
import { ChartLine, axisOf, summarise, toLine } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
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

/** The litres through the softener by day, `YYYY-MM-DD`; a day without a number left out. */
export function litresBySoftenerDay(days: readonly SoftenerDay[] | null | undefined): Map<string, number> {
  const litres = new Map<string, number>();
  for (const entry of days ?? []) {
    if (typeof entry.day === 'string' && typeof entry.litres === 'number') {
      litres.set(entry.day, entry.litres);
    }
  }
  return litres;
}

/** The litres of the water meter by day (its m³ x 1000), from the buckets of a month; a bucket without a volume left out. */
export function litresByMeterDay(consumption: WaterConsumption | null | undefined): Map<string, number> {
  const litres = new Map<string, number>();
  for (const bucket of consumption?.buckets ?? []) {
    if (typeof bucket.at === 'string' && typeof bucket.volume === 'number') {
      litres.set(bucket.at.slice(0, 10), Math.round(bucket.volume * 1_000));
    }
  }
  return litres;
}

/**
 * The salt of the water softener over the last 90 days (HAS-402), the regenerations of those days marked across it
 * (`/water/softener/history?metric=saltLevel`, `/water/softener/regenerations`) - one card of two calls, in the second row
 * of the water page next to the consumption (owner, 2026-11-09). The freshness is the salt's; a failure of either is told.
 */
@Component({
  selector: 'app-softener-salt',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HistoryChart,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './softener-salt.html',
  styleUrl: './softener-history.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftenerSalt {
  private readonly softenerApi = inject(SoftenerApi);
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
  protected readonly salt = this.softenerApi.watchSaltHistory(() => this.saltRange());
  protected readonly regenerations = this.softenerApi.watchRegenerations(() => this.saltRange());

  /** The answer of the salt for the range on screen; `undefined` until it arrives. */
  private readonly saltAnswer = computed(() => {
    const answered = this.salt.value();
    return answered?.query === this.saltRange() ? answered.answer : undefined;
  });
  protected readonly saltWaiting = computed(() => this.saltAnswer() === undefined && !this.salt.error());
  protected readonly saltAxis = computed(() => axisOf(this.saltRange()));
  protected readonly saltLines = computed((): ChartLine[] => {
    this.language();
    const answer = this.saltAnswer();
    // a row is stored on a change only: a day without a point is a day the salt held, drawn through - never a gap
    const points = toLine(
      answer?.points,
      answer?.bucketSeconds,
      (point) => point['avg'],
      (SALT_HISTORY_DAYS * DAY_MS) / 1_000,
    );
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
  /** The salt of the newest point of the history - the level now, as the service stored it. */
  protected readonly saltNow = computed(() => {
    const points = this.saltLines()[0]?.points ?? [];
    return [...points].reverse().find(([, value]) => value !== null)?.[1] ?? undefined;
  });
  /** The start of the newest regeneration of the 90 days; `undefined` without one. */
  protected readonly lastRegeneration = computed(() => {
    const answered = this.regenerations.value();
    const starts = answered?.query === this.saltRange() ? (answered.answer ?? []).map((one) => one.startedAt) : [];
    // the latest start - not the first of the list, whatever order the service answers in
    return starts.filter((start): start is string => typeof start === 'string').sort((a, b) => a.localeCompare(b)).at(-1);
  });
}

/**
 * The water per day of this month (HAS-402): the litres through the softener (`/water/softener/days`) beside the water
 * meter (`/water/consumption?range=month`) - the difference is water that did not go through the softener. One card of
 * two calls, in the second row of the water page (owner, 2026-11-09); a day not read has no bar - never 0.
 */
@Component({
  selector: 'app-softener-days',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    BarsChart,
    DataFreshness,
    LocalNumberPipe,
  ],
  templateUrl: './softener-days.html',
  styleUrl: './softener-history.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftenerDays {
  private readonly softenerApi = inject(SoftenerApi);
  private readonly waterApi = inject(WaterApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;
  protected readonly describe = describeWaterError;

  protected readonly month = computed(() => monthOf(this.ticker.now(), this.zone), { equal: sameRange });
  private readonly consumptionQuery = computed(
    (): ConsumptionQuery => ({ range: 'month', at: this.month().from.slice(0, 10) }),
    { equal: (a, b) => a.range === b.range && a.at === b.at },
  );
  protected readonly days = this.softenerApi.watchDays(() => this.month());
  protected readonly meter = this.waterApi.watchConsumption(() => this.consumptionQuery());

  private readonly dayList = computed(() => daysIn(this.month()));
  protected readonly categories = computed(() => this.dayList().map((day) => String(Number(day.slice(8, 10)))));
  protected readonly daySeries = computed((): BarSeries[] => {
    this.language();
    const days = this.days.value();
    const meter = this.meter.value();
    const softener = litresBySoftenerDay(days?.query === this.month() ? days.answer : undefined);
    const metered = litresByMeterDay(meter?.query === this.consumptionQuery() ? meter.answer : undefined);
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
  protected readonly whole: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  /** The litres of the month so far through the softener and through the meter; `undefined` when no day is known. */
  protected readonly monthSoftener = computed(() => sumOf(this.daySeries().find((series) => series.key === 'softener')));
  protected readonly monthMeter = computed(() => sumOf(this.daySeries().find((series) => series.key === 'meter')));
}

/** The sum of the known values of a row of bars; `undefined` when none is known. */
function sumOf(series: BarSeries | undefined): number | undefined {
  const known = (series?.values ?? []).filter((value): value is number => value !== null);
  return known.length === 0 ? undefined : known.reduce((sum, value) => sum + value, 0);
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { calendarDate, dayOfCalendar, provideCalendar } from '../../core/i18n/calendar';
import { LanguageStore } from '../../core/i18n/language-store';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import {
  CONSUMPTION_RANGES,
  ConsumptionQuery,
  ConsumptionRange,
  WaterApi,
} from '../../data-access/water/water-api';
import { MessageKey } from '../../i18n/messages';
import { BarSeries, BarsChart } from '../../shared/history-chart/bars-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { describeWaterError } from './water-errors';
import {
  bucketLabel,
  bucketStarts,
  bucketValues,
  changePercent,
  hasNextPeriod,
  periodLabel,
  periodStart,
  shiftPeriod,
  unitOf,
  volumeIn,
} from './water-views';

const RANGE_LABELS: Readonly<Record<ConsumptionRange, MessageKey>> = {
  day: 'water.consumption.range.day',
  week: 'water.consumption.range.week',
  month: 'water.consumption.range.month',
  year: 'water.consumption.range.year',
};

/** The range the previous total is of. */
const PREVIOUS_LABELS: Readonly<Record<ConsumptionRange, MessageKey>> = {
  day: 'water.consumption.previous.day',
  week: 'water.consumption.previous.week',
  month: 'water.consumption.previous.month',
  year: 'water.consumption.previous.year',
};

/**
 * The water the house used (HAS-322) from `GET /water/consumption` of `water-service`: a day in hours, a week (Monday
 * to Sunday) and a month in days, a year in months, as bars - litres, a year in m³ - with the total of the range and of
 * the one before. The day of the range is chosen on a calendar or stepped back and forth; a range is asked anew and
 * shown only once its answer is in (`settledFor`, the rule of a report). **A bucket the service did not watch has no
 * bar** - never 0, and a total the answer leaves out is not known.
 */
@Component({
  selector: 'app-water-consumption',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoDirective,
    BarsChart,
    HistoryFrame,
    LocalNumberPipe,
  ],
  // the calendar and its texts come with this card, not with the first page of the application
  providers: [provideCalendar()],
  templateUrl: './water-consumption.html',
  styleUrl: './water-consumption.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterConsumptionCard {
  protected readonly describe = describeWaterError;
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly transloco = inject(TranslocoService);
  private readonly languages = inject(LanguageStore);

  protected readonly ranges = CONSUMPTION_RANGES;
  protected readonly rangeLabels = RANGE_LABELS;
  protected readonly previousLabels = PREVIOUS_LABELS;
  protected readonly range = signal<ConsumptionRange>('day');
  /** The day chosen; `undefined` follows today of the house. */
  private readonly chosen = signal<string | undefined>(undefined);

  /** Today of the house: a text, so it changes once a day. */
  protected readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  protected readonly day = computed(() => this.chosen() ?? this.today());

  /** The question: the same object while it is the same range, which the resource compares by. */
  private readonly query = computed(
    (): ConsumptionQuery => ({
      range: this.range(),
      at: periodStart(this.range(), this.day()),
    }),
    { equal: (a, b) => a.range === b.range && a.at === b.at },
  );

  protected readonly consumption = inject(WaterApi).watchConsumption(this.query);

  /** The answer of the range on screen; `undefined` until it is in. */
  protected readonly shown = computed(() => {
    const answered = this.consumption.value();
    return answered?.query === this.query() ? answered?.answer : undefined;
  });

  protected readonly waiting = computed(
    () => this.shown() === undefined && this.consumption.settledFor()?.query !== this.query(),
  );

  protected readonly unit = computed(() => unitOf(this.range()));
  protected readonly format = computed((): Intl.NumberFormatOptions => ({
    minimumFractionDigits: this.unit().decimals,
    maximumFractionDigits: this.unit().decimals,
  }));

  private readonly starts = computed(() => {
    const answer = this.shown();
    return typeof answer?.from === 'string' && typeof answer?.to === 'string'
      ? bucketStarts(this.range(), answer.from, answer.to)
      : [];
  });

  protected readonly categories = computed(() =>
    this.starts().map((start) => bucketLabel(this.range(), start, this.languages.locale())),
  );

  protected readonly series = computed((): readonly BarSeries[] => {
    // read so that the name follows the language
    this.languages.language();
    return [
      {
        key: 'used',
        name: this.transloco.translate('water.consumption.used'),
        color: 1,
        values: bucketValues(this.range(), this.starts(), this.shown()),
      },
    ];
  });

  protected readonly anyKnown = computed(() =>
    this.series().some((series) => series.values.some((value) => value !== null)),
  );

  protected readonly total = computed(() => volumeIn(this.range(), this.shown()?.total));
  protected readonly previous = computed(() => volumeIn(this.range(), this.shown()?.previousTotal));
  protected readonly change = computed(() =>
    changePercent(this.shown()?.total, this.shown()?.previousTotal),
  );

  protected readonly period = computed(() =>
    periodLabel(this.range(), this.day(), this.languages.locale()),
  );
  protected readonly hasNext = computed(() =>
    hasNextPeriod(this.range(), this.day(), this.today()),
  );

  /** The calendar works in the zone of the browser: the day it shows is the chosen day of the house. */
  protected readonly calendarDay = computed(() => calendarDate(this.day()));
  protected readonly calendarMax = computed(() => calendarDate(this.today()));

  protected step(steps: number): void {
    const next = shiftPeriod(this.range(), this.day(), steps);
    this.choose(next > this.today() ? this.today() : next);
  }

  protected picked(event: MatDatepickerInputEvent<Date>): void {
    if (event.value) {
      this.choose(dayOfCalendar(event.value));
    }
  }

  // a day in the range of today follows today again - the card goes on with the day as it changes
  private choose(day: string): void {
    const range = this.range();
    this.chosen.set(periodStart(range, day) === periodStart(range, this.today()) ? undefined : day);
  }
}

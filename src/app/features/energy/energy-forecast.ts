import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { EnergyApi } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { ChartLine, toLine, wallClockOf } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { describeEnergyError } from './energy-errors';
import {
  categoryLabel,
  forecastDays,
  forecastPast,
  heightOf,
  outlookOf,
  scaleOf,
} from './energy-forecast-views';
import { numberOf } from './energy-views';

const HOUR_SECONDS = 3_600;
const SOURCE_NAMES: Readonly<Record<'solax' | 'sofar', MessageKey>> = {
  solax: 'energy.source.solax',
  sofar: 'energy.source.sofar',
};

/**
 * The production forecast of the energy page (HAS-373, `GET /energy/forecast` of energy-service >=
 * 0.16.0): one sentence of the coming days, the two closed days with what the forecast gave beside
 * what was produced, then seven days - the kWh of the SOLAX and the SOFAR stacked, the category of
 * the service as a word and a colour, the share of the house load; the days from the fourth on
 * paler - with the house load of the last closed days as a dashed line across, and the expected
 * power of the next 48 hours. **The categories and the bands are the service's**; a day without its
 * kWh has no bar, a value left out is "not known". Its own call, its freshness and failure in the
 * card; `stale` of the answer (no fetch for three hours) is said in words.
 */
@Component({
  selector: 'app-energy-forecast',
  imports: [
    MatIconModule,
    TranslocoDirective,
    DomainTile,
    HistoryChart,
    HouseAgePipe,
    LocalNumberPipe,
  ],
  templateUrl: './energy-forecast.html',
  styleUrl: './energy-forecast.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyForecastCard {
  protected readonly describe = describeEnergyError;
  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LanguageStore).locale;
  private readonly language = inject(LanguageStore).language;

  protected readonly forecast = inject(EnergyApi).watchForecast();

  protected readonly ONE: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly RATIO: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  protected readonly answer = computed(() => this.forecast.value() ?? undefined);
  protected readonly days = computed(() => forecastDays(this.answer()));
  protected readonly past = computed(() => forecastPast(this.answer()));
  protected readonly houseLoad = computed(() => numberOf(this.answer()?.houseLoadKwh));
  protected readonly houseLoadDays = computed(() => numberOf(this.answer()?.houseLoadDays));
  protected readonly scale = computed(() => scaleOf(this.days(), this.past(), this.houseLoad()));
  protected readonly outlook = computed(() => outlookOf(this.answer()));
  protected readonly stale = computed(() => this.answer()?.stale === true);
  protected readonly fetchedAt = computed(() => {
    const at = this.answer()?.fetchedAt;
    return typeof at === 'string' ? at : undefined;
  });

  protected readonly ratios = computed(() => {
    const ratios = this.answer()?.performanceRatio;
    return (['solax', 'sofar'] as const).map((inverter) => ({
      inverter,
      name: SOURCE_NAMES[inverter],
      ratio: numberOf(ratios?.[inverter]?.ratio),
      days: numberOf(ratios?.[inverter]?.calibratedOnDays),
    }));
  });

  /** The line of the house load, % of the bar area from the bottom; `undefined` without one. */
  protected readonly houseLoadAt = computed(() => {
    const load = this.houseLoad();
    return load === undefined ? undefined : heightOf(load, this.scale());
  });

  protected readonly categoryLabel = categoryLabel;
  protected height(amount: number | undefined): number {
    return heightOf(amount, this.scale());
  }

  /** "Mon 9" - the weekday and the day of a date of the house. */
  protected readonly dayName = computed(() => {
    const format = dateTimeFormat(this.locale(), {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
    });
    return (day: string) => format.format(Date.parse(`${day}T00:00:00Z`));
  });

  /** The expected power of the next 48 hours, a line per inverter, from the start of each hour. */
  protected readonly hourlyLines = computed((): readonly ChartLine[] => {
    // read so that the names follow the language
    this.language();
    const hours: unknown = this.answer()?.hourly;
    const points = Array.isArray(hours)
      ? (hours as Record<string, unknown>[]).map((hour) => ({ ...hour, at: hour?.['hour'] }))
      : [];
    return (
      [
        { key: 'solaxKw', name: 'energy.source.solax', color: 1 },
        { key: 'sofarKw', name: 'energy.source.sofar', color: 4 },
      ] as const
    ).flatMap((spec) => {
      const line = toLine(points, HOUR_SECONDS, (point) => point[spec.key]);
      return line.length === 0
        ? []
        : [
            {
              key: spec.key,
              name: this.transloco.translate(spec.name),
              color: spec.color,
              points: line,
            },
          ];
    });
  });

  /** The axis of the 48 hours: from the first hour of the answer to the end of its last. */
  protected readonly hourlyAxis = computed(() => {
    const hours: unknown = this.answer()?.hourly;
    const times = Array.isArray(hours)
      ? (hours as { hour?: unknown }[])
          .map((hour) => wallClockOf(hour?.hour))
          .filter((at): at is number => at !== undefined)
      : [];
    return times.length === 0
      ? undefined
      : { from: Math.min(...times), to: Math.max(...times) + HOUR_SECONDS * 1_000 };
  });
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { dayAwareFormat, houseDay, parseHouseDateTime } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { AIR_LEVEL_LABELS, levelOfPm10, levelOfPm25 } from '../../data-access/weather/air-quality';
import { CurrentWeatherStore } from '../../data-access/weather/current-weather-store';
import { WeatherApi } from '../../data-access/weather/weather-api';
import {
  MetricReading,
  compassPoint,
  newestOf,
  toWeatherReading,
} from '../../data-access/weather/weather-reading';
import { MessageKey } from '../../i18n/messages';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { historyPeriod } from '../../shared/history-chart/history-period';
import { AirLevelDot } from '../../shared/air-quality/air-level-dot';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { ReadingAge } from './reading-age';
import { WEATHER_CHARTS, weatherChart } from './weather-charts';
import { WeatherChartCard } from './weather-chart-card';
import { WindCompass } from './wind-compass';

const COMPASS_LABELS: Readonly<Record<NonNullable<ReturnType<typeof compassPoint>>, MessageKey>> = {
  n: 'weather.compass.n',
  ne: 'weather.compass.ne',
  e: 'weather.compass.e',
  se: 'weather.compass.se',
  s: 'weather.compass.s',
  sw: 'weather.compass.sw',
  w: 'weather.compass.w',
  nw: 'weather.compass.nw',
};

/**
 * The weather station in detail and over time (HAS-241), the administrator's: the metrics in
 * cards and their history in six charts.
 *
 * **The cards read one call** - the current weather the strip of the panel reads too
 * (`CurrentWeatherStore`) - and each tells its freshness and its failure, the rule of the two
 * cards of the hot water: a card has to be true read by itself. What the answer leaves out has no
 * row; the age of a card is the newest reading of its metrics, a row the service calls stale is
 * marked, and when all are the whole card says so. The station card reads the status of the
 * station (`GET /weather/status`) - its call, whose freshness and failure it tells - and the
 * battery of the current weather beside it, with the failure of that call told apart.
 *
 * **The charts share one period**: choosing 7 days on one of them shows 7 days on all - the
 * page is one look at the weather, not six. Each chart asks for its metrics with `from` / `to`
 * and tells the freshness and the failure of its own calls.
 */
@Component({
  selector: 'app-weather',
  imports: [
    MatIconModule,
    TranslocoDirective,
    AirLevelDot,
    ApiErrorStrip,
    DomainTile,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
    ReadingAge,
    WeatherChartCard,
    WindCompass,
  ],
  templateUrl: './weather.html',
  styleUrl: './weather.scss',
  // a row is a name and a value side by side: without the white space between them a screen
  // reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Weather {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);

  protected readonly current = inject(CurrentWeatherStore).current;
  protected readonly status = inject(WeatherApi).watchStatus();
  protected readonly period = historyPeriod();
  protected readonly charts = WEATHER_CHARTS.map((spec) => weatherChart(spec, this.period));

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  /** The total of the gauge as it counts: in tenths, written only where it has them. */
  protected readonly GAUGE: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly compassLabels = COMPASS_LABELS;
  protected readonly airLabels = AIR_LEVEL_LABELS;

  /** The start of a smog episode: the time alone today, with the date on another day. */
  protected sinceFormat(since: string): Intl.DateTimeFormatOptions {
    return dayAwareFormat(since, houseDay(this.ticker.now(), this.zone));
  }

  /**
   * The air quality outside (HAS-431): the level the sensor gives, and the level of PM2.5 and PM10 alone by the
   * thresholds of the scale (`air-quality.ts`).
   */
  protected readonly air = computed(() => {
    const r = this.reading();
    return {
      level: r.airQualityLevel?.value,
      pm25Level: levelOfPm25(r.pm25?.value),
      pm10Level: levelOfPm10(r.pm10?.value),
    };
  });

  protected readonly reading = computed(() => toWeatherReading(this.current.value(), this.zone));

  /** The metrics of every card: what it shows, and the age that goes with them. */
  protected readonly cards = computed(() => {
    const r = this.reading();
    const card = (metrics: readonly (MetricReading<unknown> | undefined)[]) => ({
      shown: metrics.some((metric) => metric !== undefined),
      newest: newestOf(metrics),
    });
    return {
      temperature: card([r.temperature, r.dewPoint, r.humidity]),
      wind: card([r.wind, r.gust, r.windDirection]),
      rain: card([r.raining, r.precipitation]),
      pressure: card([r.pressure]),
      light: card([r.illuminance, r.uv]),
      air: card([r.airQualityLevel, r.pm25, r.pm10, r.pm1]),
    };
  });

  /**
   * A metric is marked when the service calls it stale and the rest of its card is not - when all
   * of them are, the age of the card says it once.
   */
  protected outOfDate(
    metric: MetricReading<unknown>,
    card: { readonly newest?: { readonly allStale: boolean } },
  ): boolean {
    return metric.stale && !card.newest?.allStale;
  }

  /** The point of the compass the wind comes from; `undefined` while not known. */
  protected readonly windFrom = computed(() => {
    const direction = this.reading().windDirection;
    return direction === undefined ? undefined : compassPoint(direction.value);
  });

  /** The status of the station as the card shows it: what the service says, field by field. */
  protected readonly station = computed(() => {
    const status = this.status.value();
    const reachable = status?.gateway?.reachable;
    const silent = status?.silent;
    return {
      /** No gateway in the answer: the registry has no station. */
      registered: status !== undefined && status !== null && status.gateway !== undefined,
      reachable: typeof reachable === 'boolean' ? reachable : undefined,
      lastReadingAt: status?.lastReadingAt,
      silent: typeof silent === 'boolean' ? silent : undefined,
    };
  });

  /**
   * The air quality sensor as the status names it (weather-service 0.5.0; its silence and the smog since 0.7.0):
   * `undefined` while the status is not known or names no sensor - an older service, or none in the registry.
   */
  protected readonly airSensor = computed(() => {
    const sensor = this.status.value()?.airSensor;
    if (typeof sensor !== 'object' || sensor === null) {
      return undefined;
    }
    const smog = sensor.smog;
    return {
      reachable: typeof sensor.reachable === 'boolean' ? sensor.reachable : undefined,
      silent: sensor.silent === true,
      // an open episode; its start only when it is a time of the house
      smog:
        typeof smog === 'object' && smog !== null
          ? { since: parseHouseDateTime(smog.since) ? smog.since : undefined }
          : undefined,
    };
  });
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { AIR_LEVEL_LABELS } from '../../data-access/weather/air-quality';
import { CurrentWeatherStore } from '../../data-access/weather/current-weather-store';
import { leadingIcon, newestOf, toWeatherReading } from '../../data-access/weather/weather-reading';
import { DisplayText } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { AirLevelDot } from '../../shared/air-quality/air-level-dot';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { APP_CONFIG } from '../config/app-config';
import { numberFormat } from '../i18n/intl-formats';
import { LanguageStore } from '../i18n/language-store';

/** Why the strip is no more than an icon: the call failed, or the station was heard of nothing. */
type Collapsed = { readonly failure: DisplayText } | { readonly noReading: true };

/**
 * The weather outside, in the panel of every page and for everybody - the picker too: the
 * temperature and the humidity, led by an icon of rain or of a strong wind (the thermometer when
 * neither), with the age of the reading. What the answer leaves out is not drawn, and the age is
 * that of the reading (`measuredAt`), not of the call: the service keeps the last value of a
 * station that fell silent, and says so with `stale`.
 *
 * Not a card. A call that fails keeps the last reading on screen, its age marked with the
 * warning, and the reason is the tooltip of the strip (owner, 2026-10-16). With no reading to show
 * - a station not heard since the service started, or a call that failed before any answer - the
 * strip collapses to an icon whose tooltip says why. Either way the tooltip is there for a
 * keyboard and for a tap on a phone; its touch gestures are off, or a swipe starting on the panel
 * would not scroll.
 */
@Component({
  selector: 'app-weather-strip',
  imports: [
    MatIconModule,
    MatTooltipModule,
    TranslocoDirective,
    AirLevelDot,
    DisplayTextPipe,
    HouseAgePipe,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      @if (collapsed(); as why) {
        <button
          type="button"
          class="weather weather--collapsed"
          data-testid="weather-strip"
          [attr.aria-label]="t('weather.label')"
          [matTooltip]="
            'failure' in why
              ? t('weather.unavailable') + ' ' + (why.failure | displayText)
              : t('weather.noReading')
          "
          matTooltipTouchGestures="off"
          #tip="matTooltip"
          (click)="tip.show()"
        >
          <mat-icon aria-hidden="true">cloud_off</mat-icon>
        </button>
      } @else if (!weather.loading()) {
        @let r = reading();
        @let failure = weather.error();
        <!-- a failed call keeps the last reading, marked; the reason is the tooltip of the strip,
             which then takes the focus and a tap -->
        <div
          class="weather"
          [class.weather--failed]="failure"
          role="group"
          data-testid="weather-strip"
          [attr.aria-label]="t('weather.label')"
          [attr.tabindex]="failure ? 0 : null"
          [matTooltip]="
            failure ? t('weather.unavailable') + ' ' + (describe(failure) | displayText) : ''
          "
          [matTooltipDisabled]="!failure"
          matTooltipTouchGestures="off"
          #reason="matTooltip"
          (click)="failure && reason.show()"
          (keydown.enter)="failure && reason.show()"
        >
          <mat-icon class="weather__icon" aria-hidden="true">{{ icon() }}</mat-icon>
          <span class="weather__text">
            <span class="weather__values">
              @if (icon() === 'rainy') {
                <span class="visually-hidden">{{ t('weather.raining') }}</span>
              } @else if (icon() === 'air') {
                <span class="visually-hidden">{{ t('weather.windy') }}</span>
              }
              @if (r.temperature; as temperature) {
                <strong data-testid="weather-temperature"
                  >{{ temperature.value | localNumber: ONE_DECIMAL }} °C</strong
                >
              }
              @if (r.humidity; as humidity) {
                <span data-testid="weather-humidity"
                  ><span class="visually-hidden">{{ t('weather.humidity') }}&ngsp;</span
                  >{{ humidity.value | localNumber: WHOLE }} %</span
                >
              }
              <!-- the air quality (HAS-431): a dot in the colour of its level, the word and PM10 in its tooltip and
                   its name; drawn only while the sensor gives a level that is not out of date -->
              @if (air(); as level) {
                <span
                  class="weather__air"
                  role="button"
                  data-testid="weather-air"
                  [attr.data-level]="level.level"
                  [attr.aria-label]="level.text"
                  tabindex="0"
                  [matTooltip]="level.text"
                  matTooltipTouchGestures="off"
                  #airTip="matTooltip"
                  (click)="$event.stopPropagation(); airTip.show()"
                  (keydown.enter)="$event.stopPropagation(); airTip.show()"
                  (keydown.space)="$event.preventDefault(); $event.stopPropagation(); airTip.show()"
                  ><app-air-level-dot [level]="level.level"
                /></span>
              }
            </span>
            @let last = newest();
            @if (last || failure) {
              <span
                class="weather__age"
                [class.weather__age--stale]="last?.allStale || weather.stale()"
                data-testid="weather-age"
              >
                @if (last?.allStale || weather.stale()) {
                  <mat-icon aria-hidden="true">warning</mat-icon>&ngsp;
                }
                @if (last) {
                  <span>{{ last.measuredAt | houseAge }}</span>
                }
                @if (failure) {
                  <!-- the reason itself is the tooltip, which a screen reader hears as well -->
                  <span class="visually-hidden">&ngsp;{{ t('weather.unavailable') }}</span>
                } @else if (last?.allStale) {
                  <span class="visually-hidden">&ngsp;{{ t('weather.outOfDate') }}</span>
                } @else if (weather.stale()) {
                  <!-- the station may be fine: it is the call that is late -->
                  <span class="visually-hidden">&ngsp;{{ t('weather.late') }}</span>
                }
              </span>
            }
          </span>
        </div>
      }
    </ng-container>
  `,
  styleUrl: './weather-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherStrip {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;
  private readonly locale = inject(LanguageStore).locale;
  protected readonly weather = inject(CurrentWeatherStore).current;

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  protected readonly reading = computed(() => toWeatherReading(this.weather.value(), this.zone));
  protected readonly icon = computed(() => leadingIcon(this.reading()));

  /** The level of the air quality and its words - the tooltip of its dot, and what a screen reader hears. */
  protected readonly air = computed(() => {
    // read so that the words follow the language
    this.language();
    const { airQualityLevel, pm10 } = this.reading();
    // a level the sensor has not confirmed for half an hour is not the air now: the age of the strip is the station's
    if (airQualityLevel === undefined || airQualityLevel.stale) {
      return undefined;
    }
    const level = this.transloco.translate(AIR_LEVEL_LABELS[airQualityLevel.value]);
    const text =
      pm10 === undefined
        ? this.transloco.translate('weather.air.strip', { level })
        : this.transloco.translate('weather.air.stripPm10', {
            level,
            value: numberFormat(this.locale(), this.WHOLE).format(pm10.value),
          });
    return { level: airQualityLevel.value, text };
  });
  /** The last the station was heard of what the strip shows. */
  protected readonly newest = computed(() => {
    const { temperature, humidity, raining, wind } = this.reading();
    return newestOf([
      temperature,
      humidity,
      this.icon() === 'rainy' ? raining : undefined,
      this.icon() === 'air' ? wind : undefined,
    ]);
  });

  protected readonly describe = describeApiError;

  /** Whether the strip has anything to show: the thermometer alone would read as a reading. */
  private readonly shown = computed(() => {
    const reading = this.reading();
    return (
      reading.temperature !== undefined ||
      reading.humidity !== undefined ||
      this.icon() !== 'device_thermostat'
    );
  });

  /**
   * The strip is an icon only while it has no reading to show: a call that fails after an answer
   * leaves that answer on screen, marked (owner, 2026-10-16).
   */
  protected readonly collapsed = computed((): Collapsed | undefined => {
    if (this.weather.loading() || this.shown()) {
      return undefined;
    }
    const error = this.weather.error();
    return error !== undefined ? { failure: describeApiError(error) } : { noReading: true };
  });
}

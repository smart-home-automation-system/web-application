import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { WeatherApi } from '../../data-access/weather/weather-api';
import { leadingIcon, newestOf, toWeatherReading } from '../../data-access/weather/weather-reading';
import { DisplayText } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { APP_CONFIG } from '../config/app-config';

/** Why the strip is no more than an icon: the call failed, or the station was heard of nothing. */
type Collapsed = { readonly failure: DisplayText } | { readonly noReading: true };

/**
 * The weather outside, in the panel of every page and for everybody - the picker too: the
 * temperature and the humidity, led by an icon of rain or of a strong wind (the thermometer when
 * neither), with the age of the reading. What the answer leaves out is not drawn, and the age is
 * that of the reading (`measuredAt`), not of the call: the service keeps the last value of a
 * station that fell silent, and says so with `stale`.
 *
 * Not a card: a failed call - or a station not heard since the service started - collapses the
 * strip to an icon, and the reason is its tooltip. The icon is a button, so the tooltip is there
 * for a keyboard and for a tap on a phone; the touch gestures of the tooltip are off, or a swipe
 * starting on the panel would not scroll.
 */
@Component({
  selector: 'app-weather-strip',
  imports: [
    MatIconModule,
    MatTooltipModule,
    TranslocoDirective,
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
          (click)="tip.toggle()"
        >
          <mat-icon aria-hidden="true">cloud_off</mat-icon>
        </button>
      } @else if (!weather.loading()) {
        @let r = reading();
        <div
          class="weather"
          role="group"
          data-testid="weather-strip"
          [attr.aria-label]="t('weather.label')"
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
            </span>
            @if (newest(); as last) {
              <span
                class="weather__age"
                [class.weather__age--stale]="last.allStale || weather.stale()"
                data-testid="weather-age"
              >
                @if (last.allStale) {
                  <mat-icon aria-hidden="true">warning</mat-icon>&ngsp;
                }
                <span>{{ last.measuredAt | houseAge }}</span>
                @if (last.allStale) {
                  <span class="visually-hidden">&ngsp;{{ t('weather.outOfDate') }}</span>
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
  protected readonly weather = inject(WeatherApi).watchCurrent();

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  protected readonly reading = computed(() => toWeatherReading(this.weather.value(), this.zone));
  protected readonly icon = computed(() => leadingIcon(this.reading()));
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

  protected readonly collapsed = computed((): Collapsed | undefined => {
    const error = this.weather.error();
    if (error !== undefined) {
      return { failure: describeApiError(error) };
    }
    if (this.weather.loading()) {
      return undefined;
    }
    // nothing the strip shows: the thermometer alone would read as a reading
    const reading = this.reading();
    const shown =
      reading.temperature !== undefined ||
      reading.humidity !== undefined ||
      this.icon() !== 'device_thermostat';
    return shown ? undefined : { noReading: true };
  });
}

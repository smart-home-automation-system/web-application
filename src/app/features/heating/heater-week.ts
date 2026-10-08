import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { houseWeekMinute } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { SchedulePeriod, clockTime, toWeek } from './room-views';

const MINUTES_OF_A_DAY = 24 * 60;
/** 1 January 2024 was a Monday: the days of that week give the names of the weekdays. */
const A_MONDAY = Date.UTC(2024, 0, 1);
const A_DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * The week of one heater, read-only: a bar from 00:00 to 24:00 per day, filled where a period
 * of the schedule is on, with the periods in words next to it - the bar alone tells neither the
 * times nor the temperature. Today's row is marked, and a line on it shows where the clock of
 * the house is now.
 *
 * The bars are a picture of the words beside them, so a screen reader is given the words only.
 */
@Component({
  selector: 'app-heater-week',
  imports: [TranslocoDirective, LocalNumberPipe],
  template: `
    <ng-container *transloco="let t">
      <ul class="week">
        @for (day of week(); track $index) {
          <li class="week__day" [class.week__day--today]="$index === now().day">
            <span class="week__name">
              {{ dayNames()[$index] }}
              @if ($index === now().day) {
                <span class="visually-hidden">&ngsp;({{ t('heating.rooms.schedule.today') }})</span>
              }
            </span>
            <span class="week__lane" aria-hidden="true">
              @for (period of day; track $index) {
                <span
                  class="week__period"
                  [style.left.%]="period.offset"
                  [style.width.%]="period.width"
                ></span>
              }
              @if ($index === now().day) {
                <span class="week__now" [style.left.%]="nowOffset()"></span>
              }
            </span>
            <span class="week__periods">
              @for (period of day; track $index) {
                <span class="week__text"
                  >{{ clock(period.start) }}–{{ clock(period.end) }}&ngsp;·&ngsp;{{
                    period.temperature | localNumber: ONE_DECIMAL
                  }}&nbsp;°C</span
                >
              } @empty {
                <span class="week__text week__text--none">{{
                  t('heating.rooms.schedule.noneThatDay')
                }}</span>
              }
            </span>
          </li>
        }
      </ul>
    </ng-container>
  `,
  styleUrl: './heater-week.scss',
  // a row is a day and its periods side by side: they are read with the space between them
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaterWeek {
  readonly periods = input.required<readonly SchedulePeriod[]>();

  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly locale = inject(LanguageStore).locale;

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly clock = clockTime;

  protected readonly week = computed(() => toWeek(this.periods()));

  /** Where the house is in its week - its clock, not the one of the browser. */
  protected readonly now = computed(() => houseWeekMinute(this.ticker.now(), this.zone), {
    equal: (a, b) => a.day === b.day && a.minute === b.minute,
  });
  protected readonly nowOffset = computed(() => (this.now().minute / MINUTES_OF_A_DAY) * 100);

  protected readonly dayNames = computed(() => {
    const format = dateTimeFormat(this.locale(), { weekday: 'short', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, day) => format.format(A_MONDAY + day * A_DAY_MS));
  });
}

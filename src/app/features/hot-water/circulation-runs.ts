import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { QueryResource } from '../../core/api/query-resource';
import { APP_CONFIG } from '../../core/config/app-config';
import { HistoryRange, sameRange } from '../../core/time/history-range';
import { CirculationRun } from '../../data-access/water/water-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { durationText, stoppedByText, toRunRows, triggerText } from './circulation-views';
import { describeWaterError } from './water-errors';

/**
 * The runs of the circulation pump today (HAS-406, `GET /water/circulation/runs` of `water-service` >= 0.13.0): the
 * time, what started it, how long it went and how it ended, newest first. The page owns the resource - it reads it
 * again after a start of its own - and gives it here with the day it asks for.
 *
 * The answer is tagged with its day: at midnight the runs of yesterday are not shown under "today" while the new
 * day is asked for, a progress bar is (the rule of the presence reports). A run going on has no end and no length;
 * a value the answer leaves out is "not known", never 0.
 */
@Component({
  selector: 'app-circulation-runs',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './circulation-runs.html',
  styleUrl: './circulation-runs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class CirculationRuns {
  readonly runs = input.required<QueryResource<HistoryRange, readonly CirculationRun[] | null>>();
  readonly day = input.required<HistoryRange>();

  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  protected readonly describeWater = describeWaterError;
  protected readonly triggerText = triggerText;
  protected readonly stoppedByText = stoppedByText;
  protected readonly durationText = durationText;
  protected readonly time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  protected readonly oneDecimal: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  /** The answer of the day on screen; `undefined` while another day is answered or nothing yet. */
  private readonly shown = computed(() => {
    const answered = this.runs().value();
    return answered !== undefined && sameRange(answered.query, this.day()) ? answered : undefined;
  });

  /** Nothing of this day has come back yet - neither an answer nor a failure. */
  protected readonly waiting = computed(() => {
    const settled = this.runs().settledFor();
    return (
      this.shown() === undefined && (settled === undefined || !sameRange(settled.query, this.day()))
    );
  });

  /** `undefined` for a 200 without a body: which runs there were is not known - not "none". */
  protected readonly rows = computed(() => {
    const answer = this.shown()?.answer;
    return answer === null || answer === undefined ? undefined : toRunRows(answer, this.zone);
  });

  protected readonly answered = computed(() => this.shown() !== undefined);
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { HeatingApi } from '../../data-access/heating/heating-api';
import { ChartLine, scheduleLine, summarise, toLine } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { historyPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { SchedulePeriod } from '../../shared/room-heating/room-views';

/**
 * The stored temperatures of one room over the last day, week or month, with what its
 * schedules ask for as a dashed line of steps.
 *
 * **Made anew for every room** - it lives in the panel of the room that is open - so its
 * resource is for one room for as long as it lives, and only the range can change under it.
 *
 * The dashed line is **the schedule the room has now**, laid over every day of the period: the
 * target of a past day is stored nowhere (owner, 2026-10-09), so it is named "current
 * schedule" and the note under the chart says what it is not.
 */
@Component({
  selector: 'app-room-history',
  imports: [TranslocoDirective, HistoryChart, HistoryFrame, LocalNumberPipe],
  templateUrl: './room-history.html',
  styleUrl: './room-history.scss',
  // a fact is a name and two numbers side by side: without the white space between them a
  // screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomHistory {
  /** The identifier of the room in the backend, as the list of rooms gives it. */
  readonly room = input.required<string>();
  /** The periods of each heater of the room that can be drawn; none for a room without one. */
  readonly schedules = input<readonly (readonly SchedulePeriod[])[]>([]);

  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  protected readonly period = historyPeriod();
  protected readonly history = inject(HeatingApi).watchRoomHistory(
    () => this.room(),
    this.period.range,
  );
  protected readonly shown = shownHistory(this.history, this.period);
  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  private readonly measured = computed((): ChartLine | undefined => {
    // read so that the name follows the language
    this.language();
    const answer = this.shown.answer();
    const points = toLine(answer?.points, answer?.bucketSeconds, (point) => point['value']);
    return points.length === 0
      ? undefined
      : {
          key: 'temperature',
          name: this.transloco.translate('heating.rooms.history.temperature'),
          color: 1,
          points,
        };
  });

  private readonly scheduled = computed((): ChartLine | undefined => {
    this.language();
    const axis = this.shown.axis();
    const points = axis === undefined ? [] : scheduleLine(this.schedules(), axis);
    return points.length === 0
      ? undefined
      : {
          key: 'schedule',
          name: this.transloco.translate('heating.rooms.history.schedule'),
          color: 4,
          points,
          dashed: true,
        };
  });

  /** Whether there is a reading to draw: a schedule alone is no history. */
  protected readonly hasReadings = computed(() => this.measured() !== undefined);
  protected readonly hasSchedule = computed(() => this.scheduled() !== undefined);

  protected readonly lines = computed(() =>
    [this.measured(), this.scheduled()].filter((line) => line !== undefined),
  );

  /** The lowest and the highest temperature of the period: what the picture says, in numbers. */
  protected readonly extremes = computed(() => {
    const line = this.measured();
    return line === undefined ? undefined : summarise(line.points);
  });
}

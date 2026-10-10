import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { HOT_WATER_BAND, WaterApi } from '../../data-access/water/water-api';
import { ChartLine, summarise, toLine } from '../../shared/history-chart/chart-data';
import { ChartBand } from '../../shared/history-chart/chart-option';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { historyPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/**
 * The history of the hot water: the temperature of the tank and of the circulation over the
 * last day, week or month, with the band the tank is kept in.
 *
 * One call feeds it, so it is one card. The service averages the readings into buckets and
 * chooses their width; a bucket without a reading has no point, and the line is broken there -
 * a gap is drawn as a gap, never bridged.
 */
@Component({
  selector: 'app-water-history',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    HistoryChart,
    HistoryFrame,
    LocalNumberPipe,
  ],
  templateUrl: './water-history.html',
  styleUrl: './water-history.scss',
  // a fact is a name and two numbers side by side: without the white space between them a
  // screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterHistory {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  protected readonly period = historyPeriod();
  protected readonly history = inject(WaterApi).watchHistory(this.period.range);
  protected readonly shown = shownHistory(this.history, this.period.range);
  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  protected readonly lines = computed((): ChartLine[] => {
    // read so that the names follow the language
    this.language();
    const answer = this.shown.answer();
    const line = (key: 'water' | 'circulation', color: 1 | 2, name: string): ChartLine => ({
      key,
      name: this.transloco.translate(name),
      color,
      points: toLine(answer?.points, answer?.bucketSeconds, (point) => point[key]),
    });
    return [
      line('water', 1, 'hotWater.history.tank'),
      line('circulation', 2, 'hotWater.history.circulation'),
    ].filter((one) => one.points.length > 0);
  });

  /** Per line its lowest and highest value: what the picture says, in numbers. */
  protected readonly facts = computed(() =>
    this.lines().flatMap((line) => {
      const summary = summarise(line.points);
      return summary === undefined ? [] : [{ key: line.key, name: line.name, ...summary }];
    }),
  );

  protected readonly bandLimits = HOT_WATER_BAND;

  protected readonly band = computed((): ChartBand => {
    this.language();
    return { ...HOT_WATER_BAND, name: this.transloco.translate('hotWater.history.band') };
  });
}

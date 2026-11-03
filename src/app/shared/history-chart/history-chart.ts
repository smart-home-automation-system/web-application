import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { ChartLine, gapAround } from './chart-data';
import { drawChart } from './chart-drawing';
import { ChartBand, chartOption } from './chart-option';

/**
 * Lines over time - the history of a temperature. It draws what it is given and knows nothing
 * of where it came from: the caller reads its answer into lines (`toLine`), which is also where
 * a missing bucket becomes a break.
 *
 * The times are wall-clock times of the house (`from`, `to` and every point lie on the
 * wall-clock timeline), shown as they are in whatever zone the browser is in.
 *
 * The chart takes its colours from the theme - the lines `--app-chart-1` ... `-5`, in the order
 * the caller names them - and is drawn again when the season or the scheme changes: a drawing
 * holds colours, not variables.
 *
 * The picture has no text a screen reader could follow, so it is an image with the name the
 * caller gives it; what the lines say in numbers belongs next to it, in words.
 *
 * The library is downloaded when the first chart is shown. A download that fails - the house
 * out of reach for a moment, a file of a version that was replaced by a deploy - is said in
 * place of the picture and tried again whenever the lines change, which every poll does.
 */
@Component({
  selector: 'app-history-chart',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <div
        #plot
        class="chart__plot"
        role="img"
        [class.chart__plot--failed]="failed()"
        [attr.aria-label]="label()"
      ></div>
      @if (gaps() > 0) {
        <!-- the dotted bridges are drawing only: a screen reader is told of them in words -->
        <span class="visually-hidden" data-testid="chart-gaps">{{
          t('history.gaps', { count: gaps() })
        }}</span>
      }
      @if (failed()) {
        <p class="chart__failed" role="status" data-testid="chart-failed">
          {{ t('history.chartFailed') }}
        </p>
      }
    </ng-container>
  `,
  styleUrl: './history-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryChart {
  readonly lines = input.required<readonly ChartLine[]>();
  /** The ends of the axis, on the wall-clock timeline of the house. */
  readonly from = input.required<number>();
  readonly to = input.required<number>();
  /** What the picture shows, for whoever cannot see it. */
  readonly label = input.required<string>();
  readonly band = input<ChartBand>();
  readonly unit = input('°C');
  /** A logarithmic value axis; every value has to be above zero. */
  readonly logarithmic = input(false);
  /** Decimals of a value in the tooltip; one or two when not given. */
  readonly decimals = input<number>();
  /** What the value can never go past; the axis never steps over it. */
  readonly bounds = input<{ readonly min?: number; readonly max?: number }>();

  private readonly languages = inject(LanguageStore);
  private readonly locale = this.languages.locale;
  private readonly transloco = inject(TranslocoService);
  /** What the tooltip says inside a gap; read with the language, so that it follows it. */
  private readonly noReadings = computed(() => {
    this.languages.language();
    return this.transloco.translate('history.noReadings');
  });
  /** The gaps of the measured lines - what the faint dotted bridges stand for (HAS-375). */
  protected readonly gaps = computed(() =>
    this.lines()
      .filter((line) => !line.dashed && !line.bars)
      .reduce(
        (count, line) =>
          count +
          line.points.filter((_, index) => gapAround(line.points, index) !== undefined).length,
        0,
      ),
  );
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');
  /** The library could not be downloaded; cleared by the attempt that succeeds. */
  protected readonly failed = drawChart(
    () => this.plot().nativeElement,
    () => ({
      lines: this.lines(),
      from: this.from(),
      to: this.to(),
      band: this.band(),
      unit: this.unit(),
      locale: this.locale(),
      logarithmic: this.logarithmic(),
      decimals: this.decimals(),
      bounds: this.bounds(),
      noReadings: this.noReadings(),
    }),
    chartOption,
  );
}

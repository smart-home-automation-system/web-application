import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { LanguageStore } from '../../core/i18n/language-store';
import { ThemeStore } from '../../core/theme/theme-store';
import { ChartLine } from './chart-data';
import { ChartEngine, DrawnChart } from './chart-engine';
import { ChartBand, ChartColors, chartOption } from './chart-option';

const LINE_COLORS = [1, 2, 3, 4, 5].map((index) => `var(--app-chart-${index})`);

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
 */
@Component({
  selector: 'app-history-chart',
  template: `<div #plot class="chart__plot" role="img" [attr.aria-label]="label()"></div>`,
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

  private readonly engine = inject(ChartEngine);
  private readonly theme = inject(ThemeStore);
  private readonly locale = inject(LanguageStore).locale;
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');
  private readonly chart = signal<DrawnChart | undefined>(undefined);

  constructor() {
    const destroyRef = inject(DestroyRef);
    let gone = false;
    let observer: ResizeObserver | undefined;
    destroyRef.onDestroy(() => {
      gone = true;
      observer?.disconnect();
      this.chart()?.dispose();
    });

    // after the first render there is an element to draw into; the library arrives a moment later
    let asked = false;
    afterRenderEffect(() => {
      const host = this.plot().nativeElement;
      if (asked) {
        return;
      }
      asked = true;
      void this.engine.create(host).then((chart) => {
        if (gone) {
          chart.dispose();
          return;
        }
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => chart.resize());
          observer.observe(host);
        }
        this.chart.set(chart);
      });
    });

    // After the render, so that the attributes of the theme are on the page when the colours
    // are read back from it.
    afterRenderEffect(() => {
      const chart = this.chart();
      // read here, so that a change of either draws the chart again
      this.theme.season();
      this.theme.scheme();
      const option = {
        lines: this.lines(),
        from: this.from(),
        to: this.to(),
        band: this.band(),
        unit: this.unit(),
        locale: this.locale(),
      };
      chart?.draw(chartOption(option, readColors(this.plot().nativeElement)));
    });
  }
}

/**
 * The colours of the theme as values. They are CSS variables written with `light-dark()`, which
 * only the browser can resolve - so each is given to an element as its colour and read back.
 */
function readColors(host: HTMLElement): ChartColors {
  const probe = host.ownerDocument.createElement('span');
  probe.hidden = true;
  host.appendChild(probe);
  const resolve = (color: string) => {
    probe.style.color = color;
    return getComputedStyle(probe).color;
  };
  try {
    return {
      lines: LINE_COLORS.map(resolve),
      text: resolve('var(--mat-sys-on-surface-variant)'),
      strongText: resolve('var(--mat-sys-on-surface)'),
      grid: resolve('var(--mat-sys-outline)'),
      surface: resolve('var(--mat-sys-surface-container-high)'),
      fontFamily: getComputedStyle(host).fontFamily,
    };
  } finally {
    probe.remove();
  }
}

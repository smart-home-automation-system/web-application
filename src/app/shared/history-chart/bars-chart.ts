import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';

import { numberFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { ThemeStore } from '../../core/theme/theme-store';
import { ChartEngine, DrawnChart } from './chart-engine';
import { ChartColors } from './chart-option';
import { readColors } from './history-chart';

/** One row of bars: a value per category, `null` where it is not known - no bar, never 0. */
export interface BarSeries {
  /** A name for tests and tracking; never shown. */
  readonly key: string;
  /** The name in the legend and the tooltip, in the language of the interface. */
  readonly name: string;
  readonly color: 1 | 2 | 3 | 4 | 5;
  readonly values: readonly (number | null)[];
}

export interface BarsInput {
  /** The names of the categories - days, months - in the language of the interface, in order. */
  readonly categories: readonly string[];
  readonly series: readonly BarSeries[];
  readonly unit: string;
  readonly decimals: number;
  readonly locale: string;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? '',
  );

/**
 * What ECharts is asked to draw for bars by category - the closed days of the energy (HAS-341): an
 * amount per day, side by side per series, on an axis from nothing. A pure function, read by a
 * test without a browser that draws. The tooltip is HTML: every name in it is escaped.
 */
export function barsOption(input: BarsInput, colors: ChartColors): EChartsCoreOption {
  const value = numberFormat(input.locale, {
    minimumFractionDigits: input.decimals,
    maximumFractionDigits: input.decimals,
  });
  const axisValue = numberFormat(input.locale, { maximumFractionDigits: 1 });
  const text = { color: colors.text, fontFamily: colors.fontFamily };
  const unit = escapeHtml(input.unit);
  return {
    animation: false,
    textStyle: text,
    color: input.series.map((series) => colors.lines[series.color - 1]),
    grid: { left: 52, right: 16, top: 36, bottom: 28 },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { ...text, color: colors.strongText },
      selectedMode: false,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.grid,
      textStyle: { ...text, color: colors.strongText },
      axisPointer: { type: 'shadow' },
      formatter: (hovered: unknown) => {
        const rows = (Array.isArray(hovered) ? hovered : [hovered]) as {
          readonly seriesIndex?: number;
          readonly dataIndex?: number;
          readonly marker?: string;
        }[];
        const index = rows[0]?.dataIndex;
        const head = index === undefined ? '' : escapeHtml(input.categories[index] ?? '');
        const lines = rows.flatMap((row) => {
          const series = row.seriesIndex === undefined ? undefined : input.series[row.seriesIndex];
          const amount =
            series === undefined || row.dataIndex === undefined
              ? undefined
              : series.values[row.dataIndex];
          return series === undefined || amount === null || amount === undefined
            ? []
            : [
                `${row.marker ?? ''}${escapeHtml(series.name)}: <strong>${value.format(amount)} ${unit}</strong>`,
              ];
        });
        return [head, ...lines].join('<br>');
      },
    },
    xAxis: {
      type: 'category',
      data: input.categories,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { lineStyle: { color: colors.grid } },
      axisLabel: { ...text, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { ...text, formatter: (at: number) => `${axisValue.format(at)} ${input.unit}` },
      splitLine: { lineStyle: { color: colors.grid, opacity: 0.35 } },
    },
    series: input.series.map((series) => ({
      type: 'bar',
      id: series.key,
      name: series.name,
      data: series.values,
      barMaxWidth: 14,
      emphasis: { disabled: true },
    })),
  };
}

/**
 * Bars by category, with the colours of the theme - the counterpart of `HistoryChart` for amounts
 * per day or month, where a time axis would put a day at its midnight. The same door to the
 * library, the same reading of the colours, the same words when it could not be downloaded.
 */
@Component({
  selector: 'app-bars-chart',
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
export class BarsChart {
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly BarSeries[]>();
  readonly unit = input.required<string>();
  readonly decimals = input(1);
  /** What the picture shows, for whoever cannot see it. */
  readonly label = input.required<string>();

  private readonly engine = inject(ChartEngine);
  private readonly theme = inject(ThemeStore);
  private readonly locale = inject(LanguageStore).locale;
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');
  private readonly chart = signal<DrawnChart | undefined>(undefined);
  protected readonly failed = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    let gone = false;
    let observer: ResizeObserver | undefined;
    destroyRef.onDestroy(() => {
      gone = true;
      observer?.disconnect();
      this.chart()?.dispose();
    });

    let asking = false;
    afterRenderEffect(() => {
      const host = this.plot().nativeElement;
      this.series();
      if (asking || untracked(this.chart) !== undefined) {
        return;
      }
      asking = true;
      this.engine
        .create(host)
        .then((chart) => {
          if (gone) {
            chart.dispose();
            return;
          }
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => chart.resize());
            observer.observe(host);
          }
          this.failed.set(false);
          this.chart.set(chart);
        })
        .catch(() => this.failed.set(true))
        .finally(() => (asking = false));
    });

    afterRenderEffect(() => {
      const chart = this.chart();
      this.theme.season();
      this.theme.scheme();
      const option = {
        categories: this.categories(),
        series: this.series(),
        unit: this.unit(),
        decimals: this.decimals(),
        locale: this.locale(),
      };
      chart?.draw(barsOption(option, readColors(this.plot().nativeElement)));
    });
  }
}

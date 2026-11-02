import { DestroyRef, Signal, afterRenderEffect, inject, signal, untracked } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ThemeStore } from '../../core/theme/theme-store';
import { ChartEngine, DrawnChart } from './chart-engine';
import { ChartColors } from './chart-option';

const LINE_COLORS = [1, 2, 3, 4, 5].map((index) => `var(--app-chart-${index})`);

/**
 * Draws a chart into the element `plot` gives - what `HistoryChart` and `BarsChart` share: the
 * library asked for once at a time after the first render, and again with new data after an
 * attempt that failed (the house out of reach, a file a deploy replaced); the chart resized with its
 * element, drawn again whenever the data, the season or the scheme changes, and disposed with its
 * component. Call in an injection context, the constructor of the component. Answers whether the
 * library could not be downloaded - cleared by the attempt that succeeds.
 *
 * `data` is read in both effects: every signal it reads draws the chart again.
 */
export function drawChart<T>(
  plot: () => HTMLElement,
  data: () => T,
  option: (data: T, colors: ChartColors) => EChartsCoreOption,
): Signal<boolean> {
  const engine = inject(ChartEngine);
  const theme = inject(ThemeStore);
  const chart = signal<DrawnChart | undefined>(undefined);
  const failed = signal(false);
  let gone = false;
  let observer: ResizeObserver | undefined;
  inject(DestroyRef).onDestroy(() => {
    gone = true;
    observer?.disconnect();
    chart()?.dispose();
  });

  // After the first render there is an element to draw into; the library arrives a moment
  // later. Asked for once at a time, and again with new data after an attempt that failed.
  let asking = false;
  afterRenderEffect(() => {
    const host = plot();
    data();
    if (asking || untracked(chart) !== undefined) {
      return;
    }
    asking = true;
    engine
      .create(host)
      .then((created) => {
        if (gone) {
          created.dispose();
          return;
        }
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => created.resize());
          observer.observe(host);
        }
        failed.set(false);
        chart.set(created);
      })
      .catch(() => failed.set(true))
      .finally(() => (asking = false));
  });

  // After the render, so that the attributes of the theme are on the page when the colours
  // are read back from it.
  afterRenderEffect(() => {
    const drawn = chart();
    // read here, so that a change of either draws the chart again
    theme.season();
    theme.scheme();
    const shown = data();
    drawn?.draw(option(shown, readColors(plot())));
  });

  return failed.asReadonly();
}

/**
 * The colours of the theme as values. They are CSS variables written with `light-dark()`, which
 * only the browser can resolve - so each is given to an element as its colour and read back.
 */
export function readColors(host: HTMLElement): ChartColors {
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

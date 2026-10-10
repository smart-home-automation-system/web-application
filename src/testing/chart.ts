import { Provider } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartEngine, DrawnChart } from '../app/shared/history-chart/chart-engine';

/** The charts a test rendered: what each was last asked to draw. */
export class RecordedCharts {
  /** One entry per chart on the page, in the order they were made; `undefined` until drawn. */
  readonly drawn: (EChartsCoreOption | undefined)[] = [];
  disposed = 0;

  /** The lines of a chart as the library was given them: name and points. */
  lines(chart = 0): { readonly name: string; readonly data: readonly unknown[] }[] {
    const series = (this.drawn[chart]?.['series'] ?? []) as {
      readonly name: string;
      readonly data: readonly unknown[];
    }[];
    return series.map((line) => ({ name: line.name, data: line.data }));
  }
}

/**
 * An engine that draws nothing and remembers what it was asked to draw. The DOM of the unit
 * tests cannot measure or draw, and the library is half a megabyte nobody needs to load there:
 * what a test can check is the drawing the library is handed.
 */
export function provideChartTesting(charts: RecordedCharts): Provider {
  const engine: Pick<ChartEngine, 'create'> = {
    create: () => {
      const index = charts.drawn.push(undefined) - 1;
      const chart: DrawnChart = {
        draw: (option) => (charts.drawn[index] = option),
        resize: () => undefined,
        dispose: () => charts.disposed++,
      };
      return Promise.resolve(chart);
    },
  };
  return { provide: ChartEngine, useValue: engine };
}

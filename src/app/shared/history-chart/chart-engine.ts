import { Injectable } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

/** A chart drawn into an element: given what to draw, resized with its element, and removed. */
export interface DrawnChart {
  draw(option: EChartsCoreOption): void;
  resize(): void;
  dispose(): void;
}

/**
 * The one door to the charting library. It is downloaded on the first call, as a chunk of its
 * own; a unit test provides an engine of its own instead, because the DOM of the tests cannot
 * measure or draw.
 */
@Injectable({ providedIn: 'root' })
export class ChartEngine {
  async create(host: HTMLElement): Promise<DrawnChart> {
    const { init } = await import('./echarts-kit');
    const chart = init(host, undefined, { renderer: 'svg' });
    return {
      // every drawing replaces the one before: a line that is gone must not stay
      draw: (option) => chart.setOption(option, { notMerge: true }),
      resize: () => chart.resize(),
      dispose: () => chart.dispose(),
    };
  }
}

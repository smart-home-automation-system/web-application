import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components';
import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

/**
 * The parts of ECharts a history chart needs, and nothing else of it. This file is imported
 * with `import()` only (`chart-engine.ts`), so the library is a chunk of its own, downloaded by
 * the first view that shows a chart and never part of the first download.
 *
 * SVG, not canvas: sharp at every zoom of a phone, and a test can look at what was drawn.
 */
use([LineChart, GridComponent, LegendComponent, MarkAreaComponent, TooltipComponent, SVGRenderer]);

export { init };

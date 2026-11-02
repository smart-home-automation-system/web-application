import { barsOption } from './bars-chart';
import { ChartColors } from './chart-option';

const COLORS: ChartColors = {
  lines: ['#111111', '#222222', '#333333', '#444444', '#555555'],
  text: '#666666',
  strongText: '#777777',
  grid: '#888888',
  surface: '#999999',
  fontFamily: 'sans-serif',
};

interface Drawn {
  readonly color: string[];
  readonly xAxis: { readonly type: string; readonly data: string[] };
  readonly yAxis: { readonly min: number };
  readonly series: { readonly type: string; readonly name: string; readonly data: unknown[] }[];
  readonly tooltip: { readonly formatter: (hovered: unknown) => string };
}

describe('the bars of a chart', () => {
  const drawn = () =>
    barsOption(
      {
        categories: ['1 Nov', '2 Nov'],
        series: [
          { key: 'production', name: 'Produced', color: 1, values: [12.4, null] },
          { key: 'exported', name: '<b>Returned</b>', color: 5, values: [3, 0] },
        ],
        unit: 'kWh',
        decimals: 1,
        locale: 'en-GB',
      },
      COLORS,
    ) as unknown as Drawn;

  it('draws a bar per category and series, from nothing, in the colours of the theme', () => {
    const option = drawn();
    expect(option.xAxis).toMatchObject({ type: 'category', data: ['1 Nov', '2 Nov'] });
    expect(option.yAxis.min).toBe(0);
    expect(option.color).toEqual(['#111111', '#555555']);
    expect(option.series.map((series) => series.data)).toEqual([
      [12.4, null],
      [3, 0],
    ]);
  });

  // a value not known has no bar and no row; 0 is a value; a name is escaped in the HTML of the tooltip
  it('tells in the tooltip what is known of a day, the names escaped', () => {
    const tooltip = drawn().tooltip.formatter([
      { seriesIndex: 0, dataIndex: 1, marker: '' },
      { seriesIndex: 1, dataIndex: 1, marker: '' },
    ]);
    expect(tooltip).toBe('2 Nov<br>&lt;b&gt;Returned&lt;/b&gt;: <strong>0.0 kWh</strong>');
  });
});

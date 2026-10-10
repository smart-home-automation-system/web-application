import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ThemeStore } from '../../core/theme/theme-store';
import { ChartLine } from './chart-data';
import { HistoryChart } from './history-chart';

const at = (dateTime: string) => Date.parse(`${dateTime}Z`);

const TANK: ChartLine = {
  key: 'water',
  name: 'Tank',
  color: 1,
  points: [[at('2026-10-08T00:00:00'), 46.81]],
};

@Component({
  imports: [HistoryChart],
  template: `
    @if (shown()) {
      <app-history-chart
        [lines]="lines()"
        [from]="from"
        [to]="to"
        label="Temperature of the tank"
      />
    }
  `,
})
class Host {
  readonly shown = signal(true);
  readonly lines = signal<readonly ChartLine[]>([TANK]);
  readonly from = at('2026-10-08T00:00:00');
  readonly to = at('2026-10-09T00:00:00');
}

describe('HistoryChart', () => {
  let charts: RecordedCharts;
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), provideChartTesting(charts)],
    });
    fixture = TestBed.createComponent(Host);
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    // the engine arrives as a promise, and the drawing follows the render after it
    await Promise.resolve();
    await fixture.whenStable();
  }

  it('is an image with the name its caller gives it', async () => {
    await settle();

    const image = (fixture.nativeElement as HTMLElement).querySelector('[role="img"]');
    expect(image?.getAttribute('aria-label')).toBe('Temperature of the tank');
  });

  it('draws its lines once the library has arrived', async () => {
    await settle();

    expect(charts.drawn).toHaveLength(1);
    expect(charts.lines()).toEqual([{ name: 'Tank', data: TANK.points }]);
  });

  it('draws again when its lines change, into the same chart', async () => {
    await settle();
    const later: ChartLine = {
      ...TANK,
      points: [...TANK.points, [at('2026-10-08T00:05:00'), 46.5]],
    };

    fixture.componentInstance.lines.set([later]);
    await settle();

    expect(charts.drawn).toHaveLength(1);
    expect(charts.lines()[0].data).toHaveLength(2);
  });

  // a drawing holds colours, not variables: another scheme needs another drawing
  it('draws again when the colours of the theme change', async () => {
    await settle();
    const first = charts.drawn[0];

    TestBed.inject(ThemeStore).chooseScheme('dark');
    await settle();

    expect(charts.drawn[0]).not.toBe(first);
  });

  it('draws again in the language that was chosen', async () => {
    await settle();
    const axis = () =>
      (charts.drawn[0] as { xAxis: { axisLabel: { formatter(at: number): string } } }).xAxis
        .axisLabel;
    expect(axis().formatter(at('2026-10-09T00:00:00'))).toBe('9 Oct');

    await useLanguage('pl');
    await settle();

    expect(axis().formatter(at('2026-10-09T00:00:00'))).toBe('9 paź');
  });

  it('removes its chart with itself', async () => {
    await settle();

    fixture.componentInstance.shown.set(false);
    await settle();

    expect(charts.disposed).toBe(1);
  });
});

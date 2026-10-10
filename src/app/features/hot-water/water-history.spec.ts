import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import {
  FakeQueryResource,
  answerQuery,
  failQuery,
  fakeQueryResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryRange } from '../../core/time/history-range';
import { WaterApi, WaterHistory as WaterHistoryAnswer } from '../../data-access/water/water-api';
import { WaterHistory } from './water-history';

// 18:30 in the house (summer time, UTC+2)
const NOW = new Date('2026-10-10T16:30:00Z');
const at = (dateTime: string) => Date.parse(`${dateTime}Z`);

const DAY: WaterHistoryAnswer = {
  from: '2026-10-09T19:00:00',
  to: '2026-10-10T19:00:00',
  bucketSeconds: 300,
  points: [
    { at: '2026-10-10T18:00:00', water: 46.81, circulation: 26.44 },
    { at: '2026-10-10T18:05:00', water: 46.5, circulation: 26.4 },
    // the bucket of 18:10 is missing
    { at: '2026-10-10T18:15:00', water: 45.9, circulation: 27.1 },
  ],
};

describe('WaterHistory', () => {
  let history: FakeQueryResource<HistoryRange, WaterHistoryAnswer | null>;
  let asked: () => HistoryRange;
  let charts: RecordedCharts;
  let fixture: ComponentFixture<WaterHistory>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    history = fakeQueryResource();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        {
          provide: WaterApi,
          useValue: {
            watchHistory: (range: () => HistoryRange) => {
              asked = range;
              return history;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(WaterHistory);
  });

  afterEach(() => vi.useRealTimers());

  const card = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function settle(): Promise<void> {
    await fixture.whenStable();
    // the engine arrives as a promise, and the drawing follows the render after it
    await Promise.resolve();
    await fixture.whenStable();
  }

  function choose(label: string): void {
    const toggle = [...card().querySelectorAll('mat-button-toggle button')].find(
      (button) => words(button) === label,
    ) as HTMLButtonElement;
    toggle.click();
  }

  it('asks for the last 24 hours first, from a full hour of the house', async () => {
    await settle();

    expect(asked()).toEqual({ from: '2026-10-09T19:00:00', to: '2026-10-10T19:00:00' });
  });

  it('shows a progress bar and no chart until the answer for the period has arrived', async () => {
    await settle();

    expect(card().querySelector('mat-progress-bar')).toBeTruthy();
    expect(card().querySelector('app-history-chart')).toBeNull();
    // not made at all: a chart made behind the bar would be drawn into nothing
    expect(charts.drawn).toHaveLength(0);
  });

  it('draws both temperatures over the range that was asked for', async () => {
    answerQuery(history, asked(), DAY);
    await settle();

    const drawn = charts.drawn[0] as { xAxis: { min: number; max: number } };
    expect(charts.lines().map((line) => line.name)).toEqual(['Tank', 'Circulation']);
    expect(drawn.xAxis.min).toBe(at('2026-10-09T19:00:00'));
    expect(drawn.xAxis.max).toBe(at('2026-10-10T19:00:00'));
  });

  // a bucket without a reading has no point: the line is broken there, never bridged
  it('breaks the lines where a bucket is missing', async () => {
    answerQuery(history, asked(), DAY);
    await settle();

    expect(charts.lines()[0].data).toEqual([
      [at('2026-10-10T18:00:00'), 46.81],
      [at('2026-10-10T18:05:00'), 46.5],
      [at('2026-10-10T18:10:00'), null],
      [at('2026-10-10T18:15:00'), 45.9],
    ]);
  });

  it('draws the band the tank is kept in', async () => {
    answerQuery(history, asked(), DAY);
    await settle();

    const drawn = charts.drawn[0] as { series: { markArea?: { data: unknown } }[] };
    expect(drawn.series[0].markArea?.data).toEqual([
      [{ name: 'kept in', yAxis: 38 }, { yAxis: 42 }],
    ]);
  });

  it('says in numbers what the lines show', async () => {
    answerQuery(history, asked(), DAY);
    await settle();

    expect(words(card().querySelector('[data-testid="history-facts"]'))).toBe(
      'Tank 45.9 – 46.8 °C Circulation 26.4 – 27.1 °C',
    );
  });

  it('names the picture for whoever cannot see it', async () => {
    answerQuery(history, asked(), DAY);
    await settle();

    expect(card().querySelector('.chart__plot')?.getAttribute('aria-label')).toBe(
      'Chart of the temperature of the tank and of the circulation over the chosen period',
    );
  });

  it('says that a period has no reading, instead of drawing an empty chart', async () => {
    answerQuery(history, asked(), { ...DAY, points: [] });
    await settle();

    expect(words(card().querySelector('[data-testid="history-empty"]'))).toBe(
      'No reading in this period.',
    );
    expect(card().querySelector('app-history-chart')).toBeNull();
    expect(charts.drawn).toHaveLength(0);
  });

  it('reads a 200 without a body as no reading', async () => {
    answerQuery(history, asked(), null);
    await settle();

    expect(card().querySelector('[data-testid="history-empty"]')).toBeTruthy();
  });

  it('draws a line that is there when the other is missing from every point', async () => {
    answerQuery(history, asked(), {
      ...DAY,
      points: [{ at: '2026-10-10T18:00:00', water: 46.81 }],
    });
    await settle();

    expect(charts.lines().map((line) => line.name)).toEqual(['Tank']);
  });

  describe('another period', () => {
    it('asks for 7 days from a midnight, ending with the midnight after today', async () => {
      await settle();
      choose('7 days');
      await settle();

      expect(asked()).toEqual({ from: '2026-10-04T00:00:00', to: '2026-10-11T00:00:00' });
    });

    it('asks for 30 days, inside the 31 the service allows', async () => {
      await settle();
      choose('30 days');
      await settle();

      expect(asked()).toEqual({ from: '2026-09-11T00:00:00', to: '2026-10-11T00:00:00' });
    });

    // the resource still holds the day: it must not stand under "7 days" for the length of a call
    it('shows the bar, not the answer of the period before, until the new one arrives', async () => {
      answerQuery(history, asked(), DAY);
      await settle();
      choose('7 days');
      await settle();

      expect(card().querySelector('mat-progress-bar')).toBeTruthy();
      expect(card().querySelector('app-history-chart')).toBeNull();
      expect(card().querySelector('[data-testid="history-facts"]')).toBeNull();
    });

    it('does not show the failure of the period before under the new one', async () => {
      failQuery(history, asked(), new ApiError('server', 500, []));
      await settle();
      expect(card().querySelector('[role="alert"]')).toBeTruthy();

      choose('7 days');
      await settle();

      expect(card().querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('when the clock of the house moves on to a new hour', () => {
    async function nextHour(): Promise<void> {
      vi.setSystemTime(new Date('2026-10-10T17:05:00Z'));
      vi.advanceTimersByTime(5_000);
      await settle();
    }

    it('asks for the range of the new hour', async () => {
      await settle();
      await nextHour();

      expect(asked()).toEqual({ from: '2026-10-09T20:00:00', to: '2026-10-10T20:00:00' });
    });

    // the same question an hour later: nobody chose anything, and the chart must not blink
    it('keeps the chart of the hour before, on its own axis, until the new answer arrives', async () => {
      const before = asked();
      answerQuery(history, before, DAY);
      await settle();
      await nextHour();

      expect(card().querySelector('mat-progress-bar')).toBeNull();
      expect(card().querySelector('app-history-chart')).toBeTruthy();
      expect(charts.drawn).toHaveLength(1);
      expect((charts.drawn[0] as { xAxis: { min: number } }).xAxis.min).toBe(
        at('2026-10-09T19:00:00'),
      );
    });

    it('keeps it also when the call of the new hour fails, next to the failure', async () => {
      answerQuery(history, asked(), DAY);
      await settle();
      await nextHour();

      failQuery(history, asked(), new ApiError('server', 503, []));
      await settle();

      expect(card().querySelector('app-history-chart')).toBeTruthy();
      expect(card().querySelector('[role="alert"]')).toBeTruthy();
    });

    it('moves the axis on with the answer of the new hour', async () => {
      answerQuery(history, asked(), DAY);
      await settle();
      await nextHour();

      answerQuery(history, asked(), DAY);
      await settle();

      expect((charts.drawn[0] as { xAxis: { min: number } }).xAxis.min).toBe(
        at('2026-10-09T20:00:00'),
      );
    });
  });

  it('says why the history is missing, next to how fresh it is', async () => {
    failQuery(history, asked(), new ApiError('server', 503, []));
    await settle();

    expect(card().querySelector('[role="alert"]')).toBeTruthy();
    expect(card().querySelector('app-history-chart')).toBeNull();
    // a failure is not "no reading"
    expect(card().querySelector('[data-testid="history-empty"]')).toBeNull();
  });

  it('speaks Polish, with a decimal comma', async () => {
    await useLanguage('pl');
    answerQuery(history, asked(), DAY);
    await settle();

    expect(words(card().querySelector('mat-card-title'))).toBe('Historia temperatur');
    expect(charts.lines().map((line) => line.name)).toEqual(['Zasobnik', 'Cyrkulacja']);
    expect(words(card().querySelector('[data-testid="history-facts"]'))).toContain(
      '45,9 – 46,8 °C',
    );
  });
});

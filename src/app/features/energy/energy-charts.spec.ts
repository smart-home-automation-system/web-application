import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FakeQueryResource, answerQuery, fakeQueryResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { HistoryPreset, HistoryRange } from '../../core/time/history-range';
import { EnergyApi, EnergyHistory, EnergyMetric } from '../../data-access/energy/energy-api';
import { HistoryPeriod } from '../../shared/history-chart/history-period';
import { ENERGY_CHARTS, EnergyChartSpec, GRID_FREQUENCY_BAND, energyChart } from './energy-charts';

const at = (dateTime: string) => Date.parse(`${dateTime}Z`);
const DAY: HistoryRange = { from: '2026-11-24T18:00:00', to: '2026-11-25T19:00:00' };

const specOf = (key: string) => ENERGY_CHARTS.find((spec) => spec.key === key) as EnergyChartSpec;

describe('ENERGY_CHARTS', () => {
  // HAS-507 (owner 2026-11-24): the power and the battery in a row, the voltage, the current and the frequency in the next
  it('keeps the order of the page', () => {
    expect(ENERGY_CHARTS.map((spec) => spec.key)).toEqual([
      'power',
      'battery',
      'voltage',
      'current',
      'frequency',
    ]);
  });

  it('reads the three phases of the grid meter and its frequency', () => {
    expect(specOf('voltage').lines.map((line) => line.metric)).toEqual([
      'grid-voltage-a',
      'grid-voltage-b',
      'grid-voltage-c',
    ]);
    expect(specOf('current').lines.map((line) => line.metric)).toEqual([
      'grid-current-a',
      'grid-current-b',
      'grid-current-c',
    ]);
    expect(specOf('frequency').lines.map((line) => line.metric)).toEqual(['grid-frequency']);
  });

  // a copy of energy.frequency.low / high of energy-service (HAS-503): change both together
  it('draws the band of the grid frequency of energy-service', () => {
    expect(GRID_FREQUENCY_BAND).toEqual({ low: 49.8, high: 50.2 });
    expect(specOf('frequency').thresholds?.map(({ value }) => value)).toEqual([49.8, 50.2]);
  });
});

describe('energyChart', () => {
  let resources: Map<EnergyMetric, FakeQueryResource<HistoryRange, EnergyHistory | null>>;
  let period: HistoryPeriod;

  beforeEach(() => {
    resources = new Map();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: EnergyApi,
          useValue: {
            watchHistory: (metric: EnergyMetric) => {
              const resource = fakeQueryResource<HistoryRange, EnergyHistory | null>();
              resources.set(metric, resource);
              return resource;
            },
          },
        },
      ],
    });
    const preset = signal<HistoryPreset>('day');
    period = { preset, range: signal(DAY), presetOf: () => preset() };
  });

  const chartOf = (key: string) =>
    TestBed.runInInjectionContext(() => energyChart(specOf(key), period));
  const history = (points: object[]): EnergyHistory => ({ bucketSeconds: 300, points });

  it('draws the frequency with both ends of the band as dashed lines across the axis, never in the numbers', () => {
    const chart = chartOf('frequency');
    answerQuery(
      resources.get('grid-frequency')!,
      DAY,
      history([{ at: '2026-11-25T10:00:00', avg: 51, min: 50.98, max: 51.02 }]),
    );

    const [measured, low, high] = chart.lines();
    expect(measured.points).toEqual([[at('2026-11-25T10:00:00'), 51]]);
    expect(measured.dashed).toBeUndefined();
    for (const [line, value] of [
      [low, 49.8],
      [high, 50.2],
    ] as const) {
      expect(line.dashed).toBe(true);
      expect(line.points).toEqual([
        [at(DAY.from), value],
        [at(DAY.to), value],
      ]);
    }
    expect(chart.facts().map((fact) => fact.key)).toEqual(['grid-frequency']);
  });

  // a period before the deploy of energy-service 0.20.0 answers no point: "no readings", never a band alone
  it('draws no band while the frequency has no reading', () => {
    const chart = chartOf('frequency');
    answerQuery(resources.get('grid-frequency')!, DAY, history([]));

    expect(chart.lines()).toEqual([]);
  });

  it('draws the three phases without a threshold', () => {
    const chart = chartOf('current');
    for (const [metric, value] of [
      ['grid-current-a', 4.1],
      ['grid-current-b', 10.1],
      ['grid-current-c', 3.6],
    ] as const) {
      answerQuery(
        resources.get(metric)!,
        DAY,
        history([{ at: '2026-11-25T10:00:00', avg: value, min: value, max: value }]),
      );
    }

    expect(chart.lines().map((line) => [line.name, line.dashed])).toEqual([
      ['Phase A', undefined],
      ['Phase B', undefined],
      ['Phase C', undefined],
    ]);
  });
});

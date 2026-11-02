import { Signal, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { EnergyApi, EnergyMetric } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { ChartLine, summarise, toLine } from '../../shared/history-chart/chart-data';
import {
  CombinedHistory,
  HistoryPeriod,
  combinedHistory,
  shownHistory,
} from '../../shared/history-chart/history-period';

interface LineSpec {
  readonly metric: EnergyMetric;
  readonly name: MessageKey;
  readonly color: 1 | 2 | 5;
}

/** One chart of the energy page: what it draws and how its numbers read. */
export interface EnergyChartSpec {
  readonly key: string;
  readonly title: MessageKey;
  /** What the picture shows, for whoever cannot see it. */
  readonly label: MessageKey;
  readonly icon: string;
  readonly unit: string;
  readonly decimals: number;
  readonly bounds?: { readonly min?: number; readonly max?: number };
  /** A sentence under the chart, for what the picture cannot say. */
  readonly note?: MessageKey;
  readonly lines: readonly LineSpec[];
}

/**
 * The charts of the energy page (HAS-341), in its order: the powers of the house - the panels, the
 * house and the grid, the grid below zero while the house returns energy - and the state of charge
 * of the battery. Every line is the average of a bucket; a sum (`pv-power`, `house-load`) has
 * nothing else.
 */
export const ENERGY_CHARTS: readonly EnergyChartSpec[] = [
  {
    key: 'power',
    title: 'energy.charts.power.title',
    label: 'energy.charts.power.label',
    icon: 'bolt',
    unit: 'W',
    decimals: 0,
    note: 'energy.charts.power.note',
    lines: [
      { metric: 'pv-power', name: 'energy.charts.power.production', color: 1 },
      { metric: 'house-load', name: 'energy.charts.power.house', color: 2 },
      { metric: 'grid-power', name: 'energy.charts.power.grid', color: 5 },
    ],
  },
  {
    key: 'battery',
    title: 'energy.charts.battery.title',
    label: 'energy.charts.battery.label',
    icon: 'battery_charging_full',
    unit: '%',
    decimals: 0,
    bounds: { min: 0, max: 100 },
    lines: [{ metric: 'battery-soc', name: 'energy.charts.battery.soc', color: 1 }],
  },
];

/** The range of a line, said under the chart in numbers. */
export interface EnergyChartFact {
  readonly key: string;
  readonly name: string;
  readonly lowest: number;
  readonly highest: number;
}

/** A chart of the page as its card shows it - the view of a weather chart. */
export interface EnergyChartView extends CombinedHistory {
  readonly spec: EnergyChartSpec;
  readonly lines: Signal<readonly ChartLine[]>;
  readonly facts: Signal<readonly EnergyChartFact[]>;
}

/**
 * The chart of `spec`: a history per line, all for the period of the page - the rules of
 * `weatherChart`. Call in an injection context: the polling lives as long as the caller.
 */
export function energyChart(spec: EnergyChartSpec, period: HistoryPeriod): EnergyChartView {
  const api = inject(EnergyApi);
  const transloco = inject(TranslocoService);
  const language = inject(LanguageStore).language;
  const histories = spec.lines.map((line) => {
    const resource = api.watchHistory(line.metric, period.range);
    return { line, resource, shown: shownHistory(resource, period) };
  });

  const measured = computed(() => {
    // read so that the names follow the language
    language();
    return histories.flatMap(({ line, shown }) => {
      const answer = shown.answer() ?? undefined;
      const points = toLine(answer?.points, answer?.bucketSeconds, (point) => point['avg']);
      return points.length === 0 ? [] : [{ line, name: transloco.translate(line.name), points }];
    });
  });

  return {
    spec,
    ...combinedHistory(histories),
    lines: computed(() =>
      measured().map(({ line, name, points }): ChartLine => ({
        key: line.metric,
        name,
        color: line.color,
        points,
      })),
    ),
    facts: computed(() =>
      measured().flatMap(({ line, name, points }): EnergyChartFact[] => {
        const summary = summarise(points);
        return summary === undefined ? [] : [{ key: line.metric, name, ...summary }];
      }),
    ),
  };
}

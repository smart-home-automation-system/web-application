import { ApplianceRun } from '../../data-access/appliance/appliance-api';
import { HistoryPreset, HistoryRange, historyRange } from '../../core/time/history-range';
import { wallClockOf } from '../../shared/history-chart/chart-data';

/** The periods the counters of an appliance are told for (owner, 2026-10-25). */
export const COUNTER_PRESETS = ['day', 'week', 'month'] as const satisfies readonly HistoryPreset[];
export type CounterPreset = (typeof COUNTER_PRESETS)[number];

/** The periods the list of the runs is shown for. */
export const LIST_PRESETS = ['week', 'month'] as const satisfies readonly HistoryPreset[];
export type ListPreset = (typeof LIST_PRESETS)[number];

/** The periods of the power chart: the samples endpoint takes at most two days. */
export const POWER_PRESETS: readonly HistoryPreset[] = ['day', 'twoDays'];

/**
 * The cycles of one period: how many started in it, the energy of the finished ones, and how many of
 * those have no energy - **never read as 0 Wh**: the service leaves `energyWh` out when it does not know
 * it. A cycle that still runs is counted and adds no energy yet.
 */
export interface Counter {
  readonly cycles: number;
  readonly energyWh: number;
  readonly energyUnknown: number;
  readonly running: number;
}

const NONE: Counter = { cycles: 0, energyWh: 0, energyUnknown: 0, running: 0 };

/** A cycle as the page shows it; a field the answer left out stays `undefined`. */
export interface RunView {
  readonly key: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly durationMinutes?: number;
  readonly energyWh?: number;
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  /** Minutes from the end of the cycle to its acknowledgement; 0 for one acknowledged while finishing. */
  readonly acknowledgedAfterMinutes?: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Whether a cycle started inside the range: from included, to not - the rule of every history. */
function startedIn(run: ApplianceRun, range: HistoryRange): boolean {
  const start = wallClockOf(run.startedAt);
  const from = wallClockOf(range.from);
  const to = wallClockOf(range.to);
  return start !== undefined && from !== undefined && to !== undefined && start >= from && start < to;
}

function minutesBetween(from: string | undefined, to: string | undefined): number | undefined {
  const start = wallClockOf(from);
  const end = wallClockOf(to);
  return start === undefined || end === undefined ? undefined : Math.max(0, Math.round((end - start) / 60_000));
}

/** The cycles of a period counted by their start, the ranges of `historyRange` (HAS-283). */
export function counterOf(runs: readonly ApplianceRun[], range: HistoryRange): Counter {
  return runs.filter((run) => startedIn(run, range)).reduce<Counter>((counted, run) => {
    if (run.finishedAt === undefined) {
      return { ...counted, cycles: counted.cycles + 1, running: counted.running + 1 };
    }
    return finite(run.energyWh)
      ? { ...counted, cycles: counted.cycles + 1, energyWh: counted.energyWh + run.energyWh }
      : { ...counted, cycles: counted.cycles + 1, energyUnknown: counted.energyUnknown + 1 };
  }, NONE);
}

/** The counters of the three periods, for the instant and the zone of the house. */
export function countersOf(
  runs: readonly ApplianceRun[],
  instant: number,
  zone: string,
): Readonly<Record<CounterPreset, Counter>> {
  return {
    day: counterOf(runs, historyRange('day', instant, zone)),
    week: counterOf(runs, historyRange('week', instant, zone)),
    month: counterOf(runs, historyRange('month', instant, zone)),
  };
}

/** The counters of several appliances, added up - the line of the whole house. */
export function addedUp(
  counters: readonly Readonly<Record<CounterPreset, Counter>>[],
): Readonly<Record<CounterPreset, Counter>> {
  const add = (preset: CounterPreset) =>
    counters.reduce<Counter>(
      (sum, one) => ({
        cycles: sum.cycles + one[preset].cycles,
        energyWh: sum.energyWh + one[preset].energyWh,
        energyUnknown: sum.energyUnknown + one[preset].energyUnknown,
        running: sum.running + one[preset].running,
      }),
      NONE,
    );
  return { day: add('day'), week: add('week'), month: add('month') };
}

/**
 * The cycles that started in a range, the newest first. A cycle without a readable start is left out -
 * it cannot be placed in a period.
 */
export function runsIn(runs: readonly ApplianceRun[], range: HistoryRange): RunView[] {
  return runs
    .filter((run) => startedIn(run, range))
    .map(
      (run): RunView => ({
        key: `${run.id ?? ''}@${run.startedAt}`,
        startedAt: run.startedAt as string,
        finishedAt: run.finishedAt,
        durationMinutes: minutesBetween(run.startedAt, run.finishedAt),
        energyWh: finite(run.energyWh) ? run.energyWh : undefined,
        acknowledgedAt: run.acknowledgedAt,
        acknowledgedBy: run.acknowledgedBy,
        acknowledgedAfterMinutes: minutesBetween(run.finishedAt, run.acknowledgedAt),
      }),
    )
    .sort((a, b) => (wallClockOf(b.startedAt) ?? 0) - (wallClockOf(a.startedAt) ?? 0));
}

/** An amount of energy in words of our own: watt-hours below a kilowatt-hour, then kWh. */
export function energyParts(wattHours: number): { readonly value: number; readonly unit: 'Wh' | 'kWh' } {
  return wattHours < 1_000 ? { value: wattHours, unit: 'Wh' } : { value: wattHours / 1_000, unit: 'kWh' };
}

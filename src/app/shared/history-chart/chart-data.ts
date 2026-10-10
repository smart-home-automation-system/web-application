import { HistoryRange } from '../../core/time/history-range';
import { houseWallClock, parseHouseDateTime } from '../../core/time/house-date-time';
import { SchedulePeriod } from '../room-heating/room-views';

/**
 * A point of a line: where on the wall-clock timeline of the house it lies (milliseconds, every
 * day 24 hours long - see `houseWallClock`) and its value. `null` is a break: the line ends
 * before it and starts anew after it.
 */
export type LinePoint = readonly [at: number, value: number | null];

/** What a line is drawn like: its place among the colours of the theme, and whether it is dashed. */
export interface ChartLine {
  /** A name for tests and tracking; never shown. */
  readonly key: string;
  /** The name in the legend and the tooltip, in the language of the interface. */
  readonly name: string;
  /** Which of `--app-chart-1` ... `-5` it takes. */
  readonly color: 1 | 2 | 3 | 4 | 5;
  readonly points: readonly LinePoint[];
  /** A line that is not a measurement - a schedule - is dashed. */
  readonly dashed?: boolean;
}

/** The lowest and the highest value of a line, and its last. */
export interface LineSummary {
  readonly lowest: number;
  readonly highest: number;
  readonly last: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A local date-time of the house on the wall-clock timeline; `undefined` for anything else. */
export function wallClockOf(dateTime: unknown): number | undefined {
  const parsed = typeof dateTime === 'string' ? parseHouseDateTime(dateTime) : undefined;
  return parsed ? houseWallClock(parsed) : undefined;
}

/** The two ends of a range on the wall-clock timeline; `undefined` when either is unreadable. */
export function axisOf(
  range: HistoryRange,
): { readonly from: number; readonly to: number } | undefined {
  const from = wallClockOf(range.from);
  const to = wallClockOf(range.to);
  return from === undefined || to === undefined || from >= to ? undefined : { from, to };
}

/**
 * The points of a history as a line, oldest first, **broken wherever a bucket is missing**: the
 * services leave a bucket without a reading out, so two points further apart than the width of
 * a bucket are a gap in the readings, not a slope between them. Nothing checks an answer at
 * runtime: a point without a readable time or a finite value is left out, which makes it a gap
 * too. Without a usable `bucketSeconds` no gap can be told, and the line is drawn through.
 */
export function toLine(
  points: unknown,
  bucketSeconds: unknown,
  valueOf: (point: Record<string, unknown>) => unknown,
): LinePoint[] {
  if (!Array.isArray(points)) {
    return [];
  }
  const read = points
    .flatMap((point: unknown): [number, number][] => {
      if (typeof point !== 'object' || point === null) {
        return [];
      }
      const at = wallClockOf((point as Record<string, unknown>)['at']);
      const value = valueOf(point as Record<string, unknown>);
      return at === undefined || !finite(value) ? [] : [[at, value]];
    })
    .sort((a, b) => a[0] - b[0]);

  const bucketMs = finite(bucketSeconds) && bucketSeconds > 0 ? bucketSeconds * 1_000 : undefined;
  const line: LinePoint[] = [];
  read.forEach(([at, value], index) => {
    if (bucketMs !== undefined && index > 0 && at - read[index - 1][0] > bucketMs) {
      // the break lies where the missing bucket would have started
      line.push([read[index - 1][0] + bucketMs, null]);
    }
    line.push([at, value]);
  });
  return line;
}

/** `undefined` for a line without a single value. */
export function summarise(line: readonly LinePoint[]): LineSummary | undefined {
  let summary: LineSummary | undefined;
  for (const [, value] of line) {
    if (value === null) {
      continue;
    }
    summary = {
      lowest: summary === undefined || value < summary.lowest ? value : summary.lowest,
      highest: summary === undefined || value > summary.highest ? value : summary.highest,
      last: value,
    };
  }
  return summary;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * What the schedules of a room ask for over the days of a range, as a line of steps: the
 * temperature of the period that is on, the highest when several heaters have one, and a break
 * where none is.
 *
 * **It is the schedule the room has now, laid over every day of the range** - the target of a
 * past day is stored nowhere - so the chart names it "current schedule", never "the target".
 * It is drawing, like the week of a heater: the target *right now* is the service's
 * `scheduledTemperature` and is not worked out from this.
 */
export function scheduleLine(
  heaters: readonly (readonly SchedulePeriod[])[],
  axis: { readonly from: number; readonly to: number },
): LinePoint[] {
  const periods = heaters.flat();
  if (periods.length === 0) {
    return [];
  }
  const line: LinePoint[] = [];
  const firstDay = Math.floor(axis.from / DAY_MS) * DAY_MS;
  for (let midnight = firstDay; midnight < axis.to; midnight += DAY_MS) {
    // 1970-01-01 was a Thursday; Monday is 0 here, as in the periods
    const weekday = (Math.floor(midnight / DAY_MS) + 3) % 7;
    const today = periods.filter((period) => period.days.includes(weekday));
    const edges = [...new Set(today.flatMap((period) => [period.start, period.end]))].sort(
      (a, b) => a - b,
    );
    for (let index = 0; index + 1 < edges.length; index++) {
      const start = edges[index];
      const end = edges[index + 1];
      const asked = today
        .filter((period) => period.start <= start && period.end >= end)
        .reduce<number | undefined>(
          (highest, period) =>
            highest === undefined || period.temperature > highest ? period.temperature : highest,
          undefined,
        );
      const from = Math.max(midnight + start * MINUTE_MS, axis.from);
      const to = Math.min(midnight + end * MINUTE_MS, axis.to);
      if (asked === undefined || from >= to) {
        continue;
      }
      const previous = line.at(-1);
      if (previous !== undefined && previous[0] !== from) {
        // nothing was asked for between the last step and this one
        line.push([previous[0], null]);
      }
      line.push([from, asked], [to, asked]);
    }
  }
  return line;
}

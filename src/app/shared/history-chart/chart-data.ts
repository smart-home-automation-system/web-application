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
  /**
   * Drawn as a bar per point, not as a line: an amount per bucket - the rain that fell in it -
   * which is no level between two points. A `null` is simply no bar.
   */
  readonly bars?: boolean;
}

/** The lowest and the highest value of a line. */
export interface LineSummary {
  readonly lowest: number;
  readonly highest: number;
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
 * The longest silence a line is drawn through as measured: twice the bucket (one bucket missed),
 * or `atLeastSeconds` where the sensor is quiet by design - a battery thermometer reports on a
 * change only, and the value it last sent holds until the next. `undefined` without either.
 */
export function solidGapOf(bucketSeconds: unknown, atLeastSeconds = 0): number | undefined {
  const twoBuckets = finite(bucketSeconds) && bucketSeconds > 0 ? 2 * bucketSeconds : 0;
  const solid = Math.max(twoBuckets, atLeastSeconds);
  return solid > 0 ? solid : undefined;
}

/**
 * The points of a history as a line, oldest first (owner, 2026-11-03, HAS-375 - it replaces the
 * break at every missing bucket of HAS-201). The services leave a bucket without a reading out, so
 * two points further apart than a bucket are a silence. **A silence up to `solidGapSeconds`** -
 * by default two buckets, see `solidGapOf` - **is drawn through**, as the line it is; **a longer
 * one is a gap**: a `null` in its middle, which the chart bridges with a faint dotted line
 * (`bridgesOf`) and the tooltip reads as "no readings". Nothing checks an answer at runtime: a
 * point without a readable time or a finite value is left out. Without a usable `bucketSeconds`
 * or `solidGapSeconds` no gap can be told, and the line is drawn through.
 */
export function toLine(
  points: unknown,
  bucketSeconds: unknown,
  valueOf: (point: Record<string, unknown>) => unknown,
  solidGapSeconds: number | undefined = solidGapOf(bucketSeconds),
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

  const solidMs =
    finite(solidGapSeconds) && solidGapSeconds > 0 ? solidGapSeconds * 1_000 : undefined;
  const line: LinePoint[] = [];
  read.forEach(([at, value], index) => {
    const before = read[index - 1]?.[0];
    if (solidMs !== undefined && before !== undefined && at - before > solidMs) {
      // in the middle of the gap: where the pointer of the chart finds it
      line.push([before + (at - before) / 2, null]);
    }
    line.push([at, value]);
  });
  return line;
}

/**
 * What bridges the gaps of a line: for every `null` between two readings, those two readings,
 * each pair apart from the next. Drawn faint and dotted, it keeps a line whole without passing
 * for a measurement.
 */
export function bridgesOf(line: readonly LinePoint[]): LinePoint[] {
  const bridges: LinePoint[] = [];
  line.forEach(([, value], index) => {
    const before = line[index - 1];
    const after = line[index + 1];
    if (value !== null || before?.[1] == null || after?.[1] == null) {
      return;
    }
    if (bridges.length > 0) {
      bridges.push([before[0], null]);
    }
    bridges.push(before, after);
  });
  return bridges;
}

/**
 * The two readings around a gap of a line, by the index of its `null`; `undefined` for anything
 * else.
 */
export function gapAround(
  line: readonly LinePoint[],
  index: number,
): { readonly from: number; readonly to: number } | undefined {
  const before = line[index - 1];
  const after = line[index + 1];
  return line[index]?.[1] === null && before?.[1] != null && after?.[1] != null
    ? { from: before[0], to: after[0] }
    : undefined;
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

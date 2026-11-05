import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { ConsumptionRange, WaterConsumption, WaterValve } from '../../data-access/water/water-api';

/**
 * How old the newest report of the valve may be before what the card shows is out of date: the service reads the
 * valve every minute, so this is two reads missed and a little more. **A copy of that interval**
 * (`ValveReconciliation` of `water-service`), which no endpoint exposes. A value older than 5 minutes the service
 * leaves out by itself.
 */
export const VALVE_OUT_OF_DATE_MS = 3 * 60_000;

/** The valve as the views show it - read once here, so that the page and the tile cannot tell it differently. */
export interface ValveView {
  /** `undefined` when the answer does not say - never read as open or closed. */
  readonly open?: boolean;
  /** l/min. */
  readonly flowRate?: number;
  /** bar. */
  readonly pressure?: number;
  /** °C. */
  readonly temperature?: number;
  /** m³. */
  readonly counter?: number;
  /** House wall-clock time of the newest report; `undefined` when the answer does not say. */
  readonly measuredAt?: string;
  readonly measuredInstant?: number;
}

/** The words of the service for the state of the valve. */
const STATES = new Map<unknown, boolean>([
  ['open', true],
  ['closed', false],
]);

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Reads the answer of `GET /home/water/valve`. Nothing checks an answer at runtime: whatever is not a finite number
 * is "not known", a state that is neither `open` nor `closed` is not known, and a time that is no date-time of the
 * house is not known - never the time of the call.
 */
export function toValveView(answer: WaterValve | null | undefined, timeZone: string): ValveView {
  const state: unknown = answer?.state;
  const at: unknown = answer?.measuredAt;
  const parsed = typeof at === 'string' ? parseHouseDateTime(at) : undefined;
  return {
    open: STATES.get(state),
    flowRate: finite(answer?.flowRate),
    pressure: finite(answer?.pressure),
    temperature: finite(answer?.temperature),
    counter: finite(answer?.counter?.total),
    measuredAt: parsed ? (at as string) : undefined,
    measuredInstant: parsed ? houseInstant(parsed, timeZone) : undefined,
  };
}

/** The reports of the valve have stopped: the card shows the last of them. Never true without a time. */
export function isValveOutOfDate(view: ValveView, now: number): boolean {
  return view.measuredInstant !== undefined && now - view.measuredInstant > VALVE_OUT_OF_DATE_MS;
}

/** Whether the valve tells anything at all. */
export function hasValveReading(view: ValveView): boolean {
  return (
    view.open !== undefined ||
    view.flowRate !== undefined ||
    view.pressure !== undefined ||
    view.temperature !== undefined ||
    view.counter !== undefined
  );
}

/**
 * The unit a range is shown in: litres where a bucket is an hour or a day (a day of the house is a few hundred
 * litres), m³ for a year in months. The service answers m³ always.
 */
export interface ConsumptionUnit {
  readonly unit: 'L' | 'm³';
  /** What a volume of the service is multiplied by. */
  readonly factor: number;
  readonly decimals: number;
}

export function unitOf(range: ConsumptionRange): ConsumptionUnit {
  return range === 'year'
    ? { unit: 'm³', factor: 1, decimals: 1 }
    : { unit: 'L', factor: 1_000, decimals: 0 };
}

/** A volume of the service in the unit of its range, rounded as shown; `undefined` when it is not a number. */
export function volumeIn(range: ConsumptionRange, cubicMetres: unknown): number | undefined {
  const value = finite(cubicMetres);
  if (value === undefined) {
    return undefined;
  }
  const { factor, decimals } = unitOf(range);
  const scale = 10 ** decimals;
  return Math.round(value * factor * scale) / scale;
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

/** A date-time of the house (`2026-11-05T07:00:00`) as milliseconds on the wall-clock timeline. */
function wallClock(text: string): number {
  return Date.parse(`${text.slice(0, 19)}Z`);
}

function localDateTime(wallClockMs: number): string {
  return new Date(wallClockMs).toISOString().slice(0, 19);
}

/** The first day of the next month after a wall-clock instant. */
function nextMonth(wallClockMs: number): number {
  const date = new Date(wallClockMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** The start of the bucket after the one starting at a wall-clock instant. */
function nextBucket(range: ConsumptionRange, wallClockMs: number): number {
  switch (range) {
    case 'day':
      return wallClockMs + HOUR_MS;
    case 'year':
      return nextMonth(wallClockMs);
    default:
      return wallClockMs + DAY_MS;
  }
}

/**
 * The start of every bucket of a range from its `from` to its `to` (the end not included), oldest first: hours of a
 * day, days of a week or a month, months of a year. All of it on the wall clock: the day the clocks go forward has 24
 * hours here too - its skipped hour is a bucket the service answers as 0, the repeated one in autumn is one bucket.
 */
export function bucketStarts(range: ConsumptionRange, from: string, to: string): readonly string[] {
  const end = wallClock(to);
  const starts: string[] = [];
  for (let at = wallClock(from); at < end && starts.length < 400; at = nextBucket(range, at)) {
    starts.push(localDateTime(at));
  }
  return starts;
}

/**
 * The volume of every bucket, in the unit of the range, in the order of `starts`: `null` where the answer has no
 * point - the service did not watch the counter then - never 0.
 */
export function bucketValues(
  range: ConsumptionRange,
  starts: readonly string[],
  answer: WaterConsumption | null | undefined,
): readonly (number | null)[] {
  const known = new Map<string, number>();
  for (const bucket of Array.isArray(answer?.buckets) ? answer.buckets : []) {
    const volume = volumeIn(range, bucket?.volume);
    if (typeof bucket?.at === 'string' && volume !== undefined) {
      known.set(bucket.at.slice(0, 19), volume);
    }
  }
  return starts.map((start) => known.get(start) ?? null);
}

const BUCKET_LABELS: Readonly<Record<ConsumptionRange, Intl.DateTimeFormatOptions>> = {
  day: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  week: { weekday: 'short', day: 'numeric' },
  month: { day: 'numeric' },
  year: { month: 'short' },
};

/** The name of a bucket under its bar, in the language of the interface. */
export function bucketLabel(range: ConsumptionRange, start: string, locale: string): string {
  return dateTimeFormat(locale, { timeZone: 'UTC', ...BUCKET_LABELS[range] }).format(
    wallClock(start),
  );
}

/** A day (`YYYY-MM-DD`) as milliseconds of its midnight on the wall-clock timeline. */
function midnight(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayOf(wallClockMs: number): string {
  return new Date(wallClockMs).toISOString().slice(0, 10);
}

/** The first day of the range a day belongs to: itself, its Monday, the 1st of its month, the 1st of January. */
export function periodStart(range: ConsumptionRange, day: string): string {
  const date = new Date(midnight(day));
  switch (range) {
    case 'day':
      return day;
    case 'week':
      // Monday to Sunday, as the service counts a week
      return dayOf(midnight(day) - ((date.getUTCDay() + 6) % 7) * DAY_MS);
    case 'month':
      return `${day.slice(0, 7)}-01`;
    case 'year':
      return `${day.slice(0, 4)}-01-01`;
  }
}

/** The first day of the range `steps` ranges before (negative) or after a day. */
export function shiftPeriod(range: ConsumptionRange, day: string, steps: number): string {
  const start = new Date(midnight(periodStart(range, day)));
  switch (range) {
    case 'day':
      return dayOf(start.getTime() + steps * DAY_MS);
    case 'week':
      return dayOf(start.getTime() + steps * 7 * DAY_MS);
    case 'month':
      return dayOf(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + steps, 1));
    case 'year':
      return dayOf(Date.UTC(start.getUTCFullYear() + steps, 0, 1));
  }
}

/** Whether a range after the one of `day` has begun by `today` - the button to it is offered only then. */
export function hasNextPeriod(range: ConsumptionRange, day: string, today: string): boolean {
  return shiftPeriod(range, day, 1) <= today;
}

/**
 * The name of the range of a day: "5 November 2026", "3 – 9 Nov 2026", "November 2026", "2026" - computed from the
 * day alone, so it is there before the answer.
 */
export function periodLabel(range: ConsumptionRange, day: string, locale: string): string {
  const start = midnight(periodStart(range, day));
  const format = (options: Intl.DateTimeFormatOptions) =>
    dateTimeFormat(locale, { timeZone: 'UTC', ...options });
  switch (range) {
    case 'day':
      return format({ day: 'numeric', month: 'long', year: 'numeric' }).format(start);
    case 'week':
      return format({ day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
        start,
        start + 6 * DAY_MS,
      );
    case 'month':
      return format({ month: 'long', year: 'numeric' }).format(start);
    case 'year':
      return format({ year: 'numeric' }).format(start);
  }
}

/** How the total of a range compares with the one before, in percent of that one; `undefined` when either is not known. */
export function changePercent(total: unknown, previous: unknown): number | undefined {
  const now = finite(total);
  const before = finite(previous);
  if (now === undefined || before === undefined || before === 0) {
    return undefined;
  }
  return Math.round(((now - before) / before) * 100);
}

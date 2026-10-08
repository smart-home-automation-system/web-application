import { houseWallClock, parseHouseDateTime } from '../../core/time/house-date-time';
import { ReportRange } from '../../data-access/presence/presence-api';
import { LONGEST_RANGE_DAYS } from './report-range';

const DAY_MS = 24 * 60 * 60 * 1_000;
/** One more than a report can span: a range that starts in the middle of a day touches as many. */
const MOST_DAYS = LONGEST_RANGE_DAYS + 1;

/** A stretch of a day, as a share of its 24 hours. */
export interface LanePart {
  /** Where it starts, in percent of the day. */
  readonly left: number;
  readonly width: number;
}

/** A stretch that is drawn filled: a period at home, or the house occupied. */
export interface LaneBlock extends LanePart {
  /** `07:32` - and `24:00` for a block that runs to the end of its day. */
  readonly from: string;
  readonly to: string;
  /** The period is still going on: this end is the last check, not a departure. */
  readonly open: boolean;
}

/** One calendar day of the house as a bar from 00:00 to 24:00. */
export interface DayLane {
  /** `2026-10-05`. */
  readonly date: string;
  /** The same day as a date-time, for the pipe that prints it. */
  readonly at: string;
  /**
   * The part of the day the history covers. Outside it nothing is known - neither presence nor
   * absence - and it is drawn as such.
   */
  readonly observed: LanePart;
  /** The same part by the clock: `00:00` to `15:29`. */
  readonly observedClock: { readonly from: string; readonly to: string };
  /** The whole day was observed. */
  readonly whole: boolean;
  /**
   * False when the answer did not say when the periods were: the day is then drawn as not
   * known, never as a day without any.
   */
  readonly known: boolean;
  readonly blocks: readonly LaneBlock[];
}

/** A stretch of the timeline as the reports give it. */
export interface Stretch {
  readonly from?: string;
  readonly to?: string;
  readonly open?: boolean;
}

/**
 * Cuts a timeline into the days of the house, the newest first. Only days the history touches
 * come out: a day of the range before `observedFrom` or after `observedUntil` is not a day
 * spent away, it is a day nobody looked - the caller says so in words instead of drawing a row
 * of empty bars.
 *
 * The times are wall-clock times of the house and are laid out as they read: every day is drawn
 * 24 hours wide, also the two a year that are 23 and 25 hours long.
 *
 * `stretches` that are no list - the answer did not carry them - give days whose periods are
 * not `known`: an empty list says "none", a missing one says nothing.
 */
export function toDayLanes(
  range: ReportRange,
  observedFrom: string | null | undefined,
  observedUntil: string | null | undefined,
  stretches: readonly Stretch[] | null | undefined,
): DayLane[] {
  const rangeFrom = moment(range.from);
  const rangeTo = moment(range.to);
  const observedStart = moment(observedFrom);
  const observedEnd = moment(observedUntil);
  if (
    rangeFrom === undefined ||
    rangeTo === undefined ||
    observedStart === undefined ||
    observedEnd === undefined ||
    observedStart >= observedEnd
  ) {
    return [];
  }
  const known = Array.isArray(stretches);
  const spans = (known ? stretches : []).flatMap((stretch: Stretch) => {
    const from = moment(stretch?.from);
    const to = moment(stretch?.to);
    return from !== undefined && to !== undefined && from < to
      ? [{ from, to, open: stretch.open === true }]
      : [];
  });

  const lanes: DayLane[] = [];
  const firstDay = Math.floor(Math.max(rangeFrom, observedStart) / DAY_MS) * DAY_MS;
  const end = Math.min(rangeTo, observedEnd);
  for (let day = firstDay; day < end && lanes.length < MOST_DAYS; day += DAY_MS) {
    const nextDay = day + DAY_MS;
    const part = (from: number, to: number): LanePart => ({
      left: ((from - day) / DAY_MS) * 100,
      width: ((to - from) / DAY_MS) * 100,
    });
    const date = new Date(day).toISOString().slice(0, 10);
    const observedFromHere = Math.max(day, observedStart);
    const observedToHere = Math.min(nextDay, observedEnd);
    lanes.push({
      date,
      at: `${date}T00:00:00`,
      observed: part(observedFromHere, observedToHere),
      observedClock: { from: clock(observedFromHere, day), to: clock(observedToHere, day) },
      whole: observedFromHere === day && observedToHere === nextDay,
      known,
      blocks: spans
        .filter((span) => span.from < nextDay && span.to > day)
        .map((span) => {
          const from = Math.max(span.from, day);
          const to = Math.min(span.to, nextDay);
          return {
            ...part(from, to),
            from: clock(from, day),
            to: clock(to, day),
            // a period that runs on into the next day is not open *here*
            open: span.open && span.to <= nextDay,
          };
        }),
    });
  }
  return lanes.reverse();
}

function moment(text: string | null | undefined): number | undefined {
  const parsed = parseHouseDateTime(text);
  return parsed ? houseWallClock(parsed) : undefined;
}

/** The time of day of a moment of the day that starts at `day`: `24:00` at its very end. */
function clock(at: number, day: number): string {
  const minutes = Math.floor((at - day) / 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A length of time as whole hours and minutes, rounded down to the minute. */
export interface Duration {
  readonly hours: number;
  readonly minutes: number;
}

/** `undefined` for anything that is not a length of time. */
export function toDuration(seconds: unknown): Duration | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  const minutes = Math.floor(seconds / 60);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/**
 * The start of the observed part when it is later than the start of the range - the history
 * begins inside the range, and what lies before it was not observed. `undefined` otherwise.
 */
export function observedLater(
  range: ReportRange,
  observedFrom: string | null | undefined,
): string | undefined {
  const rangeFrom = moment(range.from);
  const observedStart = moment(observedFrom);
  return rangeFrom !== undefined && observedStart !== undefined && observedStart > rangeFrom
    ? (observedFrom ?? undefined)
    : undefined;
}

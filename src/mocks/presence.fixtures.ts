import {
  DailyOccupancy,
  DailyPresence,
  DailyPresenceReport,
  HouseReport,
  OccupancyInterval,
  PresenceInterval,
  PresenceReport,
  ResidentPresence,
} from '../app/data-access/presence/presence-api';
import { HOUSEHOLD_PROFILES } from './household.fixtures';
import { houseTime } from './house-time';

/**
 * The presence of the mock household, in the shape of real answers of `presence-service`. It is
 * a small simulation, not a recording: every member has a routine of a day, the history begins
 * twelve days before the call - so a period of thirty days starts before anything was observed -
 * and it ends at a last check a moment ago. Everything is worked out from the time of the call:
 * a fixed history would read as a detection that stopped.
 *
 * One member, Damian, has never been seen: listed as not present, with no times and an empty
 * report. Invented people and routines only.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 12;
const LAST_CHECK_AGO_MS = 40_000;
const LONGEST_RANGE_DAYS = 366;
const NEVER_SEEN = 'Damian';

/** A stretch of the wall clock of the house, in milliseconds on a timeline without zones. */
interface Span {
  readonly from: number;
  readonly to: number;
}

/** When somebody is at home on a day: stretches in minutes from midnight. */
type Routine = (day: number) => readonly (readonly [number, number])[];

const at = (hour: number, minute = 0) => hour * 60 + minute;
const isWeekend = (day: number) => [0, 6].includes(new Date(day).getUTCDay());

const ROUTINES: Readonly<Record<string, Routine>> = {
  // out for work on weekdays, a walk at noon at the weekend
  Aurelia: (day) =>
    isWeekend(day)
      ? [
          [at(0), at(11)],
          [at(13), at(24)],
        ]
      : [
          [at(0), at(7, 40)],
          [at(16, 30), at(24)],
        ],
  // school and an hour out in the evening on weekdays, at home all weekend
  Borys: (day) =>
    isWeekend(day)
      ? [[at(0), at(24)]]
      : [
          [at(0), at(8, 15)],
          [at(15, 5), at(18)],
          [at(19, 10), at(24)],
        ],
  // long days out, and away altogether every fifth day
  Celina: (day) =>
    Math.floor(day / DAY) % 5 === 0
      ? []
      : [
          [at(0), at(6, 50)],
          [at(18, 20), at(24)],
        ],
};

/** The moments everything is cut to: where the history begins, and the last check. */
interface History {
  readonly begins: number;
  readonly lastCheck: number;
}

function historyAt(now: Date): History {
  // to the second: the figures of the reports are whole seconds
  const lastCheck =
    Math.floor(wallClock(houseTime(now, LAST_CHECK_AGO_MS / 1_000)) / 1_000) * 1_000;
  // in the morning of a day, so the first day of the history is observed in part only
  const begins = Math.floor(lastCheck / DAY) * DAY - HISTORY_DAYS * DAY + 9 * HOUR + 20 * MINUTE;
  return { begins, lastCheck };
}

/** The periods at home of one member over the whole history, the oldest first. */
function periodsAtHome(name: string, history: History): Span[] {
  const routine = ROUTINES[name];
  if (routine === undefined) {
    return [];
  }
  const spans: Span[] = [];
  for (let day = Math.floor(history.begins / DAY) * DAY; day < history.lastCheck; day += DAY) {
    for (const [from, to] of routine(day)) {
      spans.push({ from: day + from * MINUTE, to: day + to * MINUTE });
    }
  }
  return cut(merge(spans), history.begins, history.lastCheck);
}

/** Stretches that touch or overlap become one: an evening at home runs on into the night. */
function merge(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last !== undefined && span.from <= last.to) {
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, span.to) };
    } else {
      merged.push(span);
    }
  }
  return merged;
}

function cut(spans: readonly Span[], from: number, to: number): Span[] {
  return spans
    .map((span) => ({ from: Math.max(span.from, from), to: Math.min(span.to, to) }))
    .filter((span) => span.from < span.to);
}

const seconds = (spans: readonly Span[]) =>
  Math.round(spans.reduce((sum, span) => sum + (span.to - span.from), 0) / 1_000);

/** The calendar days from `from` to `to`, the first and the last cut to those bounds. */
function days(from: number, to: number): Span[] {
  const cutDays: Span[] = [];
  for (let day = Math.floor(from / DAY) * DAY; day < to; day += DAY) {
    cutDays.push({ from: Math.max(day, from), to: Math.min(day + DAY, to) });
  }
  return cutDays;
}

const members = () => HOUSEHOLD_PROFILES.map((profile) => profile.name);

/** `GET /home/presence/residents/presence`. `fresh`: nothing is stored about anybody yet. */
export function presenceNow(fresh: boolean, now: Date = new Date()): ResidentPresence[] {
  const history = historyAt(now);
  return members().map((name) => {
    const periods = fresh ? [] : periodsAtHome(name, history);
    const last = periods.at(-1);
    if (last === undefined) {
      return { name, present: false, since: null, lastCheckedAt: null };
    }
    const present = last.to === history.lastCheck;
    return {
      name,
      present,
      since: text(present ? last.from : last.to),
      lastCheckedAt: text(history.lastCheck),
    };
  });
}

/** What a report answers instead of its body: the error of the service, with its status. */
export interface Refusal {
  readonly status: number;
  readonly message: string;
}

export const isRefusal = (answer: object): answer is Refusal => 'status' in answer;

/** The range of a report as the service reads and checks it. */
function readRange(from: string | null, to: string | null): Span | Refusal {
  const range = { from: wallClock(from), to: wallClock(to) };
  if (Number.isNaN(range.from) || Number.isNaN(range.to)) {
    return { status: 400, message: 'Type mismatch.' };
  }
  if (range.from >= range.to) {
    return { status: 400, message: 'The start of the range must lie before its end' };
  }
  if (range.to - range.from > LONGEST_RANGE_DAYS * DAY) {
    return { status: 400, message: 'The range must not be longer than 366 days' };
  }
  return range;
}

/** `GET /home/presence/residents/{name}/report`. */
export function presenceReport(
  name: string,
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): PresenceReport | Refusal {
  const range = readRange(from, to);
  if (isRefusal(range)) {
    return range;
  }
  if (!members().includes(name)) {
    return { status: 404, message: `Unknown resident: ${name}` };
  }
  const history = historyAt(now);
  const periods = fresh ? [] : periodsAtHome(name, history);
  return {
    name,
    from: text(range.from),
    to: text(range.to),
    intervals: cut(periods, range.from, range.to).map((span): PresenceInterval => ({
      from: text(span.from),
      to: text(span.to),
      // still going on: it ends at the last check, and the range did not cut it off before
      open: span.to === history.lastCheck,
    })),
  };
}

/** `GET /home/presence/residents/{name}/report/daily`. */
export function dailyPresenceReport(
  name: string,
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): DailyPresenceReport | Refusal {
  const range = readRange(from, to);
  if (isRefusal(range)) {
    return range;
  }
  if (!members().includes(name)) {
    return { status: 404, message: `Unknown resident: ${name}` };
  }
  const history = historyAt(now);
  const all = fresh || name === NEVER_SEEN ? [] : periodsAtHome(name, history);
  const observed = {
    from: Math.max(range.from, history.begins),
    to: Math.min(range.to, history.lastCheck),
  };
  const head = { name, from: text(range.from), to: text(range.to) };
  if (all.length === 0 || observed.from >= observed.to) {
    return { ...head, observedFrom: null, observedUntil: null, days: [] };
  }
  const periods = cut(all, range.from, range.to);
  return {
    ...head,
    observedFrom: text(observed.from),
    observedUntil: text(observed.to),
    days: days(observed.from, observed.to).map((day): DailyPresence => {
      const atHome = seconds(cut(periods, day.from, day.to));
      // a presence carried over midnight is no arrival, one still going on no departure
      const arrivals = periods
        .map((span) => span.from)
        .filter((start) => start !== range.from && start !== history.begins)
        .filter((start) => start >= day.from && start < day.to);
      const departures = periods
        .map((span) => span.to)
        .filter((end) => end !== range.to && end !== history.lastCheck)
        .filter((end) => end > day.from && end <= day.to);
      return {
        date: text(day.from).slice(0, 10),
        secondsAtHome: atHome,
        firstArrival: arrivals.length > 0 ? text(Math.min(...arrivals)) : null,
        lastDeparture: departures.length > 0 ? text(Math.max(...departures)) : null,
        presencePercentage: Math.round((atHome / ((day.to - day.from) / 1_000)) * 1_000) / 10,
      };
    }),
  };
}

/** `GET /home/presence/house/report`: occupied while anybody is at home. */
export function houseReport(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): HouseReport | Refusal {
  const range = readRange(from, to);
  if (isRefusal(range)) {
    return range;
  }
  const history = historyAt(now);
  const observed = {
    from: Math.max(range.from, history.begins),
    to: Math.min(range.to, history.lastCheck),
  };
  const head = { from: text(range.from), to: text(range.to) };
  if (fresh || observed.from >= observed.to) {
    return { ...head, observedFrom: null, observedUntil: null, intervals: [], days: [] };
  }
  const occupied = cut(
    merge(members().flatMap((name) => periodsAtHome(name, history))),
    observed.from,
    observed.to,
  );
  const empty: Span[] = [];
  let cursor = observed.from;
  for (const span of occupied) {
    if (cursor < span.from) {
      empty.push({ from: cursor, to: span.from });
    }
    cursor = span.to;
  }
  if (cursor < observed.to) {
    empty.push({ from: cursor, to: observed.to });
  }
  const stretch = (occupiedNow: boolean) => (span: Span) => ({ ...span, occupied: occupiedNow });
  return {
    ...head,
    observedFrom: text(observed.from),
    observedUntil: text(observed.to),
    intervals: [...occupied.map(stretch(true)), ...empty.map(stretch(false))]
      .sort((a, b) => a.from - b.from)
      .map((span): OccupancyInterval => ({
        from: text(span.from),
        to: text(span.to),
        occupied: span.occupied,
      })),
    days: days(observed.from, observed.to).map((day): DailyOccupancy => {
      const emptyThatDay = cut(empty, day.from, day.to);
      return {
        date: text(day.from).slice(0, 10),
        secondsOccupied: seconds(cut(occupied, day.from, day.to)),
        secondsEmpty: seconds(emptyThatDay),
        wasEmpty: emptyThatDay.length > 0,
      };
    }),
  };
}

/** A `LocalDateTime` as a number; `NaN` for anything that is not one. */
function wallClock(value: string | null): number {
  return value !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)
    ? Date.parse(`${value}Z`)
    : NaN;
}

/** And back: `2026-10-08T15:46:44`. */
function text(wallClockMs: number): string {
  return new Date(wallClockMs).toISOString().slice(0, 19);
}

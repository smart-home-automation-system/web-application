import { houseDay, houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { HistoryRange } from '../../core/time/history-range';
import { CirculationRun, WaterCirculation } from '../../data-access/water/water-api';
import { DisplayText, MessageKey } from '../../i18n/messages';

/** What started a run, in the words of `water-service` (HAS-404; the automation of HAS-405 adds the other three). */
const TRIGGERS: Readonly<Record<string, MessageKey>> = {
  manual: 'hotWater.circulation.trigger.manual',
  motion: 'hotWater.circulation.trigger.motion',
  light: 'hotWater.circulation.trigger.light',
  window: 'hotWater.circulation.trigger.window',
};

/** How a run ended, in the words of `water-service` (`stopped_by` of `circulation_run`). */
const STOPPED_BY: Readonly<Record<string, MessageKey>> = {
  temperature: 'hotWater.circulation.stoppedBy.temperature',
  limit: 'hotWater.circulation.stoppedBy.limit',
  device: 'hotWater.circulation.stoppedBy.device',
  failure: 'hotWater.circulation.stoppedBy.failure',
};

const own = (words: Readonly<Record<string, MessageKey>>, word: string): MessageKey | undefined =>
  Object.hasOwn(words, word) ? words[word] : undefined;

/** A word of the service in ours; one this version does not know is printed as it came, never read as one it knows. */
function wordOf(words: Readonly<Record<string, MessageKey>>, word: string): DisplayText {
  const key = own(words, word);
  return key ? { key } : { literal: word };
}

export const triggerText = (trigger: string): DisplayText => wordOf(TRIGGERS, trigger);
export const stoppedByText = (stoppedBy: string): DisplayText => wordOf(STOPPED_BY, stoppedBy);

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The pump as the card shows it: a field the answer leaves out is `undefined` - never stopped, never 0. */
export interface CirculationView {
  readonly running?: boolean;
  readonly since?: string;
  readonly trigger?: string;
  readonly source?: string;
  readonly returnTemperature?: number;
  readonly measuredAt?: string;
  readonly lastRun?: RunRow;
}

export function toCirculationView(
  answer: WaterCirculation | null | undefined,
  timeZone: string,
): CirculationView {
  const running: unknown = answer?.running;
  return {
    running: typeof running === 'boolean' ? running : undefined,
    since: text(answer?.since),
    trigger: text(answer?.trigger),
    source: text(answer?.source),
    returnTemperature: finite(answer?.returnTemperature),
    measuredAt: text(answer?.measuredAt),
    lastRun: answer?.lastRun ? toRunRow(answer.lastRun, timeZone) : undefined,
  };
}

/** A run as a row: the duration only when both ends are there and in order. */
export interface RunRow {
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly trigger?: string;
  readonly source?: string;
  readonly stoppedBy?: string;
  /** Seconds, from `startedAt` to `endedAt`; `undefined` while it goes on or when an end is not readable. */
  readonly seconds?: number;
  readonly returnAtStart?: number;
  readonly returnAtEnd?: number;
}

export function toRunRow(run: CirculationRun, timeZone: string): RunRow {
  const started = parseHouseDateTime(text(run.startedAt));
  const ended = parseHouseDateTime(text(run.endedAt));
  // the instants of two times of the house: a run across a change of the clocks keeps its length
  const seconds =
    started && ended
      ? (houseInstant(ended, timeZone) - houseInstant(started, timeZone)) / 1_000
      : undefined;
  return {
    startedAt: text(run.startedAt),
    endedAt: text(run.endedAt),
    trigger: text(run.trigger),
    source: text(run.source),
    stoppedBy: text(run.stoppedBy),
    seconds: seconds !== undefined && seconds >= 0 ? Math.round(seconds) : undefined,
    returnAtStart: finite(run.returnAtStart),
    returnAtEnd: finite(run.returnAtEnd),
  };
}

/** The runs of an answer as rows; a run without its start is left out - it could not be placed in the day. */
export function toRunRows(
  runs: readonly CirculationRun[] | null | undefined,
  timeZone: string,
): readonly RunRow[] {
  return (runs ?? [])
    .filter((run) => typeof run === 'object' && run !== null)
    .map((run) => toRunRow(run, timeZone))
    .filter((row) => row.startedAt !== undefined);
}

/** A length of a run in minutes and seconds, as the text of `hotWater.circulation.duration`. */
export function durationText(seconds: number): DisplayText {
  return {
    key: 'hotWater.circulation.duration',
    params: { minutes: Math.floor(seconds / 60), seconds: seconds % 60 },
  };
}

/** Today of the house, from its midnight to the next: the range the runs are asked for. */
export function todayRange(instant: number, timeZone: string): HistoryRange {
  const day = houseDay(instant, timeZone);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  return { from: `${day}T00:00:00`, to: `${next}T00:00:00` };
}

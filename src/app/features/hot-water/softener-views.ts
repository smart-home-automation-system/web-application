import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import {
  SOFTENER_OUT_OF_DATE_MS,
  Softener,
  SoftenerAlert,
  SoftenerRegeneration,
} from '../../data-access/water/softener-api';
import { MessageKey } from '../../i18n/messages';
import { wallClockOf } from '../../shared/history-chart/chart-data';

/** The flags of the softener, in the order the card shows them, with their names. */
export const SOFTENER_FLAGS = [
  ['lowSalt', 'softener.flag.lowSalt'],
  ['leak', 'softener.flag.leak'],
  ['excessiveWaterUse', 'softener.flag.excessiveWaterUse'],
  ['shutoffValve', 'softener.flag.shutoffValve'],
  ['resin', 'softener.flag.resin'],
  ['error', 'softener.flag.error'],
] as const satisfies readonly (readonly [keyof NonNullable<Softener['alerts']>, MessageKey])[];

export type SoftenerFlag = (typeof SOFTENER_FLAGS)[number][0];

/** A flag of the softener: raised, clear, or not known - never read as clear when the answer leaves it out. */
export interface FlagView {
  readonly flag: SoftenerFlag;
  readonly label: MessageKey;
  readonly raised?: boolean;
}

/** The words of the cloud for the regeneration now, as the card tells them. */
export type RegenerationState = 'none' | 'scheduled' | 'running' | 'other';

/** The softener as the page and the tile show it - read once here, so that the two cannot tell it differently. */
export interface SoftenerView {
  readonly reachable?: boolean;
  readonly online?: boolean;
  readonly measuredAt?: string;
  readonly measuredInstant?: number;
  /** The service itself says the reading is older than two of its reads. */
  readonly stale?: boolean;
  readonly saltPercent?: number;
  readonly saltDaysLeft?: number;
  readonly outOfSaltDate?: string;
  readonly usedTodayLitres?: number;
  readonly averageDailyLitres?: number;
  readonly treatedAvailableLitres?: number;
  readonly flowLitresPerMinute?: number;
  readonly hardnessGpg?: number;
  readonly hardnessMgCaco3?: number;
  readonly lastRegenerationAt?: string;
  readonly daysSinceRegeneration?: number;
  readonly totalRegenerations?: number;
  /** `undefined` when the answer does not say; `other` - words this version does not know, told as they came. */
  readonly regeneration?: RegenerationState;
  readonly regenerationWords?: string;
  readonly flags: readonly FlagView[];
  readonly live?: boolean;
  readonly liveUntil?: string;
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const flag = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const day = (value: unknown): string | undefined =>
  typeof value === 'string' && DAY.test(value) ? value : undefined;

const STATES: Readonly<Record<string, RegenerationState>> = {
  none: 'none',
  scheduled: 'scheduled',
  regenerating: 'running',
  running: 'running',
  in_progress: 'running',
};

/**
 * Reads the answer of `GET /home/water/softener`. Nothing checks an answer at runtime: whatever is not a finite number
 * is not known, a flag that is not a boolean is not known - never clear - and a time that is no date-time of the house
 * is not known, never the time of the call.
 */
export function toSoftenerView(answer: Softener | null | undefined, timeZone: string): SoftenerView {
  const at: unknown = answer?.measuredAt;
  const parsed = typeof at === 'string' ? parseHouseDateTime(at) : undefined;
  const words = text(answer?.regeneration?.status);
  const until: unknown = answer?.liveUntil;
  return {
    reachable: flag(answer?.reachable),
    online: flag(answer?.online),
    measuredAt: parsed ? (at as string) : undefined,
    measuredInstant: parsed ? houseInstant(parsed, timeZone) : undefined,
    stale: flag(answer?.stale),
    saltPercent: finite(answer?.salt?.levelPercent),
    saltDaysLeft: finite(answer?.salt?.daysLeft),
    outOfSaltDate: day(answer?.salt?.outOfSaltDate),
    usedTodayLitres: finite(answer?.water?.usedTodayLitres),
    averageDailyLitres: finite(answer?.water?.averageDailyLitres),
    treatedAvailableLitres: finite(answer?.water?.treatedAvailableLitres),
    flowLitresPerMinute: finite(answer?.water?.flowLitresPerMinute),
    hardnessGpg: finite(answer?.hardnessGpg),
    hardnessMgCaco3: finite(answer?.hardnessMgCaco3),
    lastRegenerationAt: day(answer?.regeneration?.lastAt),
    daysSinceRegeneration: finite(answer?.regeneration?.daysSinceLast),
    totalRegenerations: finite(answer?.regeneration?.total),
    regeneration: words === undefined ? undefined : (STATES[words.toLowerCase()] ?? 'other'),
    regenerationWords: words,
    flags: SOFTENER_FLAGS.map(([name, label]) => ({ flag: name, label, raised: flag(answer?.alerts?.[name]) })),
    live: flag(answer?.live),
    liveUntil: typeof until === 'string' && parseHouseDateTime(until) ? until : undefined,
  };
}

/** Whether the answer tells anything of the softener at all. */
export function hasSoftenerReading(view: SoftenerView): boolean {
  return (
    view.saltPercent !== undefined ||
    view.usedTodayLitres !== undefined ||
    view.online !== undefined ||
    view.totalRegenerations !== undefined
  );
}

/**
 * The reads of the cloud stopped: the card shows the last of them. By the time of the reading against
 * `SOFTENER_OUT_OF_DATE_MS`, or the service saying so; never true without a time.
 */
export function isSoftenerOutOfDate(view: SoftenerView, now: number): boolean {
  return (
    view.stale === true ||
    (view.measuredInstant !== undefined && now - view.measuredInstant > SOFTENER_OUT_OF_DATE_MS)
  );
}

/** How the salt reads: low below 20 % (the softener's own flag decides the alert), out at 0. */
export function saltLevelOf(percent: number | undefined): 'out' | 'low' | 'ok' | undefined {
  if (percent === undefined) {
    return undefined;
  }
  if (percent <= 0) {
    return 'out';
  }
  return percent < SALT_LOW_PERCENT ? 'low' : 'ok';
}

/** Below this the gauge of the salt is drawn as low - the level the iQua application colours. */
export const SALT_LOW_PERCENT = 20;

/** The level of an alert of the cloud as the list colours it; words this version does not know are plain. */
export function alertLevelOf(alert: SoftenerAlert): 'critical' | 'warning' | 'info' {
  const level = text(alert.level)?.toLowerCase();
  if (level === 'critical' || level === 'error') {
    return 'critical';
  }
  return level === 'warning' || level === 'warn' ? 'warning' : 'info';
}

/** The start of every regeneration of a list on the wall-clock timeline of the house, for the marks of a chart. */
export function regenerationMarks(regenerations: readonly SoftenerRegeneration[] | null | undefined): number[] {
  return (regenerations ?? [])
    .map((regeneration) => wallClockOf(regeneration.startedAt))
    .filter((at): at is number => at !== undefined);
}

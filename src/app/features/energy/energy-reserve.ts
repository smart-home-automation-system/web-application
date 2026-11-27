import { houseDay, houseWeekMinute } from '../../core/time/house-date-time';
import {
  Battery,
  BatteryReserve,
  ChargeState,
  GridReading,
  InverterSettings,
  ReserveBody,
} from '../../data-access/energy/energy-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { runGoingOn } from './energy-charge';
import { shiftDay } from './energy-days';
import { numberOf } from './energy-views';

/**
 * The rules of the battery reserve - a copy of `ReserveRules` of energy-service (HAS-494): the level 10 - 100 % in steps
 * of 5; `until` only for a reserve switched on, after now and at most 7 days ahead. A rule changed there is changed here
 * too. The page refuses what the service would refuse, before the write.
 */
export const RESERVE_LEVEL = { min: 10, max: 100, step: 5 } as const;
export const RESERVE_LONGEST_UNTIL_DAYS = 7;
/** The level the form starts from while the service has none (the default of `energy_reserve`, V16). */
export const RESERVE_DEFAULT_LEVEL = 80;
/** The end the card offers as one press: tomorrow at this hour of the house. */
export const RESERVE_TOMORROW_AT = '18:00';

/** How long the reserve holds: until switched off, until tomorrow evening, or until a time of the owner's choice. */
export type ReserveEnd = 'none' | 'tomorrow' | 'date';

/** The three ends in the order of the card, each with its words - whole keys, as the check of the texts reads them. */
export const RESERVE_ENDS: readonly ReserveEnd[] = ['none', 'tomorrow', 'date'];
export const RESERVE_END_LABELS: Readonly<Record<ReserveEnd, MessageKey>> = {
  none: 'energy.reserve.end.none',
  tomorrow: 'energy.reserve.end.tomorrow',
  date: 'energy.reserve.end.date',
};

/** Why a body would be refused - one at a time, in the order of `ReserveRules.check`. */
export type ReserveProblem = 'level' | 'untilMissing' | 'untilPast' | 'untilTooFar';

export const RESERVE_PROBLEM_LABELS: Readonly<Record<ReserveProblem, MessageKey>> = {
  level: 'energy.reserve.problem.level',
  untilMissing: 'energy.reserve.problem.untilMissing',
  untilPast: 'energy.reserve.problem.untilPast',
  untilTooFar: 'energy.reserve.problem.untilTooFar',
};

export function levelValid(level: number): boolean {
  return (
    Number.isInteger(level) &&
    level >= RESERVE_LEVEL.min &&
    level <= RESERVE_LEVEL.max &&
    level % RESERVE_LEVEL.step === 0
  );
}

/** The wall clock of the house now, as the service takes a house time (`2026-11-24T23:09:00`), to the minute. */
export function houseNow(now: number, timeZone: string): string {
  const minute = houseWeekMinute(now, timeZone).minute;
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `${houseDay(now, timeZone)}T${hh}:${mm}:00`;
}

/** Tomorrow at 18:00 of the house, as the service takes it. */
export function tomorrowEvening(now: number, timeZone: string): string {
  return `${shiftDay(houseDay(now, timeZone), 1)}T${RESERVE_TOMORROW_AT}:00`;
}

/**
 * The end chosen on the card as the house time the service takes: none for `none`, tomorrow 18:00, or the value of the
 * date field (`2026-11-26T18:00` - seconds added); `undefined` for a date field that holds no date and time.
 */
export function untilFor(
  end: ReserveEnd,
  date: string,
  now: number,
  timeZone: string,
): string | null | undefined {
  if (end === 'none') {
    return null;
  }
  if (end === 'tomorrow') {
    return tomorrowEvening(now, timeZone);
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(date.trim());
  return match ? `${match[1]}T${match[2]}:00` : undefined;
}

/**
 * What `ReserveRules.check` would refuse in a body, or `undefined` for a body it takes. The times are house wall-clock
 * times of one format, so they compare as text; seven days ahead are seven days of the calendar of the house.
 */
export function reserveProblem(
  enabled: boolean,
  level: number,
  until: string | null | undefined,
  nowWall: string,
): ReserveProblem | undefined {
  if (!levelValid(level)) {
    return 'level';
  }
  if (!enabled || until === null) {
    return undefined;
  }
  if (until === undefined) {
    return 'untilMissing';
  }
  if (until <= nowWall) {
    return 'untilPast';
  }
  const latest = `${shiftDay(nowWall.slice(0, 10), RESERVE_LONGEST_UNTIL_DAYS)}${nowWall.slice(10)}`;
  return until > latest ? 'untilTooFar' : undefined;
}

/** The body of the write: `until` left out for a reserve that holds until switched off, or one switched off. */
export function reserveBody(enabled: boolean, level: number, until: string | null): ReserveBody {
  return enabled && until !== null ? { enabled, level, until } : { enabled, level };
}

/**
 * Whether the write needs a question first (HAS-496): switching on, or raising the level of a reserve on - both charge
 * the battery from the grid at up to 5 kW. Lowering it, changing its end or switching it off are sent at once. A stored
 * state the answer does not tell asks.
 */
export function needsQuestion(
  stored: BatteryReserve | null | undefined,
  body: ReserveBody,
): boolean {
  if (!body.enabled) {
    return false;
  }
  const storedLevel = numberOf(stored?.level);
  return stored?.enabled !== true || storedLevel === undefined || body.level > storedLevel;
}

/** The level the reserve holds at, or `undefined` while it is off or not known - the dashed line of the battery chart. */
export function heldLevel(reserve: BatteryReserve | null | undefined): number | undefined {
  return reserve?.enabled === true ? numberOf(reserve.level) : undefined;
}

const WRITE_STATES: Readonly<Record<string, MessageKey>> = {
  none: 'energy.reserve.write.none',
  pending: 'energy.reserve.write.pending',
  sent: 'energy.reserve.write.sent',
  taken: 'energy.reserve.write.taken',
  failed: 'energy.reserve.write.failed',
};

/** What became of the last write in our words, a word this version does not know as it came, none as not known. */
export function writeStateLabel(reserve: BatteryReserve | null | undefined): DisplayText {
  const state = reserve?.writeState;
  if (state === undefined) {
    return { key: 'energy.notKnown' };
  }
  const key = Object.hasOwn(WRITE_STATES, state) ? WRITE_STATES[state] : undefined;
  return key ? { key } : { literal: state };
}

/** The work modes the SOLAX reports (`WorkMode.wireName` of energy-service), each with the words of the card. */
const REAL_MODES: Readonly<Record<string, RealModeKind>> = {
  'self use': 'selfUse',
  'back up': 'backUp',
  'feed-in priority': 'feedIn',
  other: 'other',
};

type RealModeKind = 'selfUse' | 'backUp' | 'feedIn' | 'other';

const REAL_MODE_LABELS: Readonly<Record<Exclude<RealModeKind, 'backUp'>, MessageKey>> = {
  selfUse: 'energy.workMode.selfUse',
  feedIn: 'energy.workMode.real.feedIn',
  other: 'energy.workMode.real.other',
};

/**
 * The mode of the inverter as the card and the overview tell it (HAS-519): **what the SOLAX runs**, read from its dongle
 * (energy-service >= 0.23.0) - the work mode, for Back Up its Min SoC and Charge Battery To, and when it was read; a
 * charge from the grid going on is told beside it. Only while the inverter is not read (an older service, a dongle not
 * answering for 15 min) the mode the service wrote, labelled as such (`real: false`) - never the other way round.
 */
export interface ShownMode {
  readonly kind: RealModeKind | WorkMode['kind'];
  readonly text: DisplayText;
  /** Read from the inverter; `false` for the mode the service wrote. */
  readonly real: boolean;
  readonly readAt?: string;
  /** Charge Battery To of Back Up, %. */
  readonly chargeTo?: number;
  /** The end of a reserve the service wrote. */
  readonly until?: string;
  /** The target of a charge from the grid going on, `'?'` while not told; `undefined` without a charge. */
  readonly charging?: number | '?';
}

/**
 * The mode to show: the settings in the reserve first (the page and the overview poll it), those of `/status` while the
 * reserve says none, the mode the service wrote last.
 */
export function shownModeOf(
  charge: ChargeState | null | undefined,
  reserve: BatteryReserve | null | undefined,
  status?: InverterSettings | null,
): ShownMode {
  const inverter = reserve?.inverter ?? status ?? undefined;
  const wire = inverter?.workMode;
  const run = charge?.active === true ? charge.run : undefined;
  const charging = runGoingOn(run) ? (numberOf(run?.targetSoc) ?? '?') : undefined;
  if (typeof wire === 'string') {
    const kind = Object.hasOwn(REAL_MODES, wire) ? REAL_MODES[wire] : undefined;
    const minSoc = numberOf(inverter?.minSoc);
    let text: DisplayText;
    if (kind === undefined) {
      text = { literal: wire };
    } else if (kind === 'backUp') {
      text = { key: 'energy.workMode.real.backUp', params: { minSoc: minSoc ?? '?' } };
    } else {
      text = { key: REAL_MODE_LABELS[kind] };
    }
    return {
      kind: kind ?? 'other',
      text,
      real: true,
      readAt: inverter?.readAt,
      chargeTo: kind === 'backUp' ? numberOf(inverter?.chargeTo) : undefined,
      charging,
    };
  }
  const written = workModeOf(charge, reserve);
  switch (written.kind) {
    case 'charging':
      return {
        kind: 'charging',
        text: { key: 'energy.workMode.charging', params: { target: written.target ?? '?' } },
        real: false,
      };
    case 'backUp':
      return {
        kind: 'backUp',
        text: { key: 'energy.workMode.backUp', params: { level: written.level ?? '?' } },
        real: false,
        until: written.until,
      };
    case 'selfUse':
      return { kind: 'selfUse', text: { key: 'energy.workMode.selfUse' }, real: false };
    default:
      return { kind: 'notKnown', text: { key: 'energy.notKnown' }, real: false };
  }
}

/**
 * The reserve the inverter does not hold (HAS-519): the reserve on, and the Min SoC read from the inverter below its
 * level (`floorBelowLevel` of the service) - both numbers for the warning, `'?'` for one not told. `undefined` while the
 * service does not say so - a floor not known is never below.
 */
export function floorBelow(
  reserve: BatteryReserve | null | undefined,
): { readonly minSoc: number | '?'; readonly level: number | '?' } | undefined {
  if (reserve?.enabled !== true || reserve.floorBelowLevel !== true) {
    return undefined;
  }
  return {
    minSoc: numberOf(reserve.inverter?.minSoc) ?? '?',
    level: numberOf(reserve.level) ?? '?',
  };
}

/**
 * The level the inverter tops the battery up to from the grid by itself (HAS-519): the reserve on, no charge of the
 * service going on, the battery charging and the grid meter importing - each as the service words it. `undefined`
 * otherwise, and while any of them is not known.
 */
export function toppingUpTo(
  reserve: BatteryReserve | null | undefined,
  charge: ChargeState | null | undefined,
  battery: Battery | null | undefined,
  grid: GridReading | null | undefined,
): number | '?' | undefined {
  const run = charge?.active === true ? charge.run : undefined;
  if (
    reserve?.enabled !== true ||
    runGoingOn(run) ||
    battery?.direction !== 'charging' ||
    battery.stale === true ||
    grid?.direction !== 'import' ||
    grid.stale === true
  ) {
    return undefined;
  }
  return numberOf(reserve.level) ?? '?';
}

/**
 * The work mode of the SOLAX as the energy service set it (HAS-496, owner 2026-11-25) - the SolaX cloud reads none of
 * the settings back, so this is what the service wrote, not what the inverter reports: a charge from the grid going on
 * (Self Use with a charge window, to its target), else the battery reserve (Back Up at its level), else the baseline
 * (Self Use). Not known while the reserve is not known and no charge is told. Since HAS-519 only the fallback of
 * `shownModeOf`, while the inverter is not read.
 */
export type WorkMode =
  | { readonly kind: 'charging'; readonly target?: number }
  | { readonly kind: 'backUp'; readonly level?: number; readonly until?: string }
  | { readonly kind: 'selfUse' }
  | { readonly kind: 'notKnown' };

export function workModeOf(
  charge: ChargeState | null | undefined,
  reserve: BatteryReserve | null | undefined,
): WorkMode {
  const run = charge?.active === true ? charge.run : undefined;
  if (runGoingOn(run)) {
    return { kind: 'charging', target: numberOf(run?.targetSoc) };
  }
  if (reserve?.enabled === true) {
    return { kind: 'backUp', level: numberOf(reserve.level), until: reserve.until };
  }
  return reserve?.enabled === false ? { kind: 'selfUse' } : { kind: 'notKnown' };
}

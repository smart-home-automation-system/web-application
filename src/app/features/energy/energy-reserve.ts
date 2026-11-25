import { houseDay, houseWeekMinute } from '../../core/time/house-date-time';
import { BatteryReserve, ChargeState, ReserveBody } from '../../data-access/energy/energy-api';
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

/** Why a body would be refused - one at a time, in the order of `ReserveRules.check`. */
export type ReserveProblem = 'level' | 'untilMissing' | 'untilPast' | 'untilTooFar';

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

/**
 * The work mode of the SOLAX as the energy service set it (HAS-496, owner 2026-11-25) - the SolaX cloud reads none of
 * the settings back, so this is what the service wrote, not what the inverter reports: a charge from the grid going on
 * (Self Use with a charge window, to its target), else the battery reserve (Back Up at its level), else the baseline
 * (Self Use). Not known while the reserve is not known and no charge is told.
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

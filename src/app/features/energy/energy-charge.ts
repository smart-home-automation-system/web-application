import { houseDay, houseWeekMinute } from '../../core/time/house-date-time';
import { ChargeRun, PlannedOutage } from '../../data-access/energy/energy-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { shiftDay } from './energy-days';

/**
 * The bounds of the charge and of its automation - copied from `ChargeRules` and `AutomationRules` of
 * energy-service (HAS-336, HAS-338): a rule changed there is changed here too. The page refuses what
 * the service would refuse, before the write.
 */
export const CHARGE_TARGET = { min: 10, max: 100 } as const;
export const AUTOMATION_POWER = { min: 1, max: 8 } as const;
export const AUTOMATION_MARGIN = { min: 0, max: 720 } as const;

/** A whole number written in a field, `undefined` for anything else (a decimal included). */
export function wholeOf(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** A number written in a field, a comma taken for the point; `undefined` for anything else. */
export function decimalOf(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Whether a whole number is within the bounds. */
export function within(value: number | undefined, bounds: { min: number; max: number }): boolean {
  return value !== undefined && value >= bounds.min && value <= bounds.max;
}

/**
 * The end of a charge written as a time of day (`HH:mm`, the field of the page): the next such time of
 * the house - today when it is still ahead, tomorrow otherwise - as the house time the service takes
 * (`2026-11-03T18:30:00`). Empty for an empty field (the service then estimates the end); `invalid`
 * for anything that is not a time.
 */
export function untilOf(
  time: string,
  now: number,
  timeZone: string,
): string | undefined | 'invalid' {
  const trimmed = time.trim();
  if (trimmed === '') {
    return undefined;
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return 'invalid';
  }
  const minute = Number(match[1]) * 60 + Number(match[2]);
  const today = houseDay(now, timeZone);
  const day = minute > houseWeekMinute(now, timeZone).minute ? today : shiftDay(today, 1);
  return `${day}T${trimmed}:00`;
}

const RUN_STATES: Readonly<Record<string, MessageKey>> = {
  requested: 'energy.charge.state.requested',
  charging: 'energy.charge.state.charging',
  ending: 'energy.charge.state.ending',
  ended: 'energy.charge.state.ended',
  failed: 'energy.charge.state.failed',
};

const RUN_SOURCES: Readonly<Record<string, MessageKey>> = {
  dashboard: 'energy.charge.source.dashboard',
  automation: 'energy.charge.source.automation',
};

const RUN_ENDS: Readonly<Record<string, MessageKey>> = {
  target: 'energy.charge.endedBy.target',
  window: 'energy.charge.endedBy.window',
  cancel: 'energy.charge.endedBy.cancel',
  failed: 'energy.charge.endedBy.failed',
};

const OUTAGE_KINDS: Readonly<Record<string, MessageKey>> = {
  planned: 'energy.planned.kind.planned',
  unplanned: 'energy.planned.kind.unplanned',
};

const OUTAGE_SCOPES: Readonly<Record<string, MessageKey>> = {
  street: 'energy.planned.scope.street',
  town: 'energy.planned.scope.town',
};

/** A word of the service in ours, or as it came when this version does not know it. */
function wordOf(
  words: Readonly<Record<string, MessageKey>>,
  value: string | undefined,
): DisplayText {
  if (value === undefined) {
    return { key: 'energy.notKnown' };
  }
  const key = Object.hasOwn(words, value) ? words[value] : undefined;
  return key ? { key } : { literal: value };
}

export const runStateLabel = (run: ChargeRun | undefined) => wordOf(RUN_STATES, run?.state);
export const runSourceLabel = (run: ChargeRun | undefined) => wordOf(RUN_SOURCES, run?.source);
export const runEndLabel = (run: ChargeRun | undefined) => wordOf(RUN_ENDS, run?.endedBy);
export const outageKindLabel = (outage: PlannedOutage) => wordOf(OUTAGE_KINDS, outage.kind);
export const outageScopeLabel = (outage: PlannedOutage) => wordOf(OUTAGE_SCOPES, outage.scope);

/** Whether a run is still the inverter's business - charging, waiting for its command or being set back. */
export function runGoingOn(run: ChargeRun | undefined): boolean {
  return run?.state === 'requested' || run?.state === 'charging' || run?.state === 'ending';
}

/** The automatic charge applies to a planned outage of the street only (owner, 2026-11-03). */
export function automationApplies(outage: PlannedOutage): boolean {
  return outage.kind === 'planned' && outage.scope === 'street' && outage.id !== undefined;
}

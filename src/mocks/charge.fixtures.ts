import { HttpRequest } from '@angular/common/http';

import { readText } from '../app/core/storage/browser-storage';
import {
  Automation,
  BatteryReserve,
  ChargeRun,
  ChargeState,
  InverterSettings,
  PlannedOutage,
} from '../app/data-access/energy/energy-api';
import { houseTime } from './house-time';

/**
 * The charge of the mock battery and its automation (HAS-342): a charge started from the page charges
 * until it is stopped, a stop sets it back; the automation is off with the defaults of the service;
 * Tauron announces one planned outage of the street (with the start the automation would plan) and
 * one of the town. The writes change what the next reads answer and are refused as energy-service
 * refuses them (`CHARGE_IN_PROGRESS`, `NOT_FOUND_CHARGE`, `INVALID_AUTOMATION`,
 * `NOT_FOUND_PLANNED_OUTAGE`). Invented values only; `resetCharge()` for a unit test.
 * HAS-496: the battery reserve - off at 80 %, never written; a write is stored whole and answered `sent`, refused
 * with `INVALID_RESERVE` as `ReserveRules` refuses it (the level 10 - 100 by 5, `until` only for a reserve on, ahead
 * and at most 7 days).
 * HAS-519: the SOLAX as its dongle reads it - Self Use while no reserve holds or a charge goes on, Back Up with the
 * reserve, Charge Battery To at its level; the Min SoC starts at 75 % and, as on the real inverter, a write pulls it down
 * to the level and never up - so a reserve of 80 % is held only down to 75 % (`floorBelowLevel`). `held` from the SOC
 * of the battery. `localStorage['mock-inverter']` = `unread` - the dongle not read: no `inverter` anywhere; `floor` -
 * the reserve starts on at 80 %, held by the inverter only down to 75 % (a page loaded anew starts so too).
 */
interface ChargeMock {
  run: ChargeRun | undefined;
  runs: ChargeRun[];
  automation: Automation;
  skipped: Set<number>;
  reserve: BatteryReserve;
  minSoc: number;
  chargeTo: number;
}

const SOC = 62;
/** The Min SoC of Back Up the mock inverter starts with - set by hand once, below the default level of the reserve. */
const INITIAL_MIN_SOC = 75;
/** `held` of the service: the battery at the level less this tolerance or above. */
const HELD_TOLERANCE = 5;
const RESERVE_NEVER_WRITTEN: BatteryReserve = { enabled: false, level: 80, writeState: 'none' };
/** `mock-inverter` = `floor`: the reserve on at 80 %, above the Min SoC the mock inverter holds. */
const FLOOR_RESERVE_LEVEL = 80;
const RESERVE_ABOVE_FLOOR: BatteryReserve = {
  enabled: true,
  level: FLOOR_RESERVE_LEVEL,
  writeState: 'taken',
};

function initial(): ChargeMock {
  return {
    run: undefined,
    runs: [
      {
        id: 1,
        state: 'ended',
        source: 'dashboard',
        requestedAt: houseTime(new Date(), 2 * 24 * 3600 + 120),
        targetSoc: 80,
        socAtStart: 21,
        socAtEnd: 80,
        endedBy: 'target',
      },
      {
        id: 2,
        state: 'failed',
        source: 'dashboard',
        requestedAt: houseTime(new Date(), 5 * 24 * 3600 + 60),
        targetSoc: 100,
        socAtStart: 40,
        endedBy: 'failed',
        failure: 'DEVICE_FAILED',
      },
    ],
    automation: { chargeBeforeOutage: false, targetSoc: 100, chargePowerKw: 5, marginMinutes: 60 },
    skipped: new Set(),
    reserve: readText('mock-inverter') === 'floor' ? RESERVE_ABOVE_FLOOR : RESERVE_NEVER_WRITTEN,
    minSoc: INITIAL_MIN_SOC,
    chargeTo: readText('mock-inverter') === 'floor' ? FLOOR_RESERVE_LEVEL : 100,
  };
}

/** The dongle of the mock SOLAX not read (`mock-inverter` = `unread`): no settings anywhere. */
const inverterUnread = (): boolean => readText('mock-inverter') === 'unread';

/**
 * The settings of the mock SOLAX read from its dongle (HAS-518) - `/status` and the reserve carry the same; `undefined`
 * after a start or while the dongle is not read.
 */
export function inverterSettings(
  fresh: boolean,
  now: Date = new Date(),
): InverterSettings | undefined {
  if (fresh || inverterUnread()) {
    return undefined;
  }
  const charging =
    mock.run !== undefined && mock.run.state !== 'ended' && mock.run.state !== 'failed';
  return {
    workMode: mock.reserve.enabled && !charging ? 'back up' : 'self use',
    minSoc: mock.minSoc,
    chargeTo: mock.chargeTo,
    readAt: houseTime(now, 140),
  };
}

let mock = initial();

export function resetCharge(): void {
  mock = initial();
}

function refusal(status: number, code: string, message: string) {
  return { status, body: { errors: [{ message, code }] } };
}

/** A house time `hours` from now, cut to the minute. */
function ahead(hours: number, now: Date): string {
  return `${houseTime(now, -hours * 3600).slice(0, 16)}:00`;
}

export function chargeState(fresh: boolean, now: Date = new Date()): ChargeState {
  const plannedStart = fresh || mock.skipped.has(11) ? undefined : ahead(30, now);
  return mock.run
    ? { active: true, run: mock.run, soc: SOC, power: 4980, minutesLeft: 101, plannedStart }
    : { active: false, plannedStart };
}

export function chargeRuns(fresh: boolean): ChargeRun[] {
  return fresh ? [] : [...mock.runs];
}

export function startCharge(request: HttpRequest<unknown>, now: Date = new Date()) {
  if (mock.run) {
    return refusal(409, 'CHARGE_IN_PROGRESS', 'Charge in progress');
  }
  const body = (request.body ?? {}) as { targetSoc?: number; until?: string };
  const target = body.targetSoc ?? 100;
  if (!Number.isInteger(target) || target < 10 || target > 100) {
    return refusal(400, 'INVALID_CHARGE', 'Invalid charge');
  }
  if (SOC >= target) {
    return refusal(409, 'TARGET_REACHED', 'Target reached');
  }
  mock.run = {
    id: mock.runs.length + 10,
    state: 'charging',
    source: request.params.get('source') ?? 'dashboard',
    requestedAt: houseTime(now, 0),
    targetSoc: target,
    windowStart: `${houseTime(now, 0).slice(0, 16)}:00`,
    windowEnd: body.until ?? ahead(2.5, now),
    deliveryStatus: 4,
    deliveredAt: houseTime(now, 0),
    socAtStart: SOC,
  };
  return { status: 202, body: mock.run };
}

export function cancelCharge(now: Date = new Date()) {
  if (!mock.run) {
    return refusal(404, 'NOT_FOUND_CHARGE', 'Charge not found');
  }
  const ended: ChargeRun = {
    ...mock.run,
    state: 'ended',
    socAtEnd: SOC,
    endedAt: houseTime(now, 0),
    endedBy: 'cancel',
    restoredAt: houseTime(now, 0),
  };
  if (ended.plannedOutageId !== undefined) {
    mock.skipped.add(ended.plannedOutageId);
  }
  mock.runs = [ended, ...mock.runs];
  mock.run = undefined;
  return { status: 202, body: ended };
}

export function automation(fresh: boolean): Automation {
  return fresh
    ? { chargeBeforeOutage: false, targetSoc: 100, chargePowerKw: 5, marginMinutes: 60 }
    : mock.automation;
}

export function saveAutomation(request: HttpRequest<unknown>, now: Date = new Date()) {
  const body = (request.body ?? {}) as Partial<Automation>;
  const valid =
    typeof body.chargeBeforeOutage === 'boolean' &&
    Number.isInteger(body.targetSoc) &&
    (body.targetSoc ?? 0) >= 10 &&
    (body.targetSoc ?? 0) <= 100 &&
    typeof body.chargePowerKw === 'number' &&
    body.chargePowerKw >= 1 &&
    body.chargePowerKw <= 8 &&
    Number.isInteger(body.marginMinutes) &&
    (body.marginMinutes ?? -1) >= 0 &&
    (body.marginMinutes ?? 721) <= 720;
  if (!valid) {
    return refusal(400, 'INVALID_AUTOMATION', 'Invalid automation');
  }
  mock.automation = { ...(body as Automation), updatedAt: houseTime(now, 0) };
  return { status: 200, body: mock.automation };
}

export function plannedOutages(fresh: boolean, now: Date = new Date()): PlannedOutage[] {
  if (fresh) {
    return [];
  }
  return [
    {
      id: 11,
      startsAt: ahead(32, now),
      endsAt: ahead(38, now),
      kind: 'planned',
      scope: 'street',
      description: 'Testowo ul. Przykładowa, Lipowa',
      firstSeenAt: houseTime(now, 3 * 3600),
      notifiedAt: houseTime(now, 3 * 3600),
      skipAutomation: mock.skipped.has(11),
      plannedChargeStart: mock.skipped.has(11) ? undefined : ahead(30, now),
    },
    {
      id: 12,
      startsAt: ahead(80, now),
      endsAt: ahead(86, now),
      kind: 'planned',
      scope: 'town',
      description: 'Testowo ul. Długa',
      firstSeenAt: houseTime(now, 3 * 3600),
      skipAutomation: false,
    },
  ];
}

export function skipOutage(id: number, skip: boolean) {
  if (id !== 11 && id !== 12) {
    return refusal(404, 'NOT_FOUND_PLANNED_OUTAGE', 'Planned outage not found');
  }
  if (skip) {
    mock.skipped.add(id);
  } else {
    mock.skipped.delete(id);
  }
  return { status: 200, body: plannedOutages(false).find((outage) => outage.id === id) };
}

export function reserveState(fresh: boolean, now: Date = new Date()): BatteryReserve {
  if (fresh) {
    return RESERVE_NEVER_WRITTEN;
  }
  const inverter = inverterSettings(false, now);
  const on = mock.reserve.enabled === true;
  const level = mock.reserve.level ?? 0;
  return {
    ...mock.reserve,
    ...(inverter === undefined ? {} : { inverter }),
    // the service: false without a reserve, left out while the Min SoC is not known
    ...(on && inverter === undefined ? {} : { floorBelowLevel: on && mock.minSoc < level }),
    ...(on ? { held: SOC >= level - HELD_TOLERANCE } : {}),
  };
}

export function saveReserve(request: HttpRequest<unknown>, now: Date = new Date()) {
  const body = (request.body ?? {}) as { enabled?: unknown; level?: unknown; until?: unknown };
  const level = body.level;
  if (typeof body.enabled !== 'boolean' || typeof level !== 'number') {
    return refusal(400, 'INVALID_RESERVE', 'enabled and level are required');
  }
  if (!Number.isInteger(level) || level < 10 || level > 100 || level % 5 !== 0) {
    return refusal(400, 'INVALID_RESERVE', 'level must be between 10 and 100 in steps of 5');
  }
  const until = typeof body.until === 'string' ? body.until : undefined;
  if (until !== undefined) {
    const nowWall = houseTime(now, 0);
    const latest = houseTime(now, -7 * 24 * 3600);
    if (!body.enabled || until <= nowWall || until > latest) {
      return refusal(400, 'INVALID_RESERVE', 'until must be after now and at most 7 days ahead');
    }
  }
  const at = houseTime(now, 0);
  mock.reserve = {
    enabled: body.enabled,
    level,
    ...(until === undefined ? {} : { until }),
    updatedAt: at,
    writeState: 'sent',
    writeAttemptedAt: at,
  };
  // the write sets Charge Battery To only; the inverter pulls its Min SoC down to it, never up (proven 2026-11-25)
  if (body.enabled) {
    mock.chargeTo = level;
    mock.minSoc = Math.min(mock.minSoc, level);
  }
  return { status: 200, body: reserveState(false, now) };
}

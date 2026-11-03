import { HttpRequest } from '@angular/common/http';

import {
  Automation,
  ChargeRun,
  ChargeState,
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
 */
interface ChargeMock {
  run: ChargeRun | undefined;
  runs: ChargeRun[];
  automation: Automation;
  skipped: Set<number>;
}

const SOC = 62;

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

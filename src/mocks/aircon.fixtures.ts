import {
  AirconAutomation,
  AirconCommand,
  AirconPlug,
  AirconPowerBucket,
  AirconRule,
  AirconRuleBody,
  AirconRun,
  AirconUnit,
  PowerCycleRun,
  PowerCycleState,
} from '../app/data-access/aircon/aircon-api';
import { ruleProblem } from '../app/data-access/aircon/aircon-rule-rules';
import { commandProblem } from '../app/data-access/aircon/aircon-command-rules';
import { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The air conditioners of the mock house (HAS-394), the shape of `aircon-service` 0.11.0 with
 * invented names: the office cools at 23 °C, the bedroom is off and held by its open window, the
 * unit of tobi does not answer (it keeps what it reported) and the sanctum heats - the frost protection. A
 * command changes what the next read answers and is refused as the service refuses it
 * (`INVALID_COMMAND` from a copy of `CommandRules`, `NOT_FOUND_AIRCON`); `no-readings` answers every
 * unit by its id, name and room alone. `resetAircon()` for a unit test that changed them.
 */
interface StoredUnit {
  id: number;
  name: string;
  room: string;
  power: boolean;
  mode: string;
  targetTemperature: number;
  roomTemperature: number;
  fanSpeed: string;
  quiet: boolean;
  turbo: boolean;
  sleep: boolean;
  reachable: boolean;
  /** Seconds ago since the unit does not answer; left out while it does. */
  unreachableSecondsAgo?: number;
  lastCommandConfirmed?: boolean;
  /** Seconds ago the guard raised a cooling target to 22 °C. */
  minimumRestoredSecondsAgo?: number;
  window?: { state: string; openSecondsAgo?: number; hold?: boolean; restoreInSeconds?: number };
  compressorRunning?: boolean;
  filterHours: number;
  filterCleanedAt?: string;
}

const AT_THE_START: readonly StoredUnit[] = [
  {
    id: 140,
    name: 'Air conditioner',
    room: 'office',
    power: true,
    mode: 'cool',
    targetTemperature: 23,
    roomTemperature: 25,
    fanSpeed: 'auto',
    quiet: false,
    turbo: false,
    sleep: false,
    reachable: true,
    lastCommandConfirmed: true,
    minimumRestoredSecondsAgo: 3_905,
    window: { state: 'closed' },
    compressorRunning: true,
    filterHours: 87.4,
  },
  {
    id: 143,
    name: 'Air conditioner',
    room: 'bedroom',
    power: false,
    mode: 'cool',
    targetTemperature: 24,
    roomTemperature: 26,
    fanSpeed: 'medium-low',
    quiet: true,
    turbo: false,
    sleep: false,
    reachable: true,
    window: { state: 'open', openSecondsAgo: 305, hold: true, restoreInSeconds: 3_295 },
    compressorRunning: false,
    filterHours: 212.6,
  },
  {
    id: 141,
    name: 'Air conditioner',
    room: 'tobi',
    power: false,
    mode: 'auto',
    targetTemperature: 22,
    roomTemperature: 21,
    fanSpeed: 'auto',
    quiet: false,
    turbo: false,
    sleep: false,
    reachable: false,
    unreachableSecondsAgo: 725,
    filterHours: 3.1,
  },
  {
    id: 144,
    name: 'Air conditioner',
    room: 'sanctum',
    power: true,
    mode: 'heat',
    targetTemperature: 21,
    roomTemperature: 17,
    fanSpeed: 'auto',
    quiet: false,
    turbo: false,
    sleep: false,
    reachable: true,
    compressorRunning: false,
    filterHours: 1.5,
  },
];

let units: StoredUnit[] = structuredClone([...AT_THE_START]);

/** The units as they started - for a unit test that changed them. */
export function resetAircon(): void {
  units = structuredClone([...AT_THE_START]);
  resetAirconPage();
}

function replyOf(unit: StoredUnit, fresh: boolean, now: Date): AirconUnit {
  if (fresh) {
    return { id: unit.id, name: unit.name, room: unit.room };
  }
  const window = unit.window;
  return {
    id: unit.id,
    name: unit.name,
    room: unit.room,
    power: unit.power,
    mode: unit.mode,
    targetTemperature: unit.targetTemperature,
    roomTemperature: unit.roomTemperature,
    fanSpeed: unit.fanSpeed,
    swingVertical: 0,
    swingHorizontal: 0,
    quiet: unit.quiet,
    turbo: unit.turbo,
    sleep: unit.sleep,
    display: true,
    reachable: unit.reachable,
    ...(unit.unreachableSecondsAgo === undefined
      ? {}
      : { unreachableSince: houseTime(now, unit.unreachableSecondsAgo) }),
    updatedAt: houseTime(now, unit.reachable ? 12 : (unit.unreachableSecondsAgo ?? 0) + 30),
    ...(unit.lastCommandConfirmed === undefined
      ? {}
      : { lastCommandConfirmed: unit.lastCommandConfirmed }),
    ...(unit.minimumRestoredSecondsAgo === undefined
      ? {}
      : { minimumRestoredAt: houseTime(now, unit.minimumRestoredSecondsAgo) }),
    ...(window === undefined
      ? {}
      : {
          window: {
            state: window.state,
            ...(window.openSecondsAgo === undefined
              ? {}
              : { openSince: houseTime(now, window.openSecondsAgo) }),
            ...(window.hold === undefined ? {} : { hold: window.hold }),
            ...(window.restoreInSeconds === undefined
              ? {}
              : { restoreUntil: houseTime(now, -window.restoreInSeconds) }),
          },
        }),
    ...(unit.compressorRunning === undefined ? {} : { compressorRunning: unit.compressorRunning }),
    filter: {
      hoursSince: unit.filterHours,
      ...(unit.filterCleanedAt === undefined ? {} : { cleanedAt: unit.filterCleanedAt }),
      due: unit.filterHours >= 200,
    },
  };
}

export function airconUnits(fresh: boolean): readonly AirconUnit[] {
  const now = new Date();
  return units.map((unit) => replyOf(unit, fresh, now));
}

export function airconRoom(room: string, fresh: boolean): MockReply {
  const now = new Date();
  const inRoom = units.filter((unit) => unit.room === room);
  return inRoom.length === 0
    ? {
        status: 404,
        body: { errors: [{ message: 'Room not found', code: 'NOT_FOUND_ROOM' }] },
      }
    : { status: 200, body: inRoom.map((unit) => replyOf(unit, fresh, now)) };
}

/** The automation just after a start of the service: nothing read yet. */
export const AIRCON_AUTOMATION_FRESH: AirconAutomation = { emptyHouse: {}, grid: {} };

export function airconAutomation(): AirconAutomation {
  return {
    emptyHouse: { empty: false, since: houseTime(new Date(), 50_405) },
    grid: { state: 'present' },
  };
}

/** A command as `aircon-service` takes it: the unit answers or not, the rules refuse what they refuse. */
export function commandAircon(id: string, body: unknown, source: string | null): MockReply {
  const unit = units.find((candidate) => String(candidate.id) === id);
  if (unit === undefined) {
    return {
      status: 404,
      body: { errors: [{ message: 'Air conditioner not found', code: 'NOT_FOUND_AIRCON' }] },
    };
  }
  const command = (body ?? {}) as AirconCommand;
  const problem = commandProblem(command, unit);
  if (source !== 'dashboard' || Object.keys(command).length === 0 || problem !== undefined) {
    return {
      status: 400,
      body: { errors: [{ message: 'Invalid command', code: 'INVALID_COMMAND' }] },
    };
  }
  if (!unit.reachable) {
    return {
      status: 502,
      body: { errors: [{ message: 'Device failed', code: 'DEVICE_FAILED' }] },
    };
  }
  unit.power = command.power ?? unit.power;
  unit.mode = command.mode ?? unit.mode;
  unit.targetTemperature = command.targetTemperature ?? unit.targetTemperature;
  unit.fanSpeed = command.fanSpeed ?? unit.fanSpeed;
  unit.quiet = command.quiet ?? unit.quiet;
  unit.turbo = command.turbo ?? unit.turbo;
  unit.sleep = command.sleep ?? unit.sleep;
  unit.lastCommandConfirmed = true;
  if (command.power === true) {
    unit.window = unit.window?.hold ? { state: unit.window.state } : unit.window;
  }
  unit.compressorRunning = unit.power && unit.mode !== 'fan';
  return { status: 202, body: null };
}

// ---- HAS-395: the page of the units - the rules, the plugs, the power cycle, the filters, the runs ----

const RULES_AT_THE_START: readonly AirconRule[] = [
  {
    unitId: 144,
    keepBelow: { enabled: true, threshold: 25, hysteresis: 1, target: 22 },
    heatBySchedule: { enabled: true },
    updatedAt: '2026-11-08T10:49:31.87895',
  },
  {
    unitId: 140,
    keepBelow: { enabled: false, threshold: 26, hysteresis: 1, target: 24 },
    heatBySchedule: { enabled: false },
    updatedAt: '2026-11-07T21:15:27.067918',
  },
];

let rules: AirconRule[] = structuredClone([...RULES_AT_THE_START]);
let cycles: PowerCycleRun[] = [
  {
    startedAt: '2026-11-08T12:38:31.544497',
    finishedAt: '2026-11-08T12:38:46.859405',
    requestedBy: 'Aurelia',
    result: 'done',
  },
];

/** The rules, the cycles and the filters as they started - for a unit test that changed them. */
export function resetAirconPage(): void {
  rules = structuredClone([...RULES_AT_THE_START]);
  cycles = cycles.slice(-1);
}

const notFoundAircon = (): MockReply => ({
  status: 404,
  body: { errors: [{ message: 'Air conditioner not found', code: 'NOT_FOUND_AIRCON' }] },
});

export function airconRules(fresh: boolean): readonly AirconRule[] {
  return fresh ? [] : rules;
}

/** A rule written whole, refused as `RuleRules` refuses it. */
export function saveAirconRule(id: string, body: unknown): MockReply {
  const unitId = Number(id);
  if (!units.some((unit) => unit.id === unitId)) {
    return notFoundAircon();
  }
  const rule = body as AirconRuleBody;
  if (rule?.keepBelow === undefined || ruleProblem(rule) !== undefined) {
    return {
      status: 400,
      body: { errors: [{ message: 'Invalid rule', code: 'INVALID_RULE' }] },
    };
  }
  const stored: AirconRule = { unitId, ...rule, updatedAt: houseTime(new Date(), 0) };
  rules = [...rules.filter((one) => one.unitId !== unitId), stored];
  return { status: 200, body: stored };
}

export function deleteAirconRule(id: string): MockReply {
  const unitId = Number(id);
  if (!rules.some((one) => one.unitId === unitId)) {
    return {
      status: 404,
      body: { errors: [{ message: 'Rule not found', code: 'NOT_FOUND_RULE' }] },
    };
  }
  rules = rules.filter((one) => one.unitId !== unitId);
  return { status: 204, body: null };
}

/** The filter of a unit cleaned: its hours at 0. */
export function airconFilterCleaned(id: string): MockReply {
  const unit = units.find((candidate) => String(candidate.id) === id);
  if (unit === undefined) {
    return notFoundAircon();
  }
  unit.filterHours = 0;
  unit.filterCleanedAt = houseTime(new Date(), 0);
  return { status: 204, body: null };
}

/** The indoor plug draws what its four units ask; the sanctum one its single unit. */
export function airconPower(fresh: boolean): readonly AirconPlug[] {
  const now = new Date();
  if (fresh) {
    return [
      { plug: 'indoor', rooms: ['office', 'livia', 'tobi', 'bedroom'], relay: true },
      { plug: 'sanctum', rooms: ['sanctum'], relay: false },
    ];
  }
  const indoorOn = units.some((unit) => unit.room !== 'sanctum' && unit.power && unit.reachable);
  const sanctumOn = units.some((unit) => unit.room === 'sanctum' && unit.power);
  return [
    {
      plug: 'indoor',
      rooms: ['office', 'livia', 'tobi', 'bedroom'],
      relay: true,
      power: indoorOn ? 612.4 : 18.3,
      voltage: 231.6,
      current: indoorOn ? 2.874 : 1.054,
      output: true,
      compressorRunning: indoorOn,
      reachable: true,
      updatedAt: houseTime(now, 12),
      todayKwh: 3.2,
      last7DaysKwh: 21.5,
      last30DaysKwh: 80.1,
    },
    {
      plug: 'sanctum',
      rooms: ['sanctum'],
      relay: false,
      power: sanctumOn ? 412.0 : 5.4,
      voltage: 232.0,
      current: sanctumOn ? 1.9 : 0.324,
      compressorRunning: sanctumOn,
      reachable: true,
      updatedAt: houseTime(now, 14),
      todayKwh: 1.4,
      last7DaysKwh: 6.8,
    },
  ];
}

/**
 * The power of a plug in the buckets the service chooses: 5 min up to 2 days, 30 min up to 8, 2 h beyond. The
 * indoor plug runs in the afternoons, the sanctum one in the nights; the hour before last is missing.
 */
export function airconPowerSamples(
  plug: string | null,
  from: string | null,
  to: string | null,
): MockReply {
  if (plug !== 'indoor' && plug !== 'sanctum') {
    return {
      status: 404,
      body: { errors: [{ message: 'Plug not found', code: 'NOT_FOUND_PLUG' }] },
    };
  }
  const start = from === null ? NaN : Date.parse(from + 'Z');
  const end = to === null ? NaN : Date.parse(to + 'Z');
  if (!(start < end) || end - start > 31 * 86_400_000) {
    return {
      status: 400,
      body: { errors: [{ message: 'Invalid range', code: 'INVALID_RANGE' }] },
    };
  }
  const length = end - start;
  const bucket =
    length <= 2 * 86_400_000 ? 300_000 : length <= 8 * 86_400_000 ? 1_800_000 : 7_200_000;
  const gapFrom = end - 2 * 3_600_000;
  const buckets: AirconPowerBucket[] = [];
  for (let at = start; at < end; at += bucket) {
    if (at >= gapFrom && at < gapFrom + 3_600_000) {
      continue;
    }
    const hour = new Date(at).getUTCHours();
    const running = plug === 'indoor' ? hour >= 13 && hour < 18 : hour >= 0 && hour < 6;
    const base = running ? (plug === 'indoor' ? 600 : 400) : plug === 'indoor' ? 18 : 5;
    const avg = Math.round((base + ((at / bucket) % 7) * (running ? 12 : 0.3)) * 10) / 10;
    buckets.push({
      at: new Date(at).toISOString().slice(0, 19),
      avg,
      min: Math.round(avg * 0.9 * 10) / 10,
      max: Math.round(avg * 1.1 * 10) / 10,
    });
  }
  return { status: 200, body: buckets };
}

export function airconPowerCycle(): PowerCycleState {
  const indoorOn = units.find((unit) => unit.room !== 'sanctum' && unit.power && unit.reachable);
  const last = cycles.at(-1);
  return {
    allowed: indoorOn === undefined,
    ...(indoorOn === undefined ? {} : { reason: `Air conditioner ${indoorOn.id} is on` }),
    ...(last === undefined ? {} : { lastRun: last }),
  };
}

/** A power cycle as the service runs it - here done at once; refused while an indoor unit is on. */
export function startAirconPowerCycle(member: string | null): MockReply {
  const state = airconPowerCycle();
  if (!state.allowed) {
    return {
      status: 409,
      body: { errors: [{ message: 'Air conditioner running', code: 'AIRCON_RUNNING' }] },
    };
  }
  const at = houseTime(new Date(), 0);
  cycles = [
    ...cycles,
    {
      startedAt: at,
      finishedAt: at,
      ...(member === null ? {} : { requestedBy: member }),
      result: 'done',
    },
  ];
  return { status: 202, body: null };
}

/** The changes of a unit today: the first read, the remote, a rule, the window. */
export function airconRuns(id: string, from: string | null): MockReply {
  const unit = units.find((candidate) => String(candidate.id) === id);
  if (unit === undefined) {
    return notFoundAircon();
  }
  const day = (from ?? '2026-11-08T00:00:00').slice(0, 10);
  const runs: AirconRun[] = [
    {
      at: `${day}T07:02:10`,
      power: true,
      mode: unit.mode,
      targetTemperature: unit.targetTemperature,
      fanSpeed: 'auto',
      source: 'remote',
    },
    {
      at: `${day}T09:15:00`,
      power: false,
      mode: unit.mode,
      targetTemperature: unit.targetTemperature,
      fanSpeed: 'auto',
      source: 'window',
    },
    {
      at: `${day}T13:40:22`,
      power: true,
      mode: unit.mode,
      targetTemperature: unit.targetTemperature,
      fanSpeed: 'auto',
      source: 'rule',
    },
  ];
  return { status: 200, body: runs };
}

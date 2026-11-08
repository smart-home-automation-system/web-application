import { AirconAutomation, AirconCommand, AirconUnit } from '../app/data-access/aircon/aircon-api';
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
    filter: { hoursSince: unit.filterHours, due: unit.filterHours >= 200 },
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

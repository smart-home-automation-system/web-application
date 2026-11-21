import { readText } from '../app/core/storage/browser-storage';
import {
  Detector,
  SafetyAlarm,
  SafetyAutomation,
  SafetyRead,
  SafetyRun,
  SafetyStatus,
} from '../app/data-access/safety/safety-api';
import { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The fire detectors of the mock house (HAS-469), the shape of `safety-service` 0.3.0 plus the commands of HAS-464 and
 * the switches of HAS-468, with invented names and an invented base: the kitchen and the office all right, the living
 * room muted, the loft with a low battery, the bedroom off the base, the hall up never heard (every flag left out), a
 * CO detector in the boiler room read back at the start and not confirmed. `localStorage['mock-fire']` = `loft` puts the
 * loft in alarm instead (a mute is refused unless the detector is in alarm - HAS-464). `localStorage['mock-fire']` = `on`: the
 * kitchen in alarm (the banner of every page). `localStorage['mock-safety-base']` = `silent`: the base silent (the
 * banner of the administrator). A mute or a self test changes the next read and is refused as the service refuses it
 * (`COMMAND_TOO_SOON` within a minute per detector, `NOT_FOUND_DETECTOR`, a source that is not the dashboard); the
 * switches are stored whole. `no-readings` answers as just after a start. `resetSafety()` for a unit test.
 */
const BASE = 'SBS50ABCDEF01';

/** The detector `mock-fire` sets sounding: `on` the kitchen (71), `loft` the loft of Borys (74 - HAS-464, his mute). */
const FIRE_DETECTORS: Readonly<Record<string, number>> = { on: 71, loft: 74 };
const fireDetector = (): number | undefined => FIRE_DETECTORS[readText('mock-fire') ?? ''];
const baseSilent = (): boolean => readText('mock-safety-base') === 'silent';

interface StoredDetector {
  readonly detector: Detector;
  /** Seconds ago it was last heard, at the start; a command makes it heard now. */
  readonly heardSecondsAgo?: number;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

function flag(value: boolean, since: string): { value: boolean; since: string } {
  return { value, since };
}

/** The detectors as the mock service starts, their times worked out when asked. */
function detectorsAtTheStart(now: Date): StoredDetector[] {
  const weekAgo = houseTime(now, 7 * DAY + 600);
  const allRight = {
    online: flag(true, weekAgo),
    batteryLow: flag(false, weekAgo),
    endOfLife: flag(false, weekAgo),
    fault: flag(false, weekAgo),
    muted: flag(false, weekAgo),
    selfTestProblem: flag(false, weekAgo),
    model: 'XS01-M',
    firmware: 'v1.3.0',
    stationSerial: BASE,
    confirmed: true,
  };
  return [
    {
      heardSecondsAgo: 185,
      detector: {
        id: 71,
        name: 'Smoke detector',
        room: 'kitchen',
        kind: 'smoke detector',
        deviceId: '00000006',
        ...allRight,
        alarm: flag(false, weekAgo),
      },
    },
    {
      heardSecondsAgo: 245,
      detector: {
        id: 72,
        name: 'Office smoke detector',
        room: 'office',
        kind: 'smoke detector',
        deviceId: '00000007',
        ...allRight,
        alarm: flag(false, weekAgo),
      },
    },
    {
      heardSecondsAgo: 125,
      detector: {
        id: 73,
        name: 'Living room smoke detector',
        room: 'living room',
        kind: 'smoke detector',
        deviceId: '00000008',
        ...allRight,
        alarm: flag(false, houseTime(now, 20 * 60 + 5)),
        muted: flag(true, houseTime(now, 20 * 60 + 5)),
      },
    },
    {
      heardSecondsAgo: 305,
      detector: {
        id: 74,
        name: 'Loft smoke detector',
        room: 'loft',
        kind: 'smoke detector',
        deviceId: '00000009',
        ...allRight,
        alarm: flag(false, weekAgo),
        batteryLow: flag(true, houseTime(now, 2 * DAY)),
      },
    },
    {
      heardSecondsAgo: 3 * HOUR + 5,
      detector: {
        id: 75,
        name: 'Bedroom smoke detector',
        room: 'bedroom',
        kind: 'smoke detector',
        deviceId: '0000000A',
        ...allRight,
        alarm: flag(false, weekAgo),
        online: flag(false, houseTime(now, 3 * HOUR)),
      },
    },
    {
      // a detector the base never published: everything left out but what the registry gives
      detector: {
        id: 76,
        name: 'Hall up heat detector',
        room: 'hall up',
        kind: 'heat detector',
        stationSerial: BASE,
        deviceId: '0000000B',
      },
    },
    {
      heardSecondsAgo: 65,
      detector: {
        id: 77,
        name: 'CO detector',
        room: 'boiler',
        kind: 'co detector',
        deviceId: '0000000C',
        ...allRight,
        model: 'XC01-M',
        firmware: 'v1.1.2',
        alarm: flag(false, weekAgo),
        confirmed: false,
      },
    },
  ];
}

const COMMAND_IGNORE_REPEAT_FOR_MS = 60_000;

/** What the commands changed, by detector, in the memory of the page. */
interface Changes {
  muted?: number;
  tested?: number;
  lastCommandAt?: number;
}

let changes = new Map<number, Changes>();
let automation: Required<SafetyAutomation> = { lightsOn: true, blindsUp: false, airconOff: true };

export function resetSafety(): void {
  changes = new Map();
  automation = { lightsOn: true, blindsUp: false, airconOff: true };
}

function secondsSince(at: number, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - at) / 1_000));
}

function current(now: Date): Detector[] {
  return detectorsAtTheStart(now).map(({ detector, heardSecondsAgo }) => {
    const changed = changes.get(detector.id ?? -1) ?? {};
    const lastAt = Math.max(changed.muted ?? 0, changed.tested ?? 0);
    const fire = detector.id === fireDetector();
    return {
      ...detector,
      ...(fire ? { alarm: flag(true, houseTime(now, 95)) } : {}),
      ...(changed.muted === undefined
        ? {}
        : { muted: flag(true, houseTime(now, secondsSince(changed.muted, now))) }),
      ...(changed.tested === undefined
        ? {}
        : { selfTestProblem: flag(false, houseTime(now, secondsSince(changed.tested, now))) }),
      ...heardOf(lastAt, heardSecondsAgo, now),
    };
  });
}

/** When a detector was last heard: at its last command, else as at the start, else left out. */
function heardOf(
  lastAt: number,
  heardSecondsAgo: number | undefined,
  now: Date,
): Partial<Detector> {
  if (lastAt > 0) {
    return { lastHeardAt: houseTime(now, secondsSince(lastAt, now)), lastCommandConfirmed: true };
  }
  return heardSecondsAgo === undefined ? {} : { lastHeardAt: houseTime(now, heardSecondsAgo) };
}

/** `GET /home/safety`. */
export function safetyRead(fresh: boolean, now = new Date()): MockReply {
  if (fresh) {
    // the registry read, nothing heard from the base yet: every detector with what the registry gives alone
    const known: SafetyRead = {
      detectors: detectorsAtTheStart(now).map(({ detector }) => ({
        id: detector.id,
        name: detector.name,
        room: detector.room,
        kind: detector.kind,
        stationSerial: BASE,
        deviceId: detector.deviceId,
      })),
      bases: [],
    };
    return { status: 200, body: known };
  }
  const silent = baseSilent();
  const read: SafetyRead = {
    detectors: current(now),
    bases: [
      {
        stationSerial: BASE,
        online: flag(!silent, houseTime(now, silent ? 2 * HOUR : 7 * DAY)),
        ipAddress: '192.0.2.150',
        wifiSsid: 'house-iot',
        wifiRssi: -58,
        lastHeardAt: houseTime(now, silent ? 2 * HOUR + 5 : 35),
        confirmed: true,
      },
    ],
  };
  return { status: 200, body: read };
}

/** `GET /home/safety/status`. */
export function safetyStatus(fresh: boolean, now = new Date()): SafetyStatus {
  if (fresh) {
    return { bases: [], detectorsInTrouble: 0, alerts: [] };
  }
  const silent = baseSilent();
  const alerts = [
    {
      kind: 'battery',
      device: '74',
      name: 'Loft smoke detector',
      since: houseTime(now, 2 * DAY),
      told: true,
    },
    {
      kind: 'offline',
      device: '75',
      name: 'Bedroom smoke detector',
      since: houseTime(now, 3 * HOUR),
      told: true,
    },
    ...(silent
      ? [{ kind: 'base silent', device: BASE, name: BASE, since: houseTime(now, HOUR), told: true }]
      : []),
  ];
  return {
    bases: [
      {
        stationSerial: BASE,
        reachable: !silent,
        lastHeardAt: houseTime(now, silent ? 2 * HOUR + 5 : 35),
        ipAddress: '192.0.2.150',
        wifiRssi: -58,
        silent,
      },
    ],
    detectorsInTrouble: 2,
    alerts,
  };
}

const invalidRange = (): MockReply => ({
  status: 400,
  body: { errors: [{ message: 'Invalid range', code: 'INVALID_RANGE' }] },
});

/** At most 30 days, `from` before `to` - as the service judges a range. */
function badRange(from: string | null, to: string | null): boolean {
  if (from === null || to === null || from >= to) {
    return true;
  }
  return Date.parse(`${to}Z`) - Date.parse(`${from}Z`) > 30 * DAY * 1_000;
}

/**
 * `GET /home/safety/alarms?from=&to=`: eight episodes of the month - more than the five a card shows, so its "Show more"
 * appears (the preview of HAS-469) - and the detector of `mock-fire` going on (the kitchen, or the loft).
 */
export function safetyAlarms(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now = new Date(),
): MockReply {
  if (badRange(from, to)) {
    return invalidRange();
  }
  if (fresh) {
    return { status: 200, body: [] };
  }
  const sounding = current(now).find((detector) => detector.id === fireDetector());
  const episodes: SafetyAlarm[] = [
    ...(sounding !== undefined
      ? [
          {
            id: 4,
            detectorId: sounding.id,
            name: sounding.name,
            room: sounding.room,
            startedAt: houseTime(now, 95),
            alarmToldAt: houseTime(now, 93),
          },
        ]
      : []),
    {
      id: 3,
      detectorId: 73,
      name: 'Living room smoke detector',
      room: 'living room',
      startedAt: houseTime(now, 20 * 60 + 5),
      clearedAt: houseTime(now, 18 * 60 + 5),
      alarmToldAt: houseTime(now, 20 * 60 + 3),
      overToldAt: houseTime(now, 18 * 60),
    },
    {
      id: 2,
      detectorId: 71,
      name: 'Smoke detector',
      room: 'kitchen',
      startedAt: houseTime(now, 4 * DAY + 2 * HOUR),
      clearedAt: houseTime(now, 4 * DAY + 2 * HOUR - 180),
      alarmToldAt: houseTime(now, 4 * DAY + 2 * HOUR - 2),
      overToldAt: houseTime(now, 4 * DAY + 2 * HOUR - 178),
    },
    {
      id: 1,
      detectorId: 72,
      name: 'Office smoke detector',
      room: 'office',
      startedAt: houseTime(now, 18 * DAY),
      clearedAt: houseTime(now, 18 * DAY - 60),
    },
    ...[6, 9, 12, 22, 26].map((days, index): SafetyAlarm => ({
      id: -1 - index,
      detectorId: 75,
      name: 'Bedroom smoke detector',
      room: 'bedroom',
      startedAt: houseTime(now, days * DAY),
      clearedAt: houseTime(now, days * DAY - 5),
      alarmToldAt: houseTime(now, days * DAY - 1),
      overToldAt: houseTime(now, days * DAY - 5),
    })),
  ];
  return {
    status: 200,
    body: episodes.filter(
      (alarm) => (alarm.startedAt ?? '') >= from! && (alarm.startedAt ?? '') < to!,
    ),
  };
}

/** `GET /home/safety/automation`. */
export function safetyAutomation(fresh: boolean): SafetyAutomation {
  return fresh ? { lightsOn: false, blindsUp: false, airconOff: false } : { ...automation };
}

/** `PUT /home/safety/automation`: the whole body of three switches, or `INVALID_AUTOMATION`. */
export function saveSafetyAutomation(body: unknown): MockReply {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const keys = ['lightsOn', 'blindsUp', 'airconOff'] as const;
  if (!keys.every((key) => typeof record[key] === 'boolean')) {
    return {
      status: 400,
      body: { errors: [{ message: 'Every switch is required', code: 'INVALID_AUTOMATION' }] },
    };
  }
  automation = {
    lightsOn: record['lightsOn'] as boolean,
    blindsUp: record['blindsUp'] as boolean,
    airconOff: record['airconOff'] as boolean,
  };
  return { status: 204, body: null };
}

/** `GET /home/safety/automation/runs?from=&to=`: what the switches sent during the alarm of the living room. */
export function safetyRuns(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now = new Date(),
): MockReply {
  if (badRange(from, to)) {
    return invalidRange();
  }
  if (fresh) {
    return { status: 200, body: [] };
  }
  const runs: SafetyRun[] = [
    {
      episode: 3,
      reaction: 'lightsOn',
      target: 'living room',
      sentAt: houseTime(now, 20 * 60),
      outcome: 'sent',
    },
    {
      episode: 3,
      reaction: 'lightsOn',
      target: 'hall down',
      sentAt: houseTime(now, 20 * 60),
      outcome: 'sent',
    },
    {
      episode: 3,
      reaction: 'airconOff',
      target: 'Air conditioner',
      sentAt: houseTime(now, 20 * 60 - 1),
      outcome: 'failed',
    },
    // the alarm of the kitchen four days ago: the way out lit, the blinds of the kitchen opened
    ...['kitchen', 'hall down', 'hall up'].map((target): SafetyRun => ({
      episode: 2,
      reaction: 'lightsOn',
      target,
      sentAt: houseTime(now, 4 * DAY + 2 * HOUR - 1),
      outcome: 'sent',
    })),
    {
      episode: 2,
      reaction: 'blindsUp',
      target: 'kitchen',
      sentAt: houseTime(now, 4 * DAY + 2 * HOUR - 1),
      outcome: 'sent',
    },
  ];
  return {
    status: 200,
    body: runs.filter((run) => (run.sentAt ?? '') >= from! && (run.sentAt ?? '') < to!),
  };
}

/**
 * `POST /home/safety/{id}/mute|self-test?source=dashboard`: 202, one command per detector a minute; a mute only of a
 * detector in alarm (`409 NOTHING_TO_MUTE`).
 */
export function commandDetector(
  id: string,
  command: 'mute' | 'self-test',
  source: string | null,
  now = new Date(),
): MockReply {
  const detector = detectorsAtTheStart(now).find(({ detector }) => String(detector.id) === id);
  if (detector === undefined) {
    return {
      status: 404,
      body: { errors: [{ message: 'Detector not found', code: 'NOT_FOUND_DETECTOR' }] },
    };
  }
  if (source !== 'dashboard') {
    return { status: 400, body: { errors: [{ message: 'source must be dashboard' }] } };
  }
  const key = Number(id);
  const changed = changes.get(key) ?? {};
  // HAS-464: the service refuses a mute of a detector not in alarm - the base would do nothing
  if (command === 'mute' && current(now).find((one) => one.id === key)?.alarm?.value !== true) {
    return {
      status: 409,
      body: { errors: [{ message: 'Nothing to mute', code: 'NOTHING_TO_MUTE' }] },
    };
  }
  if (
    changed.lastCommandAt !== undefined &&
    now.getTime() - changed.lastCommandAt < COMMAND_IGNORE_REPEAT_FOR_MS
  ) {
    return {
      status: 429,
      body: { errors: [{ message: 'Command too soon', code: 'COMMAND_TOO_SOON' }] },
    };
  }
  changes.set(key, {
    ...changed,
    lastCommandAt: now.getTime(),
    ...(command === 'mute' ? { muted: now.getTime() } : { tested: now.getTime() }),
  });
  return { status: 202, body: null };
}

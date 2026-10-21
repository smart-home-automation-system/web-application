import {
  EmptyHouse,
  Light,
  Occupancy,
  RoomLights,
  RoomRule,
  RuleRun,
} from '../app/data-access/light/light-api';
import type { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The lights of the mock house (`light-service`, HAS-292, HAS-266), which can be switched: a command
 * changes what the next read answers, in the memory of the page - a reload is the house as it
 * started. The ids 3, 5 and 13 are the lights of the mock device registry (`devices.fixtures.ts`):
 * the office relay (off), the living room dimmer (on, held by hand) and the bedroom strip, which
 * nothing has been heard of since the start. The lights from 40 on are known to the mock service
 * only - every kind and every state the lights page draws: an Eaton desk lamp that dims, an rgbw
 * strip with a white channel and one without (a Gen2 RGBW in the profile rgb), a hall light the
 * rules switched on, and a kitchen light that is not reachable.
 *
 * A command with `source=dashboard` holds the light for the 30 minutes of the mock rules, as the
 * engine of the service does. An Eaton light reports a change a second after the command was
 * taken, as it does through `amx-service` (HAS-293): a read right after the command still answers
 * the state before it. An unreachable light refuses every command with `DEVICE_FAILED`.
 */
interface StoredLight {
  readonly id: number;
  readonly name: string;
  readonly room: string;
  readonly vendor: string;
  readonly kind: 'relay' | 'dimmer' | 'rgbw';
  on?: boolean;
  brightness?: number;
  rgb?: readonly [number, number, number];
  /** Only a light with a white channel reports it. */
  white?: number;
  changedSecondsAgo?: number;
  source?: string;
  reachable?: boolean;
  /** Seconds from now; left out when nothing holds it. */
  heldForSeconds?: number;
}

const HOLD_SECONDS = 30 * 60;
const EATON_REPORTS_AFTER_MS = 1_000;

const AT_THE_START: readonly StoredLight[] = [
  {
    id: 3,
    name: 'Office main light',
    room: 'office',
    vendor: 'shelly',
    kind: 'relay',
    on: false,
    changedSecondsAgo: 3 * 3600 + 5,
    source: 'switch',
    reachable: true,
  },
  {
    id: 40,
    name: 'Office desk lamp',
    room: 'office',
    vendor: 'eaton',
    kind: 'dimmer',
    on: false,
    brightness: 40,
    changedSecondsAgo: 2 * 3600 + 5,
    source: 'rule',
    reachable: true,
  },
  {
    id: 5,
    name: 'Living room dimmer',
    room: 'living room',
    vendor: 'eaton',
    kind: 'dimmer',
    on: true,
    brightness: 60,
    changedSecondsAgo: 10 * 60 + 5,
    source: 'external',
    reachable: true,
    heldForSeconds: 20 * 60,
  },
  {
    id: 41,
    name: 'Living room colour strip',
    room: 'living room',
    vendor: 'shelly',
    kind: 'rgbw',
    on: true,
    brightness: 80,
    rgb: [255, 140, 40],
    white: 0,
    changedSecondsAgo: 45 * 60 + 5,
    source: 'HTTP_in',
    reachable: true,
    heldForSeconds: 15 * 60,
  },
  { id: 13, name: 'Bedroom light strip', room: 'bedroom', vendor: 'shelly', kind: 'rgbw' },
  {
    id: 42,
    name: 'Hall up ceiling',
    room: 'hall up',
    vendor: 'eaton',
    kind: 'relay',
    on: true,
    changedSecondsAgo: 2 * 60 + 5,
    source: 'rule',
    reachable: true,
  },
  {
    id: 43,
    name: 'Kitchen counter light',
    room: 'kitchen',
    vendor: 'shelly',
    kind: 'relay',
    on: false,
    changedSecondsAgo: 5 * 3600 + 5,
    source: 'button',
    reachable: false,
  },
  {
    id: 44,
    name: 'Kitchen hood light',
    room: 'kitchen',
    vendor: 'shelly',
    kind: 'rgbw',
    on: false,
    brightness: 100,
    rgb: [0, 120, 255],
    changedSecondsAgo: 26 * 3600 + 5,
    source: 'empty-house',
    reachable: true,
  },
];

let lights: StoredLight[] = AT_THE_START.map((one) => ({ ...one }));
// the changes an Eaton light has not reported yet, by when it reports them
let unreported: { readonly at: number; readonly report: () => void }[] = [];

/** For a unit test that switched a light. */
export function resetLights(): void {
  lights = AT_THE_START.map((one) => ({ ...one }));
  unreported = [];
}

function reportDue(now: Date): void {
  const due = unreported.filter((change) => change.at <= now.getTime());
  unreported = unreported.filter((change) => change.at > now.getTime());
  due.forEach((change) => change.report());
}

function view(light: StoredLight, now: Date): Light {
  return {
    id: light.id,
    name: light.name,
    room: light.room,
    vendor: light.vendor,
    kind: light.kind,
    ...(light.on === undefined ? {} : { on: light.on }),
    ...(light.brightness === undefined ? {} : { brightness: light.brightness }),
    ...(light.rgb === undefined
      ? {}
      : {
          color: { rgb: light.rgb, ...(light.white === undefined ? {} : { white: light.white }) },
        }),
    ...(light.changedSecondsAgo === undefined
      ? {}
      : { changedAt: houseTime(now, light.changedSecondsAgo) }),
    ...(light.source === undefined ? {} : { source: light.source }),
    ...(light.reachable === undefined ? {} : { reachable: light.reachable }),
    ...(light.heldForSeconds === undefined
      ? {}
      : { heldUntil: houseTime(now, -light.heldForSeconds) }),
  };
}

/**
 * The occupancy of the rooms with lights: the office occupied by its presence sensor, the living
 * room and the hall up with motion sensors only (so never occupied or empty), the kitchen empty, the
 * bedroom with no sensor at all.
 */
function occupancyOf(room: string, now: Date): Occupancy {
  switch (room) {
    case 'office':
      return {
        room,
        occupied: true,
        since: houseTime(now, 40 * 60 + 5),
        lastMotionAt: houseTime(now, 65),
        illumination: 'twilight',
        lux: 39,
        sensors: [
          {
            id: 50,
            name: 'Office presence',
            kind: 'presence sensor',
            lastReportAt: houseTime(now, 20),
            reachable: true,
          },
          {
            id: 51,
            name: 'Office motion sensor',
            kind: 'motion sensor',
            lastReportAt: houseTime(now, 65),
            reachable: true,
          },
        ],
      };
    case 'living room':
      return {
        room,
        lastMotionAt: houseTime(now, 4 * 60 + 5),
        lux: 34,
        sensors: [
          {
            id: 52,
            name: 'Living room motion sensor',
            kind: 'motion sensor',
            lastReportAt: houseTime(now, 4 * 60 + 5),
            reachable: true,
          },
        ],
      };
    case 'hall up':
      return {
        room,
        lastMotionAt: houseTime(now, 2 * 60 + 10),
        sensors: [{ id: 8, name: 'Hall motion sensor', kind: 'motion sensor' }],
      };
    case 'kitchen':
      return {
        room,
        occupied: false,
        since: houseTime(now, 3 * 3600 + 5),
        illumination: 'bright',
        sensors: [
          {
            id: 53,
            name: 'Kitchen presence',
            kind: 'presence sensor',
            lastReportAt: houseTime(now, 30),
            reachable: true,
          },
        ],
      };
    default:
      return { room, sensors: [] };
  }
}

/** `GET /home/light`: every light by room; `fresh` - just after a start, nothing heard of any. */
export function lightsByRoom(fresh = false, now: Date = new Date()): RoomLights[] {
  reportDue(now);
  const rooms = [...new Set(lights.map((light) => light.room))];
  return rooms.map((room) => {
    const here = lights
      .filter((light) => light.room === room)
      // just after a start the service knows the registry's lights and nothing of their state
      .map(({ id, name, room, vendor, kind, ...state }) =>
        view({ id, name, room, vendor, kind, ...(fresh ? {} : state) }, now),
      );
    const states = here.map((light) => light.on);
    return {
      room,
      ...(states.includes(true)
        ? { anyOn: true }
        : states.every((on) => on === false)
          ? { anyOn: false }
          : {}),
      lights: here,
      // after a start every room is unknown, never empty
      occupancy: fresh ? { room, sensors: [] } : occupancyOf(room, now),
    };
  });
}

/** `GET /home/light/rules`: the office switches itself off, the hall up lights by motion. */
export function lightRules(fresh = false, now: Date = new Date()): RoomRule[] {
  if (fresh) {
    return [];
  }
  return [
    {
      room: 'office',
      autoOffEnabled: true,
      autoOffDelayMinutes: 15,
      motionOnEnabled: false,
      periods: [],
      manualHoldMinutes: 60,
      enabledByResident: true,
      updatedAt: houseTime(now, 3 * 86400 + 5),
    },
    {
      room: 'hall up',
      autoOffEnabled: true,
      autoOffDelayMinutes: 10,
      motionOnEnabled: true,
      onlyBelowLux: 30,
      motionOffAfterMinutes: 3,
      periods: [
        { from: '16:00', to: '22:00', brightness: 80 },
        { from: '22:00', to: '06:00', brightness: 10, rgb: [255, 120, 0] },
      ],
      manualHoldMinutes: 30,
      enabledByResident: true,
      updatedAt: houseTime(now, 86400 + 5),
    },
    {
      room: 'living room',
      autoOffEnabled: true,
      autoOffDelayMinutes: 10,
      motionOnEnabled: false,
      periods: [],
      manualHoldMinutes: 10,
      // the switch of My room: the resident has stopped the rules of the room
      enabledByResident: false,
      updatedAt: houseTime(now, 2 * 86400 + 5),
    },
  ];
}

/** `GET /home/light/rooms/{room}/rules/runs`: what the engine sent in the room today. */
export function lightRuns(room: string, now: Date = new Date()): RuleRun[] {
  switch (room) {
    case 'office':
      return [
        { deviceId: 40, action: 'off', reason: 'auto-off', at: houseTime(now, 2 * 3600 + 5) },
        {
          deviceId: 3,
          action: 'off',
          reason: 'auto-off',
          error: 'DEVICE_FAILED',
          at: houseTime(now, 2 * 3600 + 5),
        },
      ];
    case 'hall up':
      return [
        { deviceId: 42, action: 'on', reason: 'motion-on', at: houseTime(now, 2 * 60 + 5) },
        { deviceId: 42, action: 'off', reason: 'motion-off', at: houseTime(now, 50 * 60 + 5) },
        { deviceId: 42, action: 'on', reason: 'motion-on', at: houseTime(now, 55 * 60 + 5) },
      ];
    default:
      return [];
  }
}

/**
 * `GET /home/light/empty-house`: somebody at home, tonight's dusk and sunrise, and a preview of what
 * the simulation would light now; just after a start nobody is known to be anywhere.
 */
export function emptyHouse(fresh = false, now: Date = new Date()): EmptyHouse {
  const day = houseTime(now, 0).slice(0, 10);
  const next = houseTime(new Date(now.getTime() + 86_400_000), 0).slice(0, 10);
  if (fresh) {
    return { enabled: true, house: 'unknown', active: false };
  }
  return {
    enabled: true,
    house: 'occupied',
    active: false,
    dusk: `${day}T18:12:00`,
    sunrise: `${next}T07:15:00`,
    lit: [5],
  };
}

const refused = (status: number, message: string, code?: string): MockReply => ({
  status,
  body: { errors: [code ? { message, code } : { message }] },
});

function find(id: string): StoredLight | undefined {
  return lights.find((light) => String(light.id) === id);
}

interface Change {
  on: boolean;
  brightness?: number;
  rgb?: readonly [number, number, number];
  white?: number;
}

function changed(light: StoredLight, change: Change, source: string): void {
  const report = () => {
    light.on = change.on;
    if (change.brightness !== undefined) {
      light.brightness = change.brightness;
    }
    if (change.rgb !== undefined) {
      light.rgb = change.rgb;
    }
    if (change.white !== undefined) {
      light.white = change.white;
    }
    noteChange(light, source);
  };
  if (light.vendor === 'eaton') {
    unreported.push({ at: Date.now() + EATON_REPORTS_AFTER_MS, report });
  } else {
    report();
  }
}

function noteChange(light: StoredLight, source: string): void {
  light.changedSecondsAgo = 0;
  light.source = source;
  light.reachable = true;
  // a change that is not the rules' holds them back, as the engine of the service does
  light.heldForSeconds = source === 'rule' || source === 'empty-house' ? undefined : HOLD_SECONDS;
}

/** What the device does with a command it cannot reach: the service answers 502 with the code alone. */
const unreachable = (light: StoredLight): MockReply | undefined =>
  light.reachable === false ? refused(502, 'Device failed', 'DEVICE_FAILED') : undefined;

/** `POST /home/light/{id}?turn=`: what `light-service` refuses, with its status and code. */
export function turnLight(id: string, turn: string | null, source: string | null): MockReply {
  if (turn !== 'on' && turn !== 'off') {
    return refused(400, 'turn must be on or off');
  }
  const light = find(id);
  if (light === undefined) {
    return refused(404, `Light [${id}] not found`, 'NOT_FOUND_LIGHT');
  }
  const failed = unreachable(light);
  if (failed) {
    return failed;
  }
  changed(light, { on: turn === 'on' }, source ?? 'dashboard');
  return { status: 202, body: null };
}

/** `POST /home/light/{id}/brightness?value=`: 1 ... 100, a light that dims only; switches it on. */
export function setBrightness(id: string, value: string | null, source: string | null): MockReply {
  const brightness = Number(value);
  if (!Number.isInteger(brightness) || brightness < 1 || brightness > 100) {
    return refused(400, 'value must be between 1 and 100');
  }
  const light = find(id);
  if (light === undefined) {
    return refused(404, `Light [${id}] not found`, 'NOT_FOUND_LIGHT');
  }
  if (light.kind === 'relay') {
    return refused(400, `Light [${id}] does not dim`, 'UNSUPPORTED_CAPABILITY');
  }
  const failed = unreachable(light);
  if (failed) {
    return failed;
  }
  changed(light, { on: true, brightness }, source ?? 'dashboard');
  return { status: 202, body: null };
}

const isByte = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;

/**
 * `POST /home/light/{id}/color`: rgb and white 0 ... 255, brightness 1 ... 100, each optional and at
 * least one; a light without a colour, and white for one without a white channel, are refused.
 */
export function setColor(id: string, body: unknown, source: string | null): MockReply {
  const color = (body ?? {}) as { rgb?: unknown; white?: unknown; brightness?: unknown };
  const rgb = color.rgb;
  if (
    (rgb !== undefined && !(Array.isArray(rgb) && rgb.length === 3 && rgb.every(isByte))) ||
    (color.white !== undefined && !isByte(color.white)) ||
    (color.brightness !== undefined &&
      !(
        typeof color.brightness === 'number' &&
        Number.isInteger(color.brightness) &&
        color.brightness >= 1 &&
        color.brightness <= 100
      )) ||
    (rgb === undefined && color.white === undefined && color.brightness === undefined)
  ) {
    return refused(400, 'color must have rgb, white or brightness in range');
  }
  const light = find(id);
  if (light === undefined) {
    return refused(404, `Light [${id}] not found`, 'NOT_FOUND_LIGHT');
  }
  if (
    light.kind !== 'rgbw' ||
    (color.white !== undefined && light.white === undefined && light.rgb !== undefined)
  ) {
    return refused(400, `Light [${id}] cannot take this color`, 'UNSUPPORTED_CAPABILITY');
  }
  const failed = unreachable(light);
  if (failed) {
    return failed;
  }
  changed(
    light,
    {
      on: true,
      ...(Array.isArray(rgb) ? { rgb: rgb as unknown as [number, number, number] } : {}),
      ...(isByte(color.white) ? { white: color.white } : {}),
      ...(typeof color.brightness === 'number' ? { brightness: color.brightness } : {}),
    },
    source ?? 'dashboard',
  );
  return { status: 202, body: null };
}

/**
 * `POST /home/light/rooms/{room}?turn=`: every light of the room, one after the other; one that
 * fails is named in `failed`, the rest still switch - the room fails only when no light took it.
 */
export function turnRoom(room: string, turn: string | null, source: string | null): MockReply {
  if (turn !== 'on' && turn !== 'off') {
    return refused(400, 'turn must be on or off');
  }
  const here = lights.filter((light) => light.room === room);
  if (here.length === 0) {
    return refused(404, `No light in room [${room}]`, 'NOT_FOUND_LIGHT');
  }
  const switched: { id: number; name: string }[] = [];
  const failed: { id: number; name: string; code: string }[] = [];
  for (const light of here) {
    if (light.reachable === false) {
      failed.push({ id: light.id, name: light.name, code: 'DEVICE_FAILED' });
    } else {
      changed(light, { on: turn === 'on' }, source ?? 'dashboard');
      switched.push({ id: light.id, name: light.name });
    }
  }
  if (switched.length === 0) {
    return refused(502, 'Device failed', 'DEVICE_FAILED');
  }
  return { status: 202, body: { room, turn, switched, failed } };
}

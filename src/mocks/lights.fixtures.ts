import { Light, RoomLights } from '../app/data-access/light/light-api';
import type { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The lights of the mock house (`light-service`, HAS-292), which can be switched: a command
 * changes what the next read answers, in the memory of the page - a reload is the house as it
 * started. The ids are those of the lights of the mock device registry (`devices.fixtures.ts`):
 * the office relay (off), the living room dimmer (on, held by hand) and the bedroom strip, which
 * nothing has been heard of since the start. A command with `source=dashboard` holds the light
 * for the 30 minutes of the mock rules, as the engine of the service does. An Eaton light reports
 * a change a second after the command was taken, as it does through `amx-service` (HAS-293): a read
 * right after the command still answers the state before it.
 */
interface StoredLight {
  readonly id: number;
  readonly name: string;
  readonly room: string;
  readonly vendor: string;
  readonly kind: 'relay' | 'dimmer' | 'rgbw';
  on?: boolean;
  brightness?: number;
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
  { id: 13, name: 'Bedroom light strip', room: 'bedroom', vendor: 'shelly', kind: 'rgbw' },
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
    };
  });
}

const refused = (status: number, message: string, code?: string): MockReply => ({
  status,
  body: { errors: [code ? { message, code } : { message }] },
});

function find(id: string): StoredLight | undefined {
  return lights.find((light) => String(light.id) === id);
}

function changed(
  light: StoredLight,
  change: { on: boolean; brightness?: number },
  source: string,
): void {
  const report = () => {
    light.on = change.on;
    if (change.brightness !== undefined) {
      light.brightness = change.brightness;
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

/** `POST /home/light/{id}?turn=`: what `light-service` refuses, with its status and code. */
export function turnLight(id: string, turn: string | null, source: string | null): MockReply {
  if (turn !== 'on' && turn !== 'off') {
    return refused(400, 'turn must be on or off');
  }
  const light = find(id);
  if (light === undefined) {
    return refused(404, `Light [${id}] not found`, 'NOT_FOUND_LIGHT');
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
  changed(light, { on: true, brightness }, source ?? 'dashboard');
  return { status: 202, body: null };
}

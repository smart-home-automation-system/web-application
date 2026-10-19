import { Blind, RoomBlinds } from '../../data-access/blinds/blinds-api';
import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { Light, RoomLights } from '../../data-access/light/light-api';
import { isRecord } from '../../core/util/is-record';
import { doorsFirst } from '../../shared/device-names/device-names';
import { RoomView, WindowView, toWindowView } from '../../shared/room-heating/room-views';

/** A blind of the registry with what `blinds-service` says of it; `state` missing when it says nothing. */
export interface BlindRow {
  readonly device: RegisteredDevice;
  readonly state?: Blind;
  /** Its window by its own sensors, read as the heating reads the windows of a room. */
  readonly window?: WindowView;
}

/**
 * A light of the registry with what `light-service` says of it: `state` missing when it says
 * nothing. `unknownToService` when the service answered with its lights and this one is not among
 * them - it skips a light it cannot drive, and a command to it would be refused.
 */
export interface LightRow {
  readonly device: RegisteredDevice;
  readonly state?: Light;
  readonly unknownToService: boolean;
}

/**
 * One room of the room view (HAS-232): the devices the registry places in it, by the rows of the
 * owner - temperature first, then heating, lights, blinds, motion, presence, opening sensors, the
 * rest - each with what the services know of it. A device of no row of its own goes to `other`.
 */
export interface RoomOverview {
  /** The identifier of the room, printed as it is. */
  readonly room: string;
  /** The room as the heating knows it; `undefined` for a room the heating does not have. */
  readonly heating?: RoomView;
  readonly temperatureSensors: readonly RegisteredDevice[];
  readonly lights: readonly LightRow[];
  readonly blinds: readonly BlindRow[];
  readonly motion: readonly RegisteredDevice[];
  /** The presence sensors of the room - what they sense, not who is at home (owner, 2026-10-18). */
  readonly presenceSensors: readonly RegisteredDevice[];
  readonly openingSensors: readonly RegisteredDevice[];
  readonly other: readonly RegisteredDevice[];
}

/** The rows of a room, in the owner's order (2026-10-17). */
export const ROOM_ROWS = [
  'temperature',
  'heating',
  'lights',
  'blinds',
  'motion',
  'presence',
  'openingSensors',
  'other',
] as const;

export type RoomRow = (typeof ROOM_ROWS)[number];

const ROW_OF_KIND: Readonly<Record<string, RoomRow>> = {
  'temperature sensor': 'temperature',
  light: 'lights',
  blinds: 'blinds',
  'motion sensor': 'motion',
  'presence sensor': 'presence',
  'opening sensor': 'openingSensors',
};

/** The row a device of the registry stands in: a kind of no row of its own - and a kind this version does not know - is `other`. */
export function rowOf(device: RegisteredDevice): RoomRow {
  return ROW_OF_KIND[device.kind ?? ''] ?? 'other';
}

/**
 * Puts together what the five services say of one room. A device that is switched off in the
 * registry is left out - no service uses it. What a service does not answer stays unknown:
 * `blinds` without the blinds service is the registry's list with no state.
 */
export function toRoomOverview(
  room: string,
  devices: readonly RegisteredDevice[],
  heating: readonly RoomView[] | undefined,
  blinds: readonly RoomBlinds[] | null | undefined,
  lights?: readonly RoomLights[] | null,
): RoomOverview {
  const here = devices.filter((device) => device.room === room && device.enabled !== false);
  const of = (row: RoomRow) => here.filter((device) => rowOf(device) === row);
  const states = new Map<number, Blind>();
  // nothing checks an answer at runtime: an entry that is not a blind with an id is passed over
  for (const group of Array.isArray(blinds) ? (blinds as unknown[]) : []) {
    const list = isRecord(group) ? group['blinds'] : undefined;
    for (const blind of Array.isArray(list) ? (list as unknown[]) : []) {
      if (isRecord(blind) && typeof blind['id'] === 'number') {
        states.set(blind['id'], blind as Blind);
      }
    }
  }

  const lightStates = new Map<number, Light>();
  for (const group of Array.isArray(lights) ? (lights as unknown[]) : []) {
    const list = isRecord(group) ? group['lights'] : undefined;
    for (const light of Array.isArray(list) ? (list as unknown[]) : []) {
      if (isRecord(light) && typeof light['id'] === 'number') {
        lightStates.set(light['id'], light as Light);
      }
    }
  }
  const lightsAnswered = Array.isArray(lights);

  return {
    room,
    heating: heating?.find((candidate) => candidate.name === room),
    temperatureSensors: of('temperature'),
    lights: of('lights').map((device) => {
      const state = lightStates.get(device.id);
      return { device, state, unknownToService: lightsAnswered && state === undefined };
    }),
    blinds: [...of('blinds')].sort(doorsFirst).map((device) => {
      const state = states.get(device.id);
      return {
        device,
        state,
        window: state?.window === undefined ? undefined : toWindowView({ state: state.window }),
      };
    }),
    motion: of('motion'),
    presenceSensors: of('presence'),
    openingSensors: of('openingSensors'),
    other: of('other'),
  };
}

/** Whether a light is on as the service reports it - `unknown` when it says nothing, never off. */
export function lightState(row: LightRow): 'on' | 'off' | 'unknown' {
  const on = row.state?.on;
  return on === true ? 'on' : on === false ? 'off' : 'unknown';
}

/** The words of the state of a light. */
export function lightStateLabel(
  state: 'on' | 'off' | 'unknown',
): 'rooms.lights.stateOn' | 'rooms.lights.stateOff' | 'rooms.lights.stateUnknown' {
  return state === 'on'
    ? 'rooms.lights.stateOn'
    : state === 'off'
      ? 'rooms.lights.stateOff'
      : 'rooms.lights.stateUnknown';
}

/** Whether a light can be given a brightness: a dimmer or an rgbw light, by the service or else the registry. */
export function dims(row: LightRow): boolean {
  const kind = row.state?.kind ?? row.device.lightKind;
  return kind === 'dimmer' || kind === 'rgbw';
}

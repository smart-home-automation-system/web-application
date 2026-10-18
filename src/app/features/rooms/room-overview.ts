import { Blind, RoomBlinds } from '../../data-access/blinds/blinds-api';
import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { isRecord } from '../../core/util/is-record';
import { RoomView, WindowView, toWindowView } from '../../shared/room-heating/room-views';

/** A blind of the registry with what `blinds-service` says of it; `state` missing when it says nothing. */
export interface BlindRow {
  readonly device: RegisteredDevice;
  readonly state?: Blind;
  /** Its window by its own sensors, read as the heating reads the windows of a room. */
  readonly window?: WindowView;
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
  readonly lights: readonly RegisteredDevice[];
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
 * Puts together what the four services say of one room. A device that is switched off in the
 * registry is left out - no service uses it. What a service does not answer stays unknown:
 * `blinds` without the blinds service is the registry's list with no state.
 */
export function toRoomOverview(
  room: string,
  devices: readonly RegisteredDevice[],
  heating: readonly RoomView[] | undefined,
  blinds: readonly RoomBlinds[] | null | undefined,
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

  return {
    room,
    heating: heating?.find((candidate) => candidate.name === room),
    temperatureSensors: of('temperature'),
    lights: of('lights'),
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

/**
 * The blinds of a room as the owner reads them (2026-10-18): the door first, then the windows -
 * by name, so "window main" comes before "window second". The blinds page orders them the same.
 */
export function doorsFirst(
  left: { readonly name?: string },
  right: { readonly name?: string },
): number {
  const door = (device: { readonly name?: string }) =>
    /\bdoor\b/i.test(device.name ?? '') ? 0 : 1;
  return door(left) - door(right) || (left.name ?? '').localeCompare(right.name ?? '');
}

/**
 * The name of a device as the window of its room shows it (owner, 2026-10-18): without the room,
 * which the window names, and without the kind, which the section names - "Office door blinds" in
 * the office is "Door". A name that is nothing but those is shown whole.
 */
export function shortName(
  name: string | undefined,
  room: string,
  kind: string,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  const words = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s_]+/)
      .filter(Boolean);
  const roomWords = words(room);
  let rest = name.trim().split(/\s+/);
  if (roomWords.every((word, i) => rest[i]?.toLowerCase() === word)) {
    rest = rest.slice(roomWords.length);
  }
  const kindWords = new Set([...words(kind), kind === 'blinds' ? 'blind' : '']);
  rest = rest.filter((word, i) => !(i === rest.length - 1 && kindWords.has(word.toLowerCase())));
  const short = rest.join(' ');
  return short === '' ? name : short.charAt(0).toUpperCase() + short.slice(1);
}

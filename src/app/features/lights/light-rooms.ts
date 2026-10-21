import { isRecord } from '../../core/util/is-record';
import { Light, Occupancy, RoomRule } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { FLOORS, OTHER_FLOOR } from '../../shared/floors/floors';
import { LightState, stateOf } from '../../shared/lights/light-labels';

/** A light the page can address: one with an id. */
export type AddressedLight = Light & { readonly id: number };

/** A room of `GET /home/light`: its lights and its occupancy, as the service groups them. */
export interface LightRoom {
  readonly room: string;
  readonly lights: readonly AddressedLight[];
  readonly occupancy?: Occupancy;
}

/** A floor of the house with the rooms on it that have lights, in the order of the house. */
export interface LightFloor {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly LightRoom[];
}

/**
 * The rooms of an answer of `GET /home/light`, as the service orders them. Nothing checks an answer
 * at runtime: an entry that is not a room with a name is passed over, and so is a light without an
 * id - a control needs it. `undefined` when the answer is not a list (no answer yet, a `null`).
 */
export function lightRoomsOf(answer: unknown): readonly LightRoom[] | undefined {
  if (!Array.isArray(answer)) {
    return undefined;
  }
  return (answer as unknown[]).flatMap((entry): LightRoom[] => {
    if (!isRecord(entry) || typeof entry['room'] !== 'string') {
      return [];
    }
    const lights = Array.isArray(entry['lights']) ? (entry['lights'] as unknown[]) : [];
    const occupancy = isRecord(entry['occupancy']) ? (entry['occupancy'] as Occupancy) : undefined;
    return [
      {
        room: entry['room'],
        lights: lights.filter(
          (light): light is AddressedLight =>
            isRecord(light) && typeof light['id'] === 'number' && Number.isFinite(light['id']),
        ),
        ...(occupancy === undefined ? {} : { occupancy }),
      },
    ];
  });
}

/** The rooms by floor, in the order of `FLOORS`; a room it does not know goes last. */
export function floorsOf(rooms: readonly LightRoom[]): readonly LightFloor[] {
  const byRoom = new Map(rooms.map((room) => [room.room, room]));
  const roomsOf = (names: readonly string[]) =>
    names.flatMap((name) => {
      const room = byRoom.get(name);
      return room ? [room] : [];
    });
  const placed = new Set(FLOORS.flatMap((floor) => floor.rooms));
  return [
    ...FLOORS.map(({ id, label, rooms: names }) => ({ id, label, rooms: roomsOf(names) })),
    { ...OTHER_FLOOR, rooms: rooms.filter((room) => !placed.has(room.room)) },
  ].filter((floor) => floor.rooms.length > 0);
}

/** The rules of an answer of `GET /home/light/rules`, by room; `undefined` when it is not a list. */
export function rulesByRoom(answer: unknown): ReadonlyMap<string, RoomRule> | undefined {
  if (!Array.isArray(answer)) {
    return undefined;
  }
  return new Map(
    (answer as unknown[]).flatMap((rule): [string, RoomRule][] =>
      isRecord(rule) && typeof rule['room'] === 'string' ? [[rule['room'], rule as RoomRule]] : [],
    ),
  );
}

/** How many lights of the house are on, off and not known - never counted off for want of a word. */
export function countStates(rooms: readonly LightRoom[]): Readonly<Record<LightState, number>> {
  const counts: Record<LightState, number> = { on: 0, off: 0, unknown: 0 };
  for (const room of rooms) {
    for (const light of room.lights) {
      counts[stateOf(light)]++;
    }
  }
  return counts;
}

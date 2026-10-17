import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { DEVICE_KINDS, ROOM_NAMES } from '../../data-access/household/registry-values';
import { MessageKey } from '../../i18n/messages';
import { FLOORS } from '../heating/floors';

/** The devices of one room, in the order of the page. */
export interface RoomDevices {
  /** The identifier of the room as the registry has it; empty for a device without one. */
  readonly room: string;
  readonly devices: readonly RegisteredDevice[];
}

/** A part of the house with the rooms that have a device, as a section of the page. */
export interface FloorDevices {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly RoomDevices[];
}

/** How many devices of one kind a room has. */
export interface KindCount {
  /** The kind as the registry has it - one this version does not know is counted under its own name. */
  readonly kind: string;
  readonly count: number;
}

/**
 * The rooms by floor - **every room of the house, a room without a device included**: the card of
 * a room is where a device is added to it (HAS-290). The floors and the order of their rooms are
 * those of the heating page (`FLOORS`); a room that list does not know - the kitchen, the halls,
 * one the registry holds and this version does not - goes into a last group, in the order of the
 * rooms of the registry. A floor without a room is left out.
 *
 * Within a room the devices stand by kind, in the order the kinds are offered, then by name; a
 * kind this version does not know comes last.
 */
export function groupByFloor(
  devices: readonly RegisteredDevice[],
  rooms: readonly string[] = ROOM_NAMES,
): FloorDevices[] {
  const byRoom = new Map<string, RegisteredDevice[]>(rooms.map((room) => [room, []]));
  for (const device of devices) {
    const room = device.room ?? '';
    byRoom.set(room, [...(byRoom.get(room) ?? []), device]);
  }
  const roomOf = (room: string): RoomDevices[] => {
    const here = byRoom.get(room);
    return here === undefined ? [] : [{ room, devices: [...here].sort(byKindThenName) }];
  };

  const placed = new Set(FLOORS.flatMap((floor) => floor.rooms));
  const elsewhere = [...byRoom.keys()].filter((room) => !placed.has(room)).sort(byRoomOrder);

  return [
    ...FLOORS.map(({ id, label, rooms: names }): FloorDevices => ({
      id,
      label,
      rooms: names.flatMap(roomOf),
    })),
    { id: 'other', label: 'heating.rooms.floor.other' as const, rooms: elsewhere.flatMap(roomOf) },
  ].filter((floor) => floor.rooms.length > 0);
}

/**
 * The devices of a room counted by kind: every kind the registry offers, none included - the card
 * of a room says what it has and what it has not - then each kind this version does not know.
 */
export function countByKind(devices: readonly RegisteredDevice[]): readonly KindCount[] {
  const count = (kind: string) => devices.filter((device) => device.kind === kind).length;
  const unknown = [...new Set(devices.map((device) => device.kind ?? ''))]
    .filter((kind) => !(DEVICE_KINDS as readonly string[]).includes(kind))
    .sort((left, right) => left.localeCompare(right, 'en'));
  return [
    ...DEVICE_KINDS.map((kind) => ({ kind, count: count(kind) })),
    ...unknown.map((kind) => ({
      kind,
      count: devices.filter((device) => (device.kind ?? '') === kind).length,
    })),
  ];
}

function byKindThenName(left: RegisteredDevice, right: RegisteredDevice): number {
  return (
    kindOrder(left.kind) - kindOrder(right.kind) ||
    (left.name ?? '').localeCompare(right.name ?? '', 'en', { numeric: true })
  );
}

function kindOrder(kind: string | undefined): number {
  const index = (DEVICE_KINDS as readonly string[]).indexOf(kind ?? '');
  return index < 0 ? DEVICE_KINDS.length : index;
}

/** The order of the rooms of the registry; a room it does not list comes after them, by name. */
function byRoomOrder(left: string, right: string): number {
  const order = (room: string) => {
    const index = ROOM_NAMES.indexOf(room);
    return index < 0 ? ROOM_NAMES.length : index;
  };
  return order(left) - order(right) || left.localeCompare(right, 'en');
}

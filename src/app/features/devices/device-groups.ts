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

/**
 * The devices by floor and room. The floors and the order of their rooms are those of the
 * heating page (`FLOORS`); a room that list does not know - the kitchen, the halls, one added
 * to the house since - is not dropped: it goes into a last group, in the order of the rooms of
 * the registry. A floor and a room without a device are left out.
 *
 * Within a room the devices stand by kind, in the order the kinds are offered, then by name; a
 * kind this version does not know comes last.
 */
export function groupByFloor(devices: readonly RegisteredDevice[]): FloorDevices[] {
  const byRoom = new Map<string, RegisteredDevice[]>();
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
    ...FLOORS.map(({ id, label, rooms }): FloorDevices => ({ id, label, rooms: rooms.flatMap(roomOf) })),
    { id: 'other', label: 'heating.rooms.floor.other' as const, rooms: elsewhere.flatMap(roomOf) },
  ].filter((floor) => floor.rooms.length > 0);
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

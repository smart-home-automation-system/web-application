import { MessageKey } from '../../i18n/messages';
import { RoomView } from '../../shared/room-heating/room-views';

/** A part of the house with its rooms, as a section of the page. */
export interface FloorView {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly RoomView[];
}

/**
 * Which room lies where. The service knows rooms, not floors: this list is the one place that
 * does, by the identifiers of `RoomName` in `smart-home-sdk`. The order is the order on the
 * page, within a floor too.
 */
export const FLOORS: readonly { id: string; label: MessageKey; rooms: readonly string[] }[] = [
  {
    id: 'ground',
    label: 'heating.rooms.floor.ground',
    rooms: ['living room', 'cinema', 'bathroom down', 'entrance', 'garage'],
  },
  {
    id: 'upper',
    label: 'heating.rooms.floor.upper',
    rooms: ['office', 'tobi', 'livia', 'bedroom', 'wardrobe', 'bathroom up'],
  },
  { id: 'attic', label: 'heating.rooms.floor.attic', rooms: ['loft'] },
  { id: 'outside', label: 'heating.rooms.floor.outside', rooms: ['sanctum', 'sauna', 'garden'] },
];

/**
 * The rooms by floor, in the order of `FLOORS`; a floor without a room in the answer is left
 * out. A room the list does not know - one added to the house since - is not dropped: it goes
 * into a last group of its own, in the order of the service.
 */
export function groupByFloor(rooms: readonly RoomView[]): FloorView[] {
  const placed = new Set<RoomView>();
  const floors = FLOORS.map(({ id, label, rooms: names }): FloorView => {
    const here = names.flatMap((name) => rooms.filter((room) => room.name === name));
    here.forEach((room) => placed.add(room));
    return { id, label, rooms: here };
  });
  const elsewhere = rooms.filter((room) => !placed.has(room));
  return [
    ...floors,
    { id: 'other', label: 'heating.rooms.floor.other' as const, rooms: elsewhere },
  ].filter((floor) => floor.rooms.length > 0);
}

import { MessageKey } from '../../i18n/messages';
import { FLOORS, OTHER_FLOOR } from '../../shared/floors/floors';
import { RoomView } from '../../shared/room-heating/room-views';

/** A part of the house with its rooms, as a section of the page. */
export interface FloorView {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly RoomView[];
}

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
  return [...floors, { ...OTHER_FLOOR, rooms: elsewhere }].filter(
    (floor) => floor.rooms.length > 0,
  );
}

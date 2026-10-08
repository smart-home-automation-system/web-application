import { toRoomViews } from '../../shared/room-heating/room-views';
import { groupByFloor } from './floors';

describe('groupByFloor', () => {
  const rooms = (...names: string[]) => toRoomViews(names.map((name) => ({ name, heaters: [] })));
  const grouped = (...names: string[]) =>
    groupByFloor(rooms(...names)).map((floor) => [floor.id, floor.rooms.map((room) => room.name)]);

  it('puts the rooms on their floors, in the order of the page and not of the service', () => {
    expect(grouped('garden', 'office', 'loft', 'bathroom up', 'living room', 'cinema')).toEqual([
      ['ground', ['living room', 'cinema']],
      ['upper', ['office', 'bathroom up']],
      ['attic', ['loft']],
      ['outside', ['garden']],
    ]);
  });

  // the fifteen rooms heating-service answers with: none of them is left for "Other"
  it('has a floor for every room of the house', () => {
    const house = [
      'office',
      'tobi',
      'livia',
      'bedroom',
      'wardrobe',
      'bathroom up',
      'loft',
      'living room',
      'cinema',
      'bathroom down',
      'entrance',
      'garage',
      'sanctum',
      'sauna',
      'garden',
    ];

    const floors = grouped(...house);

    expect(floors.map(([id]) => id)).toEqual(['ground', 'upper', 'attic', 'outside']);
    expect(floors.at(-1)).toEqual(['outside', ['sanctum', 'sauna', 'garden']]);
  });

  it('leaves out a floor without a room in the answer', () => {
    expect(grouped('loft')).toEqual([['attic', ['loft']]]);
  });

  // a room added to the house since must not vanish from the page
  it('keeps a room it does not know, in a last group of its own', () => {
    expect(grouped('winter garden', 'loft', 'cellar')).toEqual([
      ['attic', ['loft']],
      ['other', ['winter garden', 'cellar']],
    ]);
  });

  it('keeps a room that is listed twice twice', () => {
    expect(grouped('loft', 'loft')).toEqual([['attic', ['loft', 'loft']]]);
  });

  it('is empty for no rooms', () => {
    expect(groupByFloor([])).toEqual([]);
  });
});

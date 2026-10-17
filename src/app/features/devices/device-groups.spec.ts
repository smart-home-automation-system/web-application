import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { countByKind, groupByFloor } from './device-groups';

let nextId = 1;
const device = (name: string, room: string | undefined, kind: string): RegisteredDevice => ({
  id: nextId++,
  name,
  ...(room === undefined ? {} : { room }),
  kind,
});

describe('the devices by floor and room', () => {
  it('follow the floors of the house and the order of their rooms', () => {
    const floors = groupByFloor(
      [
        device('Loft sensor', 'loft', 'presence sensor'),
        device('Office light', 'office', 'light'),
        device('Garden gateway', 'garden', 'bthome gateway'),
        device('Cinema blinds', 'cinema', 'blinds'),
        device('Living room light', 'living room', 'light'),
      ],
      [],
    );

    expect(floors.map((floor) => [floor.id, floor.rooms.map((one) => one.room)])).toEqual([
      ['ground', ['living room', 'cinema']],
      ['upper', ['office']],
      ['attic', ['loft']],
      ['outside', ['garden']],
    ]);
    expect(floors.map((floor) => floor.label)).toEqual([
      'heating.rooms.floor.ground',
      'heating.rooms.floor.upper',
      'heating.rooms.floor.attic',
      'heating.rooms.floor.outside',
    ]);
  });

  // HAS-290: the card of a room is where a device is added to it - an empty room has one too
  it('have every room of the house, a room without a device included', () => {
    const floors = groupByFloor(
      [device('Office light', 'office', 'light')],
      ['office', 'loft', 'kitchen'],
    );

    expect(
      floors.map((floor) => [floor.id, floor.rooms.map((one) => [one.room, one.devices.length])]),
    ).toEqual([
      ['upper', [['office', 1]]],
      ['attic', [['loft', 0]]],
      ['other', [['kitchen', 0]]],
    ]);
  });

  // the kitchen and the halls have no heating, so the list of floors does not know them
  it('keep a room the floors do not list, in a last group, in the order of the registry', () => {
    const floors = groupByFloor(
      [
        device('Winter garden light', 'winter garden', 'light'),
        device('Hall sensor', 'hall down', 'motion sensor'),
        device('Kitchen sensor', 'kitchen', 'opening sensor'),
        device('Office light', 'office', 'light'),
        device('Nowhere', undefined, 'light'),
      ],
      [],
    );

    expect(floors.map((floor) => floor.id)).toEqual(['upper', 'other']);
    // the rooms of the registry in its order, then what it does not list, by name
    expect(floors[1].rooms.map((one) => one.room)).toEqual([
      'kitchen',
      'hall down',
      '',
      'winter garden',
    ]);
    expect(floors[1].label).toBe('heating.rooms.floor.other');
  });

  it('put the devices of a room in the order of the kinds, then by name', () => {
    const [floor] = groupByFloor(
      [
        device('Sensor 48', 'office', 'temperature sensor'),
        device('Window blinds', 'office', 'blinds'),
        device('Light 10', 'office', 'light'),
        device('Something new', 'office', 'wind sensor'),
        device('Light 9', 'office', 'light'),
        device('Door blinds', 'office', 'blinds'),
      ],
      [],
    );

    expect(floor.rooms[0].devices.map((one) => one.name)).toEqual([
      'Door blinds',
      'Window blinds',
      // numbers in a name count as numbers
      'Light 9',
      'Light 10',
      'Sensor 48',
      // a kind this version does not know comes last
      'Something new',
    ]);
  });

  it('have nothing for an empty registry of a house without rooms', () => {
    expect(groupByFloor([], [])).toEqual([]);
  });
});

describe('the devices of a room by kind', () => {
  it('count every kind the registry offers, none included, then a kind this version does not know', () => {
    const counts = countByKind([
      device('Door blinds', 'office', 'blinds'),
      device('Window blinds', 'office', 'blinds'),
      device('Light', 'office', 'light'),
      device('Something new', 'office', 'wind sensor'),
    ]);

    expect(counts.slice(0, 3)).toEqual([
      { kind: 'blinds', count: 2 },
      { kind: 'light', count: 1 },
      { kind: 'opening sensor', count: 0 },
    ]);
    expect(counts.at(-1)).toEqual({ kind: 'wind sensor', count: 1 });
    expect(counts.filter((one) => one.count === 0).length).toBe(counts.length - 3);
  });
});

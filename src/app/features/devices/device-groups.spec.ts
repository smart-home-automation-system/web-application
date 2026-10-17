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
      ['office', 'loft', 'kitchen', 'hall up'],
    );

    expect(
      floors.map((floor) => [floor.id, floor.rooms.map((one) => [one.room, one.devices.length])]),
    ).toEqual([
      ['ground', [['kitchen', 0]]],
      ['upper', [['office', 1]]],
      // the halls and the stairs are a group of their own (owner, 2026-10-17)
      ['circulation', [['hall up', 0]]],
      ['attic', [['loft', 0]]],
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

    expect(floors.map((floor) => floor.id)).toEqual(['ground', 'upper', 'circulation', 'other']);
    expect(floors[0].rooms.map((one) => one.room)).toEqual(['kitchen']);
    expect(floors[2].rooms.map((one) => one.room)).toEqual(['hall down']);
    // what the floors do not list, by name
    expect(floors[3].rooms.map((one) => one.room)).toEqual(['', 'winter garden']);
    expect(floors[3].label).toBe('heating.rooms.floor.other');
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
  it('count the kinds a card lists, none included, and every other kind as one row', () => {
    const counts = countByKind([
      device('Door blinds', 'office', 'blinds'),
      device('Window blinds', 'office', 'blinds'),
      device('Light', 'office', 'light'),
      device('Weather station', 'garden', 'weather station'),
      device('Gateway', 'garden', 'bthome gateway'),
      device('Something new', 'office', 'wind sensor'),
    ]);

    expect(counts.map((one) => one.kind)).toEqual([
      'blinds',
      'light',
      'opening sensor',
      'motion sensor',
      'presence sensor',
      'temperature sensor',
      'push button',
      'other',
    ]);
    expect(counts[0]).toEqual({ kind: 'blinds', count: 2 });
    expect(counts[2]).toEqual({ kind: 'opening sensor', count: 0 });
    // the weather station, a gateway and a kind this version does not know
    expect(counts.at(-1)).toEqual({ kind: 'other', count: 3 });
  });
});

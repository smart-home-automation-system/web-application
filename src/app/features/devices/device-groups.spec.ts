import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { groupByFloor } from './device-groups';

let nextId = 1;
const device = (name: string, room: string | undefined, kind: string): RegisteredDevice => ({
  id: nextId++,
  name,
  ...(room === undefined ? {} : { room }),
  kind,
});

describe('the devices by floor and room', () => {
  it('follow the floors of the house and the order of their rooms', () => {
    const floors = groupByFloor([
      device('Loft sensor', 'loft', 'presence sensor'),
      device('Office light', 'office', 'light'),
      device('Garden gateway', 'garden', 'bthome gateway'),
      device('Cinema blinds', 'cinema', 'blinds'),
      device('Living room light', 'living room', 'light'),
    ]);

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

  // the kitchen and the halls have no heating, so the list of floors does not know them
  it('keep a room the floors do not list, in a last group, in the order of the registry', () => {
    const floors = groupByFloor([
      device('Winter garden light', 'winter garden', 'light'),
      device('Hall sensor', 'hall down', 'motion sensor'),
      device('Kitchen sensor', 'kitchen', 'opening sensor'),
      device('Office light', 'office', 'light'),
      device('Nowhere', undefined, 'light'),
    ]);

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
    const [floor] = groupByFloor([
      device('Sensor 48', 'office', 'temperature sensor'),
      device('Window blinds', 'office', 'blinds'),
      device('Light 10', 'office', 'light'),
      device('Something new', 'office', 'wind sensor'),
      device('Light 9', 'office', 'light'),
      device('Door blinds', 'office', 'blinds'),
    ]);

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

  it('have nothing for an empty registry', () => {
    expect(groupByFloor([])).toEqual([]);
  });
});

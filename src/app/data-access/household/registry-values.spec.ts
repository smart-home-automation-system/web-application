import {
  DEVICE_KINDS,
  INVERTER_BRANDS,
  OFFERED_KINDS,
  ROOM_NAMES,
  VENDORS,
} from './registry-values';

describe('ROOM_NAMES', () => {
  // HAS-289: the corridor upstairs was the one room written hall_up; RoomName of
  // smart-home-sdk 1.10.0 writes it with a space, like every other room of two words.
  it('writes every room of two words with a space', () => {
    expect(ROOM_NAMES).toContain('hall up');
    expect(ROOM_NAMES.filter((room) => room.includes('_'))).toEqual([]);
  });

  it('offers each room once', () => {
    expect(new Set(ROOM_NAMES).size).toBe(ROOM_NAMES.length);
  });
});

// The values of smart-home-sdk 1.18.0 written out (DeviceKind, InverterBrand - HAS-326, SmartVendor - HAS-377): a value added
// to the SDK is added here and to the copy together, so that it is offered
describe('the copies of the SDK', () => {
  it('know every kind of DeviceKind', () => {
    expect(DEVICE_KINDS).toEqual([
      'blinds',
      'light',
      'opening sensor',
      'motion sensor',
      'presence sensor',
      'temperature sensor',
      'weather station',
      'bthome gateway',
      'push button',
      'appliance',
      'inverter',
      'water valve',
      'air conditioner',
      'air quality sensor',
    ]);
  });

  // HAS-392: gree, the vendor of the air conditioners (smart-home-sdk 1.18.0); HAS-426: blebox, the vendor of
  // the air quality sensor (smart-home-sdk 1.20.0)
  it('know every vendor of SmartVendor', () => {
    expect(VENDORS).toEqual(['shelly', 'eaton', 'gree', 'blebox', 'other']);
  });

  it('know every brand of InverterBrand', () => {
    expect(INVERTER_BRANDS).toEqual(['solax', 'sofar']);
  });
});

describe('OFFERED_KINDS', () => {
  // HAS-282: the form has no fields for the eight settings an appliance needs - the registry would
  // refuse one without them; a device that is one keeps its kind on offer when edited (withHeld)
  it('offers every kind of the registry but the appliance', () => {
    expect(DEVICE_KINDS).toContain('appliance');
    expect(OFFERED_KINDS).toEqual(DEVICE_KINDS.filter((kind) => kind !== 'appliance'));
  });
});

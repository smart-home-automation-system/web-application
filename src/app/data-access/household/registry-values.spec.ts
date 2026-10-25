import { DEVICE_KINDS, OFFERED_KINDS, ROOM_NAMES } from './registry-values';

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

describe('OFFERED_KINDS', () => {
  // HAS-282: the form has no fields for the eight settings an appliance needs - the registry would
  // refuse one without them; a device that is one keeps its kind on offer when edited (withHeld)
  it('offers every kind of the registry but the appliance', () => {
    expect(DEVICE_KINDS).toContain('appliance');
    expect(OFFERED_KINDS).toEqual(DEVICE_KINDS.filter((kind) => kind !== 'appliance'));
  });
});

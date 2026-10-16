import { ROOM_NAMES } from './registry-values';

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

import { ROOM_CAPABILITIES } from './capabilities';

// the order of the cards of My room is the owner's: the controls first - the lights, the blinds and the air
// conditioning (after the blinds since HAS-439, owner 2026-11-15) - then the heating and the sensors
describe('ROOM_CAPABILITIES', () => {
  it('lists the cards in the order of the owner', () => {
    expect(ROOM_CAPABILITIES.map((capability) => capability.id)).toEqual([
      'lights',
      'blinds',
      'aircon',
      'heating',
      'sensors',
    ]);
  });
});

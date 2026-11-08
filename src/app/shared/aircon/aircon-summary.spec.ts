import { summariseAircon } from './aircon-summary';

describe('the air conditioners counted for the overview', () => {
  it('is nothing while the answer is no list', () => {
    expect(summariseAircon(undefined)).toBeUndefined();
    expect(summariseAircon(null)).toBeUndefined();
  });

  it('counts on, off, not known and not answering, and names the units that are on', () => {
    expect(
      summariseAircon([
        {
          id: 140,
          room: 'office',
          power: true,
          mode: 'cool',
          targetTemperature: 23,
          reachable: true,
        },
        { id: 143, room: 'bedroom', power: false, reachable: true },
        { id: 141, room: 'loft', power: false, reachable: false },
        { id: 142, room: 'tobi' },
        { name: 'without an id' },
      ]),
    ).toEqual({
      total: 4,
      on: 1,
      off: 2,
      unknown: 1,
      unreachable: 1,
      running: [{ id: 140, room: 'office', mode: 'cool', targetTemperature: 23 }],
    });
  });
});

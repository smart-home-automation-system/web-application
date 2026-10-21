import { countStates, floorsOf, lightRoomsOf, rulesByRoom } from './light-rooms';
import { periodText, ruleSummary } from './rule-summary';

// HAS-266: how the answers of light-service are read for the lights page
describe('light rooms', () => {
  it('reads the rooms of an answer, passing over what a control cannot address', () => {
    expect(lightRoomsOf(null)).toBeUndefined();
    expect(lightRoomsOf({})).toBeUndefined();
    expect(
      lightRoomsOf([
        {
          room: 'office',
          lights: [{ id: 3 }, { name: 'no id' }, null],
          occupancy: { occupied: true },
        },
        { lights: [{ id: 4 }] },
        'nonsense',
        { room: 'kitchen' },
      ]),
    ).toEqual([
      { room: 'office', lights: [{ id: 3 }], occupancy: { occupied: true } },
      { room: 'kitchen', lights: [] },
    ]);
  });

  it('puts the rooms on their floors in the order of the house, a room it does not know last', () => {
    const floors = floorsOf([
      { room: 'office', lights: [] },
      { room: 'winter garden', lights: [] },
      { room: 'kitchen', lights: [] },
      { room: 'living room', lights: [] },
    ]);

    expect(floors.map((floor) => [floor.id, floor.rooms.map((room) => room.room)])).toEqual([
      ['ground', ['living room', 'kitchen']],
      ['upper', ['office']],
      ['other', ['winter garden']],
    ]);
  });

  it('reads the rules by room and counts the lights by state', () => {
    expect(rulesByRoom(null)).toBeUndefined();
    expect([...rulesByRoom([{ room: 'office' }, { autoOffEnabled: true }])!.keys()]).toEqual([
      'office',
    ]);
    expect(
      countStates([
        { room: 'office', lights: [{ id: 1, on: true }, { id: 2, on: false }, { id: 3 }] },
        { room: 'kitchen', lights: [{ id: 4, on: true }] },
      ]),
    ).toEqual({ on: 2, off: 1, unknown: 1 });
  });

  it('sums a rule in a few words, saying nothing of what the service did not answer', () => {
    expect(
      ruleSummary({
        autoOffEnabled: true,
        autoOffDelayMinutes: 15,
        motionOnEnabled: true,
        onlyBelowLux: 0,
        manualHoldMinutes: 60,
      }),
    ).toEqual([
      { key: 'lights.rule.autoOffAfter', params: { minutes: 15 } },
      // 0 lx is a threshold, not a missing one
      { key: 'lights.rule.motionOnBelow', params: { lux: 0 } },
      { key: 'lights.rule.hold', params: { minutes: 60 } },
    ]);
    expect(ruleSummary({ autoOffEnabled: false, motionOnEnabled: false })).toEqual([
      { key: 'lights.rule.nothing' },
    ]);
    expect(ruleSummary({})).toEqual([]);
  });

  it('tells a period by its times as the service wrote them and what it lights', () => {
    expect(
      periodText({ from: '22:00', to: '06:00', brightness: 10, rgb: [255, 0, 0], white: 0 }),
    ).toEqual([
      { literal: '22:00 – 06:00' },
      { key: 'lights.rule.periodBrightness', params: { value: 10 } },
      { key: 'lights.rule.periodColor' },
      { key: 'lights.rule.periodWhite', params: { value: 0 } },
    ]);
    expect(periodText({})).toEqual([{ literal: '? – ?' }]);
  });
});

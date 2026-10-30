import { HeaterView, RoomView } from './room-views';
import {
  ROOM_STATE_LABELS,
  currentWindow,
  roomState,
  scheduleLed,
  targetDistance,
  windowTimes,
} from './room-state';

function heater(working: boolean | undefined, periods: HeaterView['periods'] = []): HeaterView {
  return { kind: 'radiator', working, callsForHeat: undefined, periods, unreadablePeriods: 0 };
}

function room(overrides: Partial<RoomView> = {}): RoomView {
  return { name: 'office', temperature: 19, target: 20.5, heaters: [heater(false)], ...overrides };
}

describe('roomState', () => {
  it('tells every state of a room', () => {
    expect(roomState(room({ heaters: [heater(true)] }), true)).toBe('heating');
    expect(roomState(room(), true)).toBe('waiting');
    expect(roomState(room({ temperature: 20.5 }), true)).toBe('reached');
    expect(roomState(room({ temperature: 21 }), true)).toBe('reached');
    expect(roomState(room({ target: undefined }), true)).toBe('outside');
    expect(roomState(room({ heaters: [] }), true)).toBe('noHeater');
  });

  // the precedence of the task: the switch of the house over everything, the hold over heating
  it('puts the switch of the house first and the hold over a working heater', () => {
    const held = room({ heaters: [heater(true)], window: { state: 'open', hold: true } });

    expect(roomState(held, false)).toBe('systemOff');
    expect(roomState(held, true)).toBe('held');
    expect(roomState(room({ temperature: undefined }), false)).toBe('systemOff');
  });

  // missing is never off
  it('is not known without a temperature, a list of heaters or the status of a heater', () => {
    expect(roomState(room({ temperature: undefined }), true)).toBe('unknown');
    expect(roomState(room({ heaters: undefined }), true)).toBe('unknown');
    expect(roomState(room({ heaters: [heater(false), heater(undefined)] }), true)).toBe('unknown');
  });

  it('decides by the rooms while the switch of the house is not known', () => {
    expect(roomState(room({ heaters: [heater(true)] }), undefined)).toBe('heating');
  });

  it('has a word for every state', () => {
    expect(Object.keys(ROOM_STATE_LABELS).sort()).toEqual(
      ['heating', 'held', 'noHeater', 'outside', 'reached', 'systemOff', 'unknown', 'waiting'],
    );
  });
});

describe('scheduleLed', () => {
  it('is on while a schedule covers the room, off while none does, not known without heaters', () => {
    expect(scheduleLed(room())).toBe('on');
    expect(scheduleLed(room({ target: undefined }))).toBe('off');
    expect(scheduleLed(room({ heaters: undefined }))).toBe('unknown');
  });
});

describe('currentWindow', () => {
  const MONDAY = 0;
  const morning = { days: [MONDAY], start: 7 * 60, end: 23 * 60, temperature: 20.5 };
  const evening = { days: [MONDAY], start: 18 * 60, end: 22 * 60, temperature: 22 };

  it('is the period on now of the highest temperature, ends excluded', () => {
    const withTwo = room({ heaters: [heater(false, [morning]), heater(false, [evening])] });

    expect(currentWindow(withTwo, { day: MONDAY, minute: 12 * 60 })).toBe(morning);
    expect(currentWindow(withTwo, { day: MONDAY, minute: 19 * 60 })).toBe(evening);
    expect(currentWindow(withTwo, { day: MONDAY, minute: 7 * 60 })).toBeUndefined();
    expect(currentWindow(withTwo, { day: 1, minute: 12 * 60 })).toBeUndefined();
    expect(windowTimes(morning)).toBe('07:00–23:00');
  });
});

describe('targetDistance', () => {
  it('colours the temperature by its distance to the target', () => {
    expect(targetDistance(room({ temperature: 19 }))).toBe('below');
    expect(targetDistance(room({ temperature: 20.2 }))).toBe('near');
    expect(targetDistance(room({ temperature: 21.5 }))).toBe('above');
    expect(targetDistance(room({ target: undefined }))).toBeUndefined();
  });
});

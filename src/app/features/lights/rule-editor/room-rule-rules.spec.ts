import { RoomRuleBody } from '../../../data-access/light/light-api';
import {
  MAX_BRIGHTNESS,
  MAX_CHANNEL,
  MAX_DELAY_MINUTES,
  MAX_LUX,
  MAX_PERIODS,
  MIN_BRIGHTNESS,
  MIN_DELAY_MINUTES,
  MIN_LUX,
  RoomDevices,
  brightnessProblem,
  eatonOnly,
  luxProblem,
  minutesProblem,
  overlap,
  overlapping,
  roomProblem,
  ruleProblem,
  timeProblem,
  whiteProblem,
} from './room-rule-rules';

const RULE: RoomRuleBody = {
  autoOffEnabled: true,
  autoOffDelayMinutes: 10,
  motionOnEnabled: true,
  onlyBelowLux: 30,
  motionOffAfterMinutes: 3,
  periods: [
    { from: '16:00', to: '22:00', brightness: 80 },
    { from: '22:00', to: '06:00', brightness: 10, rgb: [255, 120, 0] },
  ],
  manualHoldMinutes: 30,
};

/** The rule with one field left out, as a body the service would receive it. */
function without(field: keyof RoomRuleBody): RoomRuleBody {
  const rule: Partial<RoomRuleBody> = { ...RULE };
  delete rule[field];
  return rule as RoomRuleBody;
}

const ROOM: RoomDevices = {
  lights: [{ lightKind: 'relay' }, { lightKind: 'dimmer' }, { lightKind: 'rgbw' }],
  sensors: [
    { kind: 'presence sensor', eaton: false },
    { kind: 'motion sensor', eaton: false },
  ],
};

// HAS-267: a copy of RoomRuleRules of light-service 0.9.x - a rule changed there is changed here
describe('the rules of the rule of a room', () => {
  it('has the numbers of the service', () => {
    expect([MIN_DELAY_MINUTES, MAX_DELAY_MINUTES]).toEqual([1, 180]);
    expect([MIN_LUX, MAX_LUX]).toEqual([1, 100_000]);
    expect(MAX_PERIODS).toBe(12);
    expect([MIN_BRIGHTNESS, MAX_BRIGHTNESS]).toEqual([1, 100]);
    expect(MAX_CHANNEL).toBe(255);
  });

  it('takes the minutes of a delay or of the hold from 1 to 180, whole', () => {
    expect(minutesProblem('1', true)).toBeUndefined();
    expect(minutesProblem(' 180 ', true)).toBeUndefined();
    expect(minutesProblem('0', true)).toBe('lights.editor.problem.minutesRange');
    expect(minutesProblem('181', true)).toBe('lights.editor.problem.minutesRange');
    expect(minutesProblem('2.5', true)).toBe('lights.editor.problem.wholeNumber');
    expect(minutesProblem('-3', true)).toBe('lights.editor.problem.wholeNumber');
    expect(minutesProblem('', true)).toBe('lights.editor.problem.minutesMissing');
    // the delay of a rule that is off may be left out - never one outside the range
    expect(minutesProblem('', false)).toBeUndefined();
    expect(minutesProblem('200', false)).toBe('lights.editor.problem.minutesRange');
  });

  it('takes no lux or one from 1 to 100 000', () => {
    expect(luxProblem('')).toBeUndefined();
    expect(luxProblem('1')).toBeUndefined();
    expect(luxProblem('100000')).toBeUndefined();
    expect(luxProblem('0')).toBe('lights.editor.problem.luxRange');
    expect(luxProblem('100001')).toBe('lights.editor.problem.luxRange');
    expect(luxProblem('30,5')).toBe('lights.editor.problem.wholeNumber');
  });

  it('takes the times of a period as HH:mm, both needed', () => {
    expect(timeProblem('06:00')).toBeUndefined();
    expect(timeProblem('23:59')).toBeUndefined();
    expect(timeProblem('')).toBe('lights.editor.problem.timeMissing');
    expect(timeProblem('24:00')).toBe('lights.editor.problem.timeInvalid');
    expect(timeProblem('6:00')).toBe('lights.editor.problem.timeInvalid');
  });

  it('takes no brightness or one from 1 to 100, no white or one from 0 to 255', () => {
    expect(brightnessProblem('')).toBeUndefined();
    expect(brightnessProblem('1')).toBeUndefined();
    expect(brightnessProblem('100')).toBeUndefined();
    expect(brightnessProblem('0')).toBe('lights.editor.problem.brightnessRange');
    expect(brightnessProblem('101')).toBe('lights.editor.problem.brightnessRange');
    expect(whiteProblem('')).toBeUndefined();
    expect(whiteProblem('0')).toBeUndefined();
    expect(whiteProblem('255')).toBeUndefined();
    expect(whiteProblem('256')).toBe('lights.editor.problem.whiteRange');
  });

  describe('the overlap of two periods', () => {
    it('lets one end where the next starts', () => {
      expect(overlap({ from: '16:00', to: '22:00' }, { from: '22:00', to: '06:00' })).toBe(false);
      expect(overlap({ from: '06:00', to: '16:00' }, { from: '22:00', to: '06:00' })).toBe(false);
    });

    it('finds one across midnight', () => {
      expect(overlap({ from: '22:00', to: '06:00' }, { from: '05:00', to: '07:00' })).toBe(true);
      expect(overlap({ from: '22:00', to: '06:00' }, { from: '23:00', to: '23:30' })).toBe(true);
    });

    it('takes the same from and to for the whole day', () => {
      expect(overlap({ from: '08:00', to: '08:00' }, { from: '12:00', to: '13:00' })).toBe(true);
    });

    it('says nothing of a period whose time is not valid yet', () => {
      expect(overlap({ from: '', to: '08:00' }, { from: '07:00', to: '09:00' })).toBe(false);
    });

    it('names the first two that overlap, by their place', () => {
      expect(
        overlapping([
          { from: '06:00', to: '08:00' },
          { from: '10:00', to: '12:00' },
          { from: '11:00', to: '13:00' },
        ]),
      ).toEqual([1, 2]);
      expect(overlapping(RULE.periods)).toBeUndefined();
    });
  });

  describe('a whole rule, in the order of the service', () => {
    it('takes a valid one', () => {
      expect(ruleProblem(RULE)).toBeUndefined();
      expect(
        ruleProblem({
          autoOffEnabled: true,
          autoOffDelayMinutes: 15,
          motionOnEnabled: false,
          periods: [],
          manualHoldMinutes: 60,
        }),
      ).toBeUndefined();
    });

    it('refuses a switch left out - never read as off', () => {
      expect(ruleProblem(without('autoOffEnabled'))).toBe('lights.editor.problem.invalid');
    });

    it('wants the delay of an enabled rule, and keeps one of a rule that is off', () => {
      const rest = without('autoOffDelayMinutes');
      expect(ruleProblem(rest)).toBe('lights.editor.problem.minutesMissing');
      expect(ruleProblem({ ...rest, autoOffEnabled: false })).toBeUndefined();
    });

    it('wants the hold', () => {
      expect(ruleProblem(without('manualHoldMinutes'))).toBe(
        'lights.editor.problem.minutesMissing',
      );
    });

    it('refuses more than twelve periods, overlapping ones, and motion-on without one', () => {
      const periods = Array.from({ length: 13 }, (_, hour) => ({
        from: `${String(hour).padStart(2, '0')}:00`,
        to: `${String(hour).padStart(2, '0')}:30`,
      }));
      expect(ruleProblem({ ...RULE, periods })).toBe('lights.editor.problem.invalid');
      expect(
        ruleProblem({
          ...RULE,
          periods: [...RULE.periods, { from: '21:00', to: '23:00' }],
        }),
      ).toBe('lights.editor.problem.overlap');
      expect(ruleProblem({ ...RULE, periods: [] })).toBe('lights.editor.problem.noPeriod');
      expect(ruleProblem({ ...RULE, motionOnEnabled: false, periods: [] })).toBeUndefined();
    });

    it('refuses an rgb that is not three values 0 ... 255', () => {
      expect(
        ruleProblem({ ...RULE, periods: [{ from: '16:00', to: '22:00', rgb: [255, 0] as never }] }),
      ).toBe('lights.editor.problem.invalid');
      expect(
        ruleProblem({ ...RULE, periods: [{ from: '16:00', to: '22:00', rgb: [256, 0, 0] }] }),
      ).toBe('lights.editor.problem.invalid');
    });
  });

  describe('the room of a rule', () => {
    it('takes a room that has what the rule needs', () => {
      expect(roomProblem(RULE, ROOM)).toBeUndefined();
    });

    it('refuses a room without a light', () => {
      expect(roomProblem(RULE, { ...ROOM, lights: [] })).toBe('lights.editor.problem.noLight');
    });

    // the halls on Eaton PIRs stay with NetLinx (owner, HAS-262)
    it('refuses a room whose only sensors are Eaton PIRs, whatever the rule', () => {
      const eaton: RoomDevices = { ...ROOM, sensors: [{ kind: 'motion sensor', eaton: true }] };
      expect(eatonOnly(eaton)).toBe(true);
      expect(roomProblem({ ...RULE, autoOffEnabled: false, motionOnEnabled: false }, eaton)).toBe(
        'lights.editor.problem.eatonOnly',
      );
      // a room without any sensor is not one on Eaton PIRs
      expect(eatonOnly({ ...ROOM, sensors: [] })).toBe(false);
    });

    it('wants a sensor for auto-off and a motion sensor for motion-on', () => {
      const presence: RoomDevices = {
        ...ROOM,
        sensors: [{ kind: 'presence sensor', eaton: false }],
      };
      expect(roomProblem({ ...RULE, motionOnEnabled: false }, { ...ROOM, sensors: [] })).toBe(
        'lights.editor.problem.autoOffNoSensor',
      );
      expect(roomProblem(RULE, presence)).toBe('lights.editor.problem.motionOnNoSensor');
      // an Eaton PIR next to a presence sensor is not a motion sensor of the rules
      expect(
        roomProblem(RULE, {
          ...ROOM,
          sensors: [...presence.sensors, { kind: 'motion sensor', eaton: true }],
        }),
      ).toBe('lights.editor.problem.motionOnNoSensor');
    });

    it('wants a light that dims for a brightness, and an rgbw light for a colour', () => {
      expect(roomProblem(RULE, { ...ROOM, lights: [{ lightKind: 'relay' }] })).toBe(
        'lights.editor.problem.brightnessNoDimmer',
      );
      expect(roomProblem(RULE, { ...ROOM, lights: [{ lightKind: 'dimmer' }] })).toBe(
        'lights.editor.problem.colorNoRgbw',
      );
      expect(
        roomProblem(
          { ...RULE, periods: [{ from: '16:00', to: '22:00', white: 40 }] },
          { ...ROOM, lights: [{ lightKind: 'relay' }] },
        ),
      ).toBe('lights.editor.problem.colorNoRgbw');
    });
  });
});

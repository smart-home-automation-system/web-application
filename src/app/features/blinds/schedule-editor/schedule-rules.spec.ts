import { allSchedules, resetSchedules } from '../../../../mocks/schedules.fixtures';
import { BlindSchedule } from '../../../data-access/blinds/blind-schedule';
import {
  MAX_CONDITIONS,
  MAX_HOLD_MINUTES,
  MAX_NAME_CHARACTERS,
  MAX_OFFSET_MINUTES,
  MAX_TARGETS,
  METRIC_RANGES,
  MIN_NAME_CHARACTERS,
  boundsProblem,
  decimalOf,
  holdProblem,
  nameProblem,
  offsetProblem,
  scheduleProblem,
  targetsProblem,
  thresholdProblem,
  timeProblem,
  windowProblem,
} from './schedule-rules';

const VALID: BlindSchedule = {
  name: 'Evening close',
  enabled: true,
  dayType: 'any',
  window: { from: { kind: 'clock', time: '21:00' }, to: { kind: 'clock', time: '06:00' } },
  targets: [{ room: 'office' }, { deviceId: 7 }],
  conditions: [],
  action: 'close',
};

// a copy of ScheduleRules of blinds-service 0.8.x: a number changed there is changed here
describe('schedule rules', () => {
  it('pins the numbers of the service', () => {
    expect([
      MIN_NAME_CHARACTERS,
      MAX_NAME_CHARACTERS,
      MAX_OFFSET_MINUTES,
      MAX_HOLD_MINUTES,
      MAX_TARGETS,
      MAX_CONDITIONS,
    ]).toEqual([3, 60, 180, 120, 30, 10]);
    expect(METRIC_RANGES).toEqual({
      illuminance: { min: 0, max: 200_000, unit: 'lx' },
      'outside temperature': { min: -50, max: 60, unit: '°C' },
      'wind gust': { min: 0, max: 100, unit: 'm/s' },
      raining: null,
      'window closed': null,
    });
  });

  it('counts a name in characters, without the spaces at its ends', () => {
    expect(nameProblem('  ')).toBe('blinds.editor.problem.nameMissing');
    expect(nameProblem(' ab ')).toBe('blinds.editor.problem.nameLength');
    expect(nameProblem('abc')).toBeUndefined();
    // two characters of two units each: still two
    expect(nameProblem('🌅🌇')).toBe('blinds.editor.problem.nameLength');
    expect(nameProblem('x'.repeat(60))).toBeUndefined();
    expect(nameProblem('x'.repeat(61))).toBe('blinds.editor.problem.nameLength');
  });

  it('reads a time as hours and minutes', () => {
    expect(timeProblem('', true)).toBe('blinds.editor.problem.timeMissing');
    expect(timeProblem('', false)).toBeUndefined();
    expect(timeProblem('06:30', true)).toBeUndefined();
    expect(timeProblem('6:30', true)).toBe('blinds.editor.problem.timeInvalid');
    expect(timeProblem('24:00', true)).toBe('blinds.editor.problem.timeInvalid');
    expect(timeProblem('06:30:00', true)).toBe('blinds.editor.problem.timeInvalid');
  });

  it('moves the sun by whole minutes, at most three hours', () => {
    expect(offsetProblem('')).toBe('blinds.editor.problem.offsetMissing');
    expect(offsetProblem('-180')).toBeUndefined();
    expect(offsetProblem('181')).toBe('blinds.editor.problem.offsetRange');
    expect(offsetProblem('1.5')).toBe('blinds.editor.problem.wholeMinutes');
    // the field says plus is after
    expect(offsetProblem('+30')).toBeUndefined();
  });

  it('holds a condition 0 to 120 whole minutes', () => {
    expect(holdProblem('')).toBe('blinds.editor.problem.holdMissing');
    expect(holdProblem('0')).toBeUndefined();
    expect(holdProblem('120')).toBeUndefined();
    expect(holdProblem('121')).toBe('blinds.editor.problem.holdRange');
    expect(holdProblem('-1')).toBe('blinds.editor.problem.holdRange');
    expect(holdProblem('5,5')).toBe('blinds.editor.problem.wholeMinutes');
  });

  it('reads a threshold with a dot or a comma, one decimal, inside the range of its metric', () => {
    expect(decimalOf('21,5')).toBe(21.5);
    expect(decimalOf('abc')).toBeUndefined();
    expect(thresholdProblem('', 'illuminance')).toBe('blinds.editor.problem.thresholdMissing');
    expect(thresholdProblem('lots', 'illuminance')).toBe('blinds.editor.problem.thresholdNumber');
    expect(thresholdProblem('21.55', 'outside temperature')).toBe(
      'blinds.editor.problem.thresholdDecimal',
    );
    // trailing zeros are no decimals, as for the service's BigDecimal
    expect(thresholdProblem('21.50', 'outside temperature')).toBeUndefined();
    expect(thresholdProblem('-50', 'outside temperature')).toBeUndefined();
    expect(thresholdProblem('-50.1', 'outside temperature')).toBe(
      'blinds.editor.problem.thresholdRange',
    );
    expect(thresholdProblem('200001', 'illuminance')).toBe('blinds.editor.problem.thresholdRange');
  });

  it('wants the latest after the earliest', () => {
    expect(boundsProblem('07:00', '09:00')).toBeUndefined();
    expect(boundsProblem('09:00', '09:00')).toBe('blinds.editor.problem.latestBeforeEarliest');
    expect(boundsProblem('', '09:00')).toBeUndefined();
  });

  it('refuses a window of one clock time - and nothing of a time of the sun', () => {
    const clock = (time: string) => ({ kind: 'clock', time });
    expect(windowProblem(clock('07:00'), clock('07:00'))).toBe('blinds.editor.problem.windowEmpty');
    expect(windowProblem(clock('21:00'), clock('06:00'))).toBeUndefined();
    expect(windowProblem(clock(''), clock(''))).toBeUndefined();
    expect(windowProblem({ kind: 'sunset', offsetMinutes: 0 }, clock('07:00'))).toBeUndefined();
  });

  it('wants one to thirty targets', () => {
    expect(targetsProblem(0)).toBe('blinds.editor.problem.targetsMissing');
    expect(targetsProblem(30)).toBeUndefined();
    expect(targetsProblem(31)).toBe('blinds.editor.problem.targetsTooMany');
  });

  describe('of a whole schedule (the mock API)', () => {
    it('takes every schedule of the mock blinds', () => {
      resetSchedules();
      for (const schedule of allSchedules()) {
        // the id is the service's, never part of a body
        expect(scheduleProblem({ ...schedule, id: undefined }), schedule.name).toBeUndefined();
      }
    });

    it.each<[string, BlindSchedule]>([
      ['a name with a space at its end', { ...VALID, name: 'Evening ' }],
      ['no enabled', { ...VALID, enabled: undefined }],
      ['a day type it does not know', { ...VALID, dayType: 'holiday' }],
      [
        'a clock time with an offset',
        {
          ...VALID,
          window: {
            from: { kind: 'clock', time: '21:00', offsetMinutes: 5 },
            to: VALID.window?.to,
          },
        },
      ],
      [
        'a sun time with a time',
        {
          ...VALID,
          window: {
            from: { kind: 'sunset', time: '21:00', offsetMinutes: 0 },
            to: VALID.window?.to,
          },
        },
      ],
      ['a target of both kinds', { ...VALID, targets: [{ room: 'office', deviceId: 7 }] }],
      ['a target listed twice', { ...VALID, targets: [{ deviceId: 7 }, { deviceId: 7 }] }],
      ['no list of conditions', { ...VALID, conditions: undefined }],
      [
        'a truth with a threshold',
        {
          ...VALID,
          conditions: [
            { metric: 'raining', operator: 'is', value: true, threshold: 1, holdMinutes: 0 },
          ],
        },
      ],
      [
        'a number compared with is',
        {
          ...VALID,
          conditions: [{ metric: 'illuminance', operator: 'is', value: true, holdMinutes: 0 }],
        },
      ],
      ['a position for open', { ...VALID, action: 'open', position: 50 }],
      ['no position for position', { ...VALID, action: 'position' }],
    ])('refuses %s', (_case, schedule) => {
      expect(scheduleProblem(schedule)).toBeDefined();
    });

    it('takes a position and a night', () => {
      expect(scheduleProblem({ ...VALID, action: 'position', position: 0 })).toBeUndefined();
      expect(
        scheduleProblem({
          ...VALID,
          conditions: [
            { metric: 'illuminance', operator: 'lt', threshold: 120.5, holdMinutes: 10 },
            { metric: 'window closed', operator: 'is', value: true, holdMinutes: 0 },
          ],
        }),
      ).toBeUndefined();
    });
  });
});

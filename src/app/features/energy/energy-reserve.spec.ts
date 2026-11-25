import {
  RESERVE_LEVEL,
  heldLevel,
  houseNow,
  levelValid,
  needsQuestion,
  reserveBody,
  reserveProblem,
  tomorrowEvening,
  untilFor,
  workModeOf,
  writeStateLabel,
} from './energy-reserve';

const ZONE = 'Europe/Warsaw';
// 2026-11-24 23:09 of the house (CET)
const NOW = Date.parse('2026-11-24T22:09:30Z');
const NOW_WALL = '2026-11-24T23:09:00';

// a copy of ReserveRules of energy-service (HAS-494): the cases of its test
describe('the rules of the battery reserve', () => {
  it('takes a level from 10 to 100 in steps of 5', () => {
    expect(RESERVE_LEVEL).toEqual({ min: 10, max: 100, step: 5 });
    expect([10, 15, 80, 100].every(levelValid)).toBe(true);
    expect([5, 83, 105, 80.5, Number.NaN].some(levelValid)).toBe(false);
  });

  it('refuses a level out of its rules first', () => {
    expect(reserveProblem(true, 83, null, NOW_WALL)).toBe('level');
    expect(reserveProblem(false, 105, null, NOW_WALL)).toBe('level');
  });

  it('takes an end only after now and at most 7 days ahead', () => {
    expect(reserveProblem(true, 80, null, NOW_WALL)).toBeUndefined();
    expect(reserveProblem(true, 80, '2026-11-25T18:00:00', NOW_WALL)).toBeUndefined();
    expect(reserveProblem(true, 80, '2026-12-01T23:09:00', NOW_WALL)).toBeUndefined();
    expect(reserveProblem(true, 80, '2026-12-01T23:10:00', NOW_WALL)).toBe('untilTooFar');
    expect(reserveProblem(true, 80, NOW_WALL, NOW_WALL)).toBe('untilPast');
    expect(reserveProblem(true, 80, '2026-11-24T22:00:00', NOW_WALL)).toBe('untilPast');
    expect(reserveProblem(true, 80, undefined, NOW_WALL)).toBe('untilMissing');
  });

  it('asks nothing of the end of a reserve switched off', () => {
    expect(reserveProblem(false, 80, undefined, NOW_WALL)).toBeUndefined();
    expect(reserveBody(false, 80, '2026-11-25T18:00:00')).toEqual({ enabled: false, level: 80 });
    expect(reserveBody(true, 80, null)).toEqual({ enabled: true, level: 80 });
    expect(reserveBody(true, 80, '2026-11-25T18:00:00')).toEqual({
      enabled: true,
      level: 80,
      until: '2026-11-25T18:00:00',
    });
  });

  it('reads the times on the wall clock of the house', () => {
    expect(houseNow(NOW, ZONE)).toBe(NOW_WALL);
    expect(tomorrowEvening(NOW, ZONE)).toBe('2026-11-25T18:00:00');
    expect(untilFor('none', '', NOW, ZONE)).toBeNull();
    expect(untilFor('tomorrow', '', NOW, ZONE)).toBe('2026-11-25T18:00:00');
    expect(untilFor('date', '2026-11-26T07:30', NOW, ZONE)).toBe('2026-11-26T07:30:00');
    expect(untilFor('date', '', NOW, ZONE)).toBeUndefined();
  });
});

describe('the question before a write of the reserve', () => {
  const on80 = { enabled: true, level: 80, writeState: 'taken' };

  it('asks before switching on or raising the level - both charge from the grid', () => {
    expect(needsQuestion({ enabled: false, level: 80 }, { enabled: true, level: 80 })).toBe(true);
    expect(needsQuestion(on80, { enabled: true, level: 90 })).toBe(true);
    expect(needsQuestion(undefined, { enabled: true, level: 50 })).toBe(true);
    expect(needsQuestion({ enabled: true }, { enabled: true, level: 50 })).toBe(true);
  });

  it('sends a lower level, another end or the switch off at once', () => {
    expect(needsQuestion(on80, { enabled: true, level: 60 })).toBe(false);
    expect(needsQuestion(on80, { enabled: true, level: 80, until: '2026-11-25T18:00:00' })).toBe(
      false,
    );
    expect(needsQuestion(on80, { enabled: false, level: 80 })).toBe(false);
  });
});

describe('what the card tells of the reserve', () => {
  it('draws the level only while the reserve is on and its level known', () => {
    expect(heldLevel({ enabled: true, level: 80 })).toBe(80);
    expect(heldLevel({ enabled: false, level: 80 })).toBeUndefined();
    expect(heldLevel({ enabled: true })).toBeUndefined();
    expect(heldLevel(null)).toBeUndefined();
  });

  it('words what became of the last write, a word it does not know as it came', () => {
    expect(writeStateLabel({ writeState: 'sent' })).toEqual({ key: 'energy.reserve.write.sent' });
    expect(writeStateLabel({ writeState: 'failed' })).toEqual({
      key: 'energy.reserve.write.failed',
    });
    expect(writeStateLabel({ writeState: 'lost' })).toEqual({ literal: 'lost' });
    expect(writeStateLabel({})).toEqual({ key: 'energy.notKnown' });
  });

  // HAS-496 (owner 2026-11-25): the work mode as the energy service set it
  it('tells the work mode: a charge first, then the reserve in Back Up, then Self Use', () => {
    const reserve = { enabled: true, level: 80, until: '2026-11-25T18:00:00' };
    expect(
      workModeOf({ active: true, run: { state: 'charging', targetSoc: 90 } }, reserve),
    ).toEqual({
      kind: 'charging',
      target: 90,
    });
    expect(workModeOf({ active: true, run: { state: 'ended' } }, reserve)).toEqual({
      kind: 'backUp',
      level: 80,
      until: '2026-11-25T18:00:00',
    });
    expect(workModeOf({ active: false }, { enabled: false, level: 80 })).toEqual({
      kind: 'selfUse',
    });
    expect(workModeOf(undefined, undefined)).toEqual({ kind: 'notKnown' });
    expect(workModeOf(undefined, {})).toEqual({ kind: 'notKnown' });
  });
});

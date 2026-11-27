import {
  RESERVE_LEVEL,
  floorBelow,
  heldLevel,
  houseNow,
  levelValid,
  needsQuestion,
  reserveBody,
  reserveProblem,
  shownModeOf,
  tomorrowEvening,
  toppingUpTo,
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

// HAS-519: what the inverter runs, read from its dongle - the mode the service wrote only while it is not read
describe('the mode of the inverter as the page tells it', () => {
  const read = { minSoc: 75, chargeTo: 80, readAt: '2026-11-27T18:28:00' };

  it('tells the mode the inverter reads, Back Up with its floor and the level it charges to', () => {
    const reserve = { enabled: true, level: 80, inverter: { workMode: 'back up', ...read } };
    expect(shownModeOf(undefined, reserve)).toEqual({
      kind: 'backUp',
      text: { key: 'energy.workMode.real.backUp', params: { minSoc: 75 } },
      real: true,
      readAt: '2026-11-27T18:28:00',
      chargeTo: 80,
      charging: undefined,
    });
  });

  it('words every mode of the service and prints one it does not know as it came', () => {
    const mode = (workMode: string) =>
      shownModeOf(undefined, { enabled: false, inverter: { workMode, ...read } });
    expect(mode('self use')).toMatchObject({
      kind: 'selfUse',
      text: { key: 'energy.workMode.selfUse' },
      chargeTo: undefined,
    });
    expect(mode('feed-in priority')).toMatchObject({
      kind: 'feedIn',
      text: { key: 'energy.workMode.real.feedIn' },
    });
    expect(mode('other')).toMatchObject({
      kind: 'other',
      text: { key: 'energy.workMode.real.other' },
    });
    expect(mode('peak shaving')).toMatchObject({
      kind: 'other',
      text: { literal: 'peak shaving' },
    });
    // a Back Up without its floor read
    expect(shownModeOf(undefined, { inverter: { workMode: 'back up' } }).text).toEqual({
      key: 'energy.workMode.real.backUp',
      params: { minSoc: '?' },
    });
  });

  it('tells a charge from the grid going on beside the mode the inverter reads', () => {
    const charge = { active: true, run: { state: 'charging', targetSoc: 90 } };
    const reserve = { enabled: false, inverter: { workMode: 'self use' } };
    expect(shownModeOf(charge, reserve)).toMatchObject({
      kind: 'selfUse',
      real: true,
      charging: 90,
    });
    expect(shownModeOf({ active: true, run: { state: 'requested' } }, reserve).charging).toBe('?');
  });

  it('reads the settings of /status while the reserve carries none', () => {
    expect(shownModeOf(undefined, { enabled: false }, { workMode: 'self use' })).toMatchObject({
      kind: 'selfUse',
      real: true,
    });
  });

  it('falls back to the mode the service wrote, labelled as not read', () => {
    expect(
      shownModeOf(undefined, { enabled: true, level: 80, until: '2026-11-28T18:00:00' }),
    ).toEqual({
      kind: 'backUp',
      text: { key: 'energy.workMode.backUp', params: { level: 80 } },
      real: false,
      until: '2026-11-28T18:00:00',
    });
    expect(
      shownModeOf({ active: true, run: { state: 'charging', targetSoc: 90 } }, { enabled: false }),
    ).toEqual({
      kind: 'charging',
      text: { key: 'energy.workMode.charging', params: { target: 90 } },
      real: false,
    });
    expect(shownModeOf(undefined, { enabled: false })).toEqual({
      kind: 'selfUse',
      text: { key: 'energy.workMode.selfUse' },
      real: false,
    });
    expect(shownModeOf(undefined, undefined)).toEqual({
      kind: 'notKnown',
      text: { key: 'energy.notKnown' },
      real: false,
    });
  });
});

describe('the reserve the inverter does not hold', () => {
  it('gives both numbers while the service says the floor is below the level', () => {
    expect(
      floorBelow({ enabled: true, level: 80, floorBelowLevel: true, inverter: { minSoc: 75 } }),
    ).toEqual({ minSoc: 75, level: 80 });
    expect(floorBelow({ enabled: true, floorBelowLevel: true })).toEqual({
      minSoc: '?',
      level: '?',
    });
  });

  it('says nothing while the floor is held, not known, or no reserve holds', () => {
    expect(floorBelow({ enabled: true, level: 80, floorBelowLevel: false })).toBeUndefined();
    expect(floorBelow({ enabled: true, level: 80, floorBelowLevel: null })).toBeUndefined();
    expect(floorBelow({ enabled: true, level: 80 })).toBeUndefined();
    expect(floorBelow({ enabled: false, level: 80, floorBelowLevel: true })).toBeUndefined();
    expect(floorBelow(undefined)).toBeUndefined();
  });
});

describe('the inverter topping the battery up to the reserve', () => {
  const reserve = { enabled: true, level: 80 };
  const charging = { direction: 'charging' };
  const importing = { direction: 'import' };

  it('tells the level while the reserve holds, the battery charges and the grid imports', () => {
    expect(toppingUpTo(reserve, { active: false }, charging, importing)).toBe(80);
    expect(toppingUpTo({ enabled: true }, undefined, charging, importing)).toBe('?');
  });

  it('says nothing for a charge of the service, without a reserve, or with anything not known', () => {
    const run = { active: true, run: { state: 'charging', targetSoc: 90 } };
    expect(toppingUpTo(reserve, run, charging, importing)).toBeUndefined();
    expect(
      toppingUpTo({ enabled: false, level: 80 }, undefined, charging, importing),
    ).toBeUndefined();
    expect(toppingUpTo(reserve, undefined, { direction: 'idle' }, importing)).toBeUndefined();
    expect(toppingUpTo(reserve, undefined, charging, { direction: 'export' })).toBeUndefined();
    expect(toppingUpTo(reserve, undefined, undefined, importing)).toBeUndefined();
    expect(toppingUpTo(reserve, undefined, charging, undefined)).toBeUndefined();
    // a reading the service marks stale says nothing of now
    expect(
      toppingUpTo(reserve, undefined, { ...charging, stale: true }, importing),
    ).toBeUndefined();
    expect(
      toppingUpTo(reserve, undefined, charging, { ...importing, stale: true }),
    ).toBeUndefined();
  });
});

import {
  automationApplies,
  decimalOf,
  outageScopeLabel,
  runEndLabel,
  runGoingOn,
  runSourceLabel,
  runStateLabel,
  untilOf,
  wholeOf,
  within,
} from './energy-charge';

// 14:45 in the house (winter time, UTC+1)
const NOW = Date.parse('2026-11-03T13:45:00Z');

describe('the charge of the battery (HAS-342)', () => {
  it('takes the end as the next such time of the house - today ahead, tomorrow behind', () => {
    expect(untilOf('18:30', NOW, 'Europe/Warsaw')).toBe('2026-11-03T18:30:00');
    expect(untilOf('06:00', NOW, 'Europe/Warsaw')).toBe('2026-11-04T06:00:00');
    expect(untilOf('14:45', NOW, 'Europe/Warsaw')).toBe('2026-11-04T14:45:00');
  });

  it('leaves the end to the estimate for an empty field, and refuses what is not a time', () => {
    expect(untilOf('  ', NOW, 'Europe/Warsaw')).toBeUndefined();
    expect(untilOf('25:00', NOW, 'Europe/Warsaw')).toBe('invalid');
    expect(untilOf('9:00', NOW, 'Europe/Warsaw')).toBe('invalid');
  });

  it('reads whole and decimal numbers as written, a comma for the point', () => {
    expect(wholeOf(' 80 ')).toBe(80);
    expect(wholeOf('80.5')).toBeUndefined();
    expect(decimalOf('4,5')).toBe(4.5);
    expect(decimalOf('4.5')).toBe(4.5);
    expect(decimalOf('-1')).toBeUndefined();
  });

  // copied from ChargeRules and AutomationRules of energy-service
  it('keeps the bounds of the service', () => {
    expect(within(wholeOf('10'), { min: 10, max: 100 })).toBe(true);
    expect(within(wholeOf('9'), { min: 10, max: 100 })).toBe(false);
    expect(within(decimalOf('8,1'), { min: 1, max: 8 })).toBe(false);
    expect(within(undefined, { min: 0, max: 720 })).toBe(false);
  });

  it('words a run, and prints a word it does not know as it came', () => {
    expect(runStateLabel({ state: 'charging' })).toEqual({ key: 'energy.charge.state.charging' });
    expect(runSourceLabel({ source: 'automation' })).toEqual({
      key: 'energy.charge.source.automation',
    });
    expect(runEndLabel({ endedBy: 'later' })).toEqual({ literal: 'later' });
    expect(runStateLabel(undefined)).toEqual({ key: 'energy.notKnown' });
    expect(outageScopeLabel({ scope: 'constructor' })).toEqual({ literal: 'constructor' });
  });

  it('knows which runs are still going on', () => {
    expect(runGoingOn({ state: 'requested' })).toBe(true);
    expect(runGoingOn({ state: 'ending' })).toBe(true);
    expect(runGoingOn({ state: 'ended' })).toBe(false);
    expect(runGoingOn(undefined)).toBe(false);
  });

  // owner, 2026-11-03: only a planned outage of the street of the house
  it('lets the automation charge for a planned outage of the street only', () => {
    expect(automationApplies({ id: 1, kind: 'planned', scope: 'street' })).toBe(true);
    expect(automationApplies({ id: 2, kind: 'planned', scope: 'town' })).toBe(false);
    expect(automationApplies({ id: 3, kind: 'unplanned', scope: 'street' })).toBe(false);
    expect(automationApplies({ kind: 'planned', scope: 'street' })).toBe(false);
  });
});

import { commandProblem, lowestTarget } from './aircon-command-rules';

// the cases of CommandRulesTest of aircon-service (HAS-382) - a rule changed there is changed here
describe('the rules of a command of an air conditioner', () => {
  const cooling = { mode: 'cool', targetTemperature: 24 };

  it('takes a target of 16 to 30 °C', () => {
    expect(commandProblem({ targetTemperature: 16 }, { mode: 'heat' })).toBeUndefined();
    expect(commandProblem({ targetTemperature: 30 }, cooling)).toBeUndefined();
    expect(commandProblem({ targetTemperature: 15 }, { mode: 'heat' })).toBe('targetRange');
    expect(commandProblem({ targetTemperature: 31 }, cooling)).toBe('targetRange');
  });

  it('never cools below 22 °C, judged against the mode and the target the unit will have', () => {
    expect(commandProblem({ targetTemperature: 21 }, cooling)).toBe('coolingMinimum');
    expect(commandProblem({ mode: 'cool' }, { mode: 'heat', targetTemperature: 20 })).toBe(
      'coolingMinimum',
    );
    expect(
      commandProblem({ mode: 'cool', targetTemperature: 22 }, { targetTemperature: 20 }),
    ).toBeUndefined();
    expect(commandProblem({ targetTemperature: 20 }, { mode: 'heat' })).toBeUndefined();
  });

  // a unit already below the minimum is raised by the guard of the service; its fan alone is no reason
  it('lets a change of the fan through on a unit below the minimum', () => {
    expect(
      commandProblem({ fanSpeed: 'high' }, { mode: 'cool', targetTemperature: 18 }),
    ).toBeUndefined();
  });

  it('refuses turbo and quiet in drying and the fan', () => {
    expect(commandProblem({ turbo: true }, { mode: 'dry' })).toBe('boostMode');
    expect(commandProblem({ quiet: true }, { mode: 'fan' })).toBe('boostMode');
    expect(commandProblem({ turbo: false }, { mode: 'fan' })).toBeUndefined();
    expect(
      commandProblem({ turbo: true, mode: 'cool' }, { mode: 'dry', targetTemperature: 24 }),
    ).toBeUndefined();
  });

  it('knows the lowest target of a mode', () => {
    expect(lowestTarget('cool')).toBe(22);
    expect(lowestTarget('heat')).toBe(16);
    expect(lowestTarget(undefined)).toBe(16);
  });
});

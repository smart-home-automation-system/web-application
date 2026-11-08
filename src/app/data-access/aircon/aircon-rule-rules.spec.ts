import { AirconRuleBody } from './aircon-api';
import { ruleProblem } from './aircon-rule-rules';

// the cases of RuleRulesTest of aircon-service (HAS-386) - a rule changed there is changed here
describe('the rules of a rule of an air conditioner', () => {
  const rule = (threshold: number, hysteresis: number, target: number): AirconRuleBody => ({
    keepBelow: { enabled: true, threshold, hysteresis, target },
    heatBySchedule: { enabled: false },
  });

  it('takes a threshold of 20 to 30 °C by 0.5', () => {
    expect(ruleProblem(rule(25, 1, 22))).toBeUndefined();
    expect(ruleProblem(rule(20, 1, 20))).toBe('target');
    expect(ruleProblem(rule(30, 1, 22))).toBeUndefined();
    expect(ruleProblem(rule(19.5, 1, 22))).toBe('threshold');
    expect(ruleProblem(rule(30.5, 1, 22))).toBe('threshold');
    expect(ruleProblem(rule(25.3, 1, 22))).toBe('threshold');
  });

  it('takes a hysteresis of 0.5 to 3 °C by 0.5', () => {
    expect(ruleProblem(rule(25, 0.5, 22))).toBeUndefined();
    expect(ruleProblem(rule(25, 3, 22))).toBeUndefined();
    expect(ruleProblem(rule(25, 0, 22))).toBe('hysteresis');
    expect(ruleProblem(rule(25, 3.5, 22))).toBe('hysteresis');
    expect(ruleProblem(rule(25, 1.2, 22))).toBe('hysteresis');
  });

  // the target of the cooling: 22 °C at least, a whole degree, never above the threshold
  it('takes a target of 22 to 30 °C in whole degrees, never above the threshold', () => {
    expect(ruleProblem(rule(25, 1, 25))).toBeUndefined();
    expect(ruleProblem(rule(25, 1, 21))).toBe('target');
    expect(ruleProblem(rule(25, 1, 22.5))).toBe('target');
    expect(ruleProblem(rule(24.5, 1, 25))).toBe('targetAboveThreshold');
    expect(ruleProblem(rule(21, 1, 22))).toBe('targetAboveThreshold');
  });
});

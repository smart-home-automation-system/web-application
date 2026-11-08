import { AirconRuleBody } from './aircon-api';
import { COOLING_MIN, TARGET_MAX } from './aircon-command-rules';

/**
 * A copy of `RuleRules` of `aircon-service` (HAS-386) - **a rule changed there is changed here**: the threshold
 * 20 to 30 °C by 0.5, the hysteresis 0.5 to 3 °C by 0.5 (1 when not given), the target a whole degree from the
 * minimum of cooling (22 °C) to 30 and never above the threshold.
 */
export const THRESHOLD_MIN = 20;
export const THRESHOLD_MAX = 30;
export const HYSTERESIS_MIN = 0.5;
export const HYSTERESIS_MAX = 3;
export const HYSTERESIS_DEFAULT = 1;
export const RULE_TARGET_MIN = COOLING_MIN;
export const RULE_TARGET_MAX = TARGET_MAX;

export type RuleProblem = 'threshold' | 'hysteresis' | 'target' | 'targetAboveThreshold';

/** Whether `value` lies in the range and on a step of 0.5. */
function byHalf(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max && Number.isInteger(value * 2);
}

/** What the service would refuse in a rule, or nothing. */
export function ruleProblem(body: AirconRuleBody): RuleProblem | undefined {
  const keepBelow = body.keepBelow;
  if (!byHalf(keepBelow.threshold, THRESHOLD_MIN, THRESHOLD_MAX)) {
    return 'threshold';
  }
  if (!byHalf(keepBelow.hysteresis, HYSTERESIS_MIN, HYSTERESIS_MAX)) {
    return 'hysteresis';
  }
  if (
    !Number.isInteger(keepBelow.target) ||
    keepBelow.target < RULE_TARGET_MIN ||
    keepBelow.target > RULE_TARGET_MAX
  ) {
    return 'target';
  }
  if (keepBelow.target > keepBelow.threshold) {
    return 'targetAboveThreshold';
  }
  return undefined;
}

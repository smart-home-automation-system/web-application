import { AirconCommand } from './aircon-api';

/**
 * A copy of `CommandRules` of `aircon-service` (HAS-382) - **a rule changed there is changed here**:
 * a target of 16 to 30 °C in whole degrees, **cooling never below 22 °C**, turbo and quiet not in
 * `dry` or `fan` - judged against the mode and the target the unit will have after the command.
 */
export const TARGET_MIN = 16;
export const TARGET_MAX = 30;
export const COOLING_MIN = 22;
/** The modes in which turbo and quiet are refused. */
export const NO_BOOST_MODES: readonly string[] = ['dry', 'fan'];

/** Why the service would refuse the command on a unit that now has `mode` and `target`, or nothing. */
export type CommandProblem = 'targetRange' | 'coolingMinimum' | 'boostMode';

export function commandProblem(
  command: AirconCommand,
  current: { readonly mode?: string; readonly targetTemperature?: number },
): CommandProblem | undefined {
  const mode = command.mode ?? current.mode;
  const target = command.targetTemperature ?? current.targetTemperature;
  if (
    command.targetTemperature !== undefined &&
    (command.targetTemperature < TARGET_MIN || command.targetTemperature > TARGET_MAX)
  ) {
    return 'targetRange';
  }
  if (
    (command.mode !== undefined || command.targetTemperature !== undefined) &&
    mode === 'cool' &&
    target !== undefined &&
    target < COOLING_MIN
  ) {
    return 'coolingMinimum';
  }
  if (
    (command.turbo === true || command.quiet === true) &&
    mode !== undefined &&
    NO_BOOST_MODES.includes(mode)
  ) {
    return 'boostMode';
  }
  return undefined;
}

/** The lowest target the unit takes in `mode`. */
export function lowestTarget(mode: string | undefined): number {
  return mode === 'cool' ? COOLING_MIN : TARGET_MIN;
}
